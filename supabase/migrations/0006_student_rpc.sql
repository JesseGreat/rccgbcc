-- 0006: the student-facing RPCs. These are the ONLY path by which anonymous
-- visitors reach the database (via the rate-limited Next.js API routes).
-- Idempotent.
--
-- Typed errors (SQLSTATE -> message), surfaced to the app as error.code:
--   AW001 WINDOW_CLOSED      attendance window is not open
--   AW002 CLASS_NOT_FOUND    class missing or inactive
--   AW003 STUDENT_NOT_FOUND  student missing or inactive (or class inactive)
--   AW004 INVALID_INPUT      bad argument; detail names the field
--   AW005 NAME_UNAVAILABLE   name belongs to a deactivated record in this class
--
-- Business outcomes that are not errors come back as jsonb with a "status":
--   marked | already_marked | created | possible_duplicate | device_limit_reached

create or replace function public.assert_attendance_open()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_attendance_open() then
    raise exception 'WINDOW_CLOSED'
      using errcode = 'AW001',
            detail  = public.attendance_window_state()::text,
            hint    = 'Attendance can only be marked during the Sunday School window.';
  end if;
end;
$$;

create or replace function public.normalize_device_hash(p_device_hash text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hash text := btrim(coalesce(p_device_hash, ''));
begin
  if v_hash !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'INVALID_INPUT'
      using errcode = 'AW004', detail = 'device_hash';
  end if;
  return v_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_classes(): active classes + window state. Never raises for a closed window.
-- ---------------------------------------------------------------------------
create or replace function public.get_classes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'church_name', (select s.church_name from public.app_settings s where s.id = 1),
    'window', public.attendance_window_state(),
    'classes', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description)
               order by c.name)
      from public.classes c
      where c.is_active
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- search_students(): at most 10 matches in one class, ranked. Queries shorter
-- than 2 characters return nothing, so the roster can't be listed wholesale.
-- ---------------------------------------------------------------------------
create or replace function public.search_students(p_class_id uuid, p_query text)
returns table (id uuid, full_name text, already_marked_today boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q    text := public.normalize_name(left(coalesce(p_query, ''), 100));
  v_date date;
begin
  perform public.assert_attendance_open();

  if not exists (select 1 from public.classes c where c.id = p_class_id and c.is_active) then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'AW002';
  end if;

  if char_length(v_q) < 2 then
    return;
  end if;

  v_date := public.current_service_date();

  return query
    select s.id,
           s.full_name,
           exists (
             select 1 from public.attendance a
             where a.student_id = s.id and a.service_date = v_date
           )
    from public.students s
    where s.class_id = p_class_id
      and s.is_active
      and (
        s.normalized_name like '%' || v_q || '%'
        or extensions.word_similarity(v_q, s.normalized_name) >= 0.4
        or extensions.similarity(v_q, s.normalized_name) >= 0.3
      )
    order by
      (s.normalized_name like v_q || '%' or s.normalized_name like '% ' || v_q || '%') desc,
      extensions.word_similarity(v_q, s.normalized_name) desc,
      extensions.similarity(v_q, s.normalized_name) desc,
      s.full_name
    limit 10;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared: device cap check. Returns null when under the cap, otherwise the
-- device_limit_reached payload (and writes the rejection to audit_log).
-- Caller must hold the per-device advisory lock.
-- ---------------------------------------------------------------------------
create or replace function public.check_device_cap(
  p_device_hash text,
  p_service_date date,
  p_class_id uuid,
  p_class_name text,
  p_student_id uuid,
  p_full_name text,
  p_via text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  select s.max_marks_per_device into v_limit from public.app_settings s where s.id = 1;
  v_limit := coalesce(v_limit, 4);

  select count(distinct a.student_id) into v_count
  from public.attendance a
  where a.service_date = p_service_date
    and a.device_hash = p_device_hash;

  if v_count < v_limit then
    return null;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    null,
    'attendance.device_limit_reached',
    'student',
    p_student_id,
    jsonb_build_object(
      'via', p_via,
      'device_hash', p_device_hash,
      'student_id', p_student_id,
      'full_name', p_full_name,
      'class_id', p_class_id,
      'class_name', p_class_name,
      'service_date', p_service_date,
      'limit', v_limit,
      'distinct_students_marked', v_count
    )
  );

  return jsonb_build_object(
    'status', 'device_limit_reached',
    'limit', v_limit,
    'student_id', p_student_id,
    'full_name', p_full_name,
    'class_id', p_class_id,
    'class_name', p_class_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_attendance(): idempotent self-mark, enforced device cap.
-- ---------------------------------------------------------------------------
create or replace function public.mark_attendance(p_student_id uuid, p_device_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash    text := public.normalize_device_hash(p_device_hash);
  v_student record;
  v_date    date;
  v_row     public.attendance;
  v_cap     jsonb;
begin
  perform public.assert_attendance_open();

  select s.id, s.full_name, s.class_id, c.name as class_name
    into v_student
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id and s.is_active and c.is_active;

  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'AW003';
  end if;

  v_date := public.current_service_date();

  -- Serialise marks from the same device so the cap can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('attendance-device:' || v_hash, 0));

  select * into v_row from public.attendance a
  where a.student_id = p_student_id and a.service_date = v_date;

  if not found then
    v_cap := public.check_device_cap(
      v_hash, v_date, v_student.class_id, v_student.class_name,
      v_student.id, v_student.full_name, 'mark_attendance');
    if v_cap is not null then
      return v_cap;
    end if;

    insert into public.attendance (student_id, class_id, service_date, source, device_hash)
    values (p_student_id, v_student.class_id, v_date, 'self', v_hash)
    on conflict (student_id, service_date) do nothing
    returning * into v_row;

    if found then
      return jsonb_build_object(
        'status', 'marked',
        'student_id', v_student.id,
        'full_name', v_student.full_name,
        'class_id', v_student.class_id,
        'class_name', v_student.class_name,
        'service_date', v_row.service_date,
        'marked_at', v_row.marked_at
      );
    end if;

    -- Lost a race with another device marking the same student.
    select * into v_row from public.attendance a
    where a.student_id = p_student_id and a.service_date = v_date;
  end if;

  return jsonb_build_object(
    'status', 'already_marked',
    'student_id', v_student.id,
    'full_name', v_student.full_name,
    'class_id', v_student.class_id,
    'class_name', v_student.class_name,
    'service_date', v_row.service_date,
    'marked_at', v_row.marked_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- add_student(): create + mark present in one transaction, with duplicate
-- detection. p_force skips the fuzzy check (never the exact-name check).
-- ---------------------------------------------------------------------------
create or replace function public.add_student(
  p_class_id    uuid,
  p_full_name   text,
  p_phone       text default null,
  p_device_hash text default null,
  p_force       boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash    text := public.normalize_device_hash(p_device_hash);
  v_name    text := public.clean_display_name(p_full_name);
  v_norm    text := public.normalize_name(p_full_name);
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_class   record;
  v_date    date;
  v_cap     jsonb;
  v_matches jsonb;
  v_student public.students;
  v_row     public.attendance;
begin
  if char_length(v_name) not between 2 and 100 or char_length(v_norm) < 2 then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'full_name';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{5,22}[0-9]$' then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'phone';
  end if;

  perform public.assert_attendance_open();

  select c.id, c.name into v_class
  from public.classes c
  where c.id = p_class_id and c.is_active;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'AW002';
  end if;

  v_date := public.current_service_date();

  perform pg_advisory_xact_lock(hashtextextended('attendance-device:' || v_hash, 0));
  -- Serialise creation of the same name in the same class.
  perform pg_advisory_xact_lock(hashtextextended('student-name:' || p_class_id::text || ':' || v_norm, 0));

  -- Exact name already registered in this class: never create, always offer it.
  select jsonb_agg(jsonb_build_object(
           'id', s.id,
           'full_name', s.full_name,
           'already_marked_today', exists (
             select 1 from public.attendance a
             where a.student_id = s.id and a.service_date = v_date),
           'score', 1
         ))
    into v_matches
  from public.students s
  where s.class_id = p_class_id and s.normalized_name = v_norm and s.is_active;

  if v_matches is not null then
    return jsonb_build_object('status', 'possible_duplicate', 'exact_match', true, 'matches', v_matches);
  end if;

  if exists (select 1 from public.students s
             where s.class_id = p_class_id and s.normalized_name = v_norm and not s.is_active) then
    raise exception 'NAME_UNAVAILABLE' using errcode = 'AW005';
  end if;

  if not coalesce(p_force, false) then
    select jsonb_agg(m order by m.score desc, m.full_name)
      into v_matches
    from (
      select s.id,
             s.full_name,
             exists (select 1 from public.attendance a
                     where a.student_id = s.id and a.service_date = v_date) as already_marked_today,
             round(extensions.similarity(s.normalized_name, v_norm)::numeric, 2) as score
      from public.students s
      where s.class_id = p_class_id
        and s.is_active
        and extensions.similarity(s.normalized_name, v_norm) > 0.55
      order by extensions.similarity(s.normalized_name, v_norm) desc
      limit 5
    ) m;

    if v_matches is not null then
      return jsonb_build_object('status', 'possible_duplicate', 'exact_match', false, 'matches', v_matches);
    end if;
  end if;

  -- Creating a new person means marking a new distinct student: check the cap.
  v_cap := public.check_device_cap(
    v_hash, v_date, v_class.id, v_class.name, null, v_name, 'add_student');
  if v_cap is not null then
    return v_cap;
  end if;

  insert into public.students (class_id, full_name, phone, created_by)
  values (p_class_id, v_name, v_phone, 'self')
  returning * into v_student;

  insert into public.attendance (student_id, class_id, service_date, source, device_hash)
  values (v_student.id, v_student.class_id, v_date, 'self', v_hash)
  returning * into v_row;

  return jsonb_build_object(
    'status', 'created',
    'student_id', v_student.id,
    'full_name', v_student.full_name,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'service_date', v_row.service_date,
    'marked_at', v_row.marked_at
  );
end;
$$;
