-- 0010: the three Sunday School forms. Idempotent.
--
--   Students Registration Form   students.entry_date, controlled sex/age group,
--                                student_remarks (one teacher note per student per Sunday)
--   Class Attendance Register    unchanged data; new layout in the app
--   Teachers and Assistant       profiles.staff_title, teacher_attendance
--   Teachers Form
--
-- Self-registration (add_student) now requires phone, sex and age group.

-- ===========================================================================
-- students: entry date (set by the teacher) and controlled values.
-- Constraints are NOT VALID so any older free-text rows don't block the
-- migration; every new write is checked.
-- ===========================================================================
alter table public.students add column if not exists entry_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_gender_values') then
    alter table public.students
      add constraint students_gender_values check (gender is null or gender in ('male', 'female')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_age_group_values') then
    alter table public.students
      add constraint students_age_group_values check (age_group is null or age_group in ('adult', 'young_adult')) not valid;
  end if;
end
$$;

-- ===========================================================================
-- profiles: Teacher or Assistant Teacher. Several may share one class.
-- ===========================================================================
alter table public.profiles add column if not exists staff_title text not null default 'teacher';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_staff_title_check') then
    alter table public.profiles
      add constraint profiles_staff_title_check check (staff_title in ('teacher', 'assistant_teacher'));
  end if;
end
$$;

-- ===========================================================================
-- student_remarks: a teacher's note on a student for one Sunday.
-- Teachers may write them for their own class at any time.
-- ===========================================================================
create table if not exists public.student_remarks (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete restrict, -- set by trigger
  service_date date not null,
  remark       text not null,
  written_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint student_remarks_student_date_key unique (student_id, service_date),
  constraint student_remarks_remark_length check (char_length(btrim(remark)) between 1 and 500)
);

create index if not exists student_remarks_class_date_idx on public.student_remarks (class_id, service_date);

alter table public.student_remarks enable row level security;

create or replace function public.student_remarks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  select s.class_id into v_class_id from public.students s where s.id = new.student_id;
  if v_class_id is null then
    raise exception 'student % does not exist', new.student_id
      using errcode = 'foreign_key_violation';
  end if;
  if new.service_date > public.current_service_date() then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'service_date';
  end if;
  new.class_id   := v_class_id;
  new.remark     := btrim(new.remark);
  new.written_by := coalesce(auth.uid(), new.written_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_remarks_before_write on public.student_remarks;
create trigger student_remarks_before_write
  before insert or update on public.student_remarks
  for each row execute function public.student_remarks_before_write();

drop trigger if exists student_remarks_audit on public.student_remarks;
create trigger student_remarks_audit
  after insert or update or delete on public.student_remarks
  for each row execute function public.audit_row_change();

drop policy if exists student_remarks_select on public.student_remarks;
create policy student_remarks_select on public.student_remarks
  for select to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

drop policy if exists student_remarks_insert on public.student_remarks;
create policy student_remarks_insert on public.student_remarks
  for insert to authenticated
  with check ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

drop policy if exists student_remarks_update on public.student_remarks;
create policy student_remarks_update on public.student_remarks
  for update to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()))
  with check ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

drop policy if exists student_remarks_delete on public.student_remarks;
create policy student_remarks_delete on public.student_remarks
  for delete to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

-- ===========================================================================
-- Teachers may set the entry date on their own class's students, and nothing
-- else on the student row. Super admins keep full update rights (0004).
-- ===========================================================================
drop policy if exists students_teacher_update on public.students;
create policy students_teacher_update on public.students
  for update to authenticated
  using ((select public.is_teacher()) and class_id = (select public.current_profile_class_id()))
  with check ((select public.is_teacher()) and class_id = (select public.current_profile_class_id()));

create or replace function public.students_teacher_columns_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_profile_role() = 'teacher'
     and (new.full_name, new.class_id, new.phone, new.gender, new.age_group, new.is_active, new.created_by)
         is distinct from
         (old.full_name, old.class_id, old.phone, old.gender, old.age_group, old.is_active, old.created_by) then
    raise exception 'Teachers can only change the entry date.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists students_teacher_columns_guard on public.students;
create trigger students_teacher_columns_guard
  before update on public.students
  for each row execute function public.students_teacher_columns_guard();

-- ===========================================================================
-- teacher_attendance: the Teachers and Assistant Teachers Form.
-- A teacher marks themselves during the window, with an optional topic and
-- remarks. Everything locks when the window closes. Class and title are
-- snapshotted so history survives a reassignment.
-- ===========================================================================
create table if not exists public.teacher_attendance (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete restrict, -- set by trigger
  staff_title  text not null default 'teacher',                                 -- set by trigger
  service_date date not null,
  marked_at    timestamptz not null default now(),
  topic        text,
  remarks      text,
  source       text not null default 'self',
  constraint teacher_attendance_profile_date_key unique (profile_id, service_date),
  constraint teacher_attendance_title_check check (staff_title in ('teacher', 'assistant_teacher')),
  constraint teacher_attendance_source_check check (source in ('self', 'admin')),
  constraint teacher_attendance_topic_length check (topic is null or char_length(topic) <= 200),
  constraint teacher_attendance_remarks_length check (remarks is null or char_length(remarks) <= 500)
);

create index if not exists teacher_attendance_date_idx on public.teacher_attendance (service_date, class_id);

alter table public.teacher_attendance enable row level security;

create or replace function public.teacher_attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_role    text := public.current_profile_role();
begin
  new.topic   := nullif(btrim(coalesce(new.topic, '')), '');
  new.remarks := nullif(btrim(coalesce(new.remarks, '')), '');

  if tg_op = 'UPDATE' then
    -- Only the topic and remarks are editable; who/when/where never change.
    new.profile_id   := old.profile_id;
    new.class_id     := old.class_id;
    new.staff_title  := old.staff_title;
    new.service_date := old.service_date;
    new.marked_at    := old.marked_at;
    new.source       := old.source;
    return new;
  end if;

  select * into v_profile from public.profiles p where p.id = new.profile_id;
  if not found or v_profile.role <> 'teacher' or v_profile.class_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'profile_id';
  end if;

  new.class_id    := v_profile.class_id;
  new.staff_title := v_profile.staff_title;
  new.marked_at   := now();
  if v_role = 'super_admin' then
    new.source       := 'admin';
    new.service_date := coalesce(new.service_date, public.current_service_date());
  else
    new.source       := 'self';
    new.service_date := public.current_service_date();
  end if;
  return new;
end;
$$;

drop trigger if exists teacher_attendance_before_write on public.teacher_attendance;
create trigger teacher_attendance_before_write
  before insert or update on public.teacher_attendance
  for each row execute function public.teacher_attendance_before_write();

drop trigger if exists teacher_attendance_audit on public.teacher_attendance;
create trigger teacher_attendance_audit
  after insert or update or delete on public.teacher_attendance
  for each row execute function public.audit_row_change();

-- Teachers see only their own entries; the super admin sees everyone's.
drop policy if exists teacher_attendance_select on public.teacher_attendance;
create policy teacher_attendance_select on public.teacher_attendance
  for select to authenticated
  using ((select public.is_super_admin()) or ((select public.is_teacher()) and profile_id = (select auth.uid())));

drop policy if exists teacher_attendance_self_insert on public.teacher_attendance;
create policy teacher_attendance_self_insert on public.teacher_attendance
  for insert to authenticated
  with check (
    (select public.is_teacher())
    and profile_id = (select auth.uid())
    and service_date = (select public.current_service_date())
    and (select public.is_attendance_open())
  );

drop policy if exists teacher_attendance_self_update on public.teacher_attendance;
create policy teacher_attendance_self_update on public.teacher_attendance
  for update to authenticated
  using (
    (select public.is_teacher())
    and profile_id = (select auth.uid())
    and service_date = (select public.current_service_date())
    and (select public.is_attendance_open())
  )
  with check (profile_id = (select auth.uid()));

drop policy if exists teacher_attendance_self_delete on public.teacher_attendance;
create policy teacher_attendance_self_delete on public.teacher_attendance
  for delete to authenticated
  using (
    (select public.is_teacher())
    and profile_id = (select auth.uid())
    and service_date = (select public.current_service_date())
    and (select public.is_attendance_open())
  );

drop policy if exists teacher_attendance_admin_all on public.teacher_attendance;
create policy teacher_attendance_admin_all on public.teacher_attendance
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ===========================================================================
-- When a student moves class, their remarks move with them.
-- ===========================================================================
create or replace function public.students_after_class_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance set class_id = new.class_id where student_id = new.id;
  update public.student_flags set class_id = new.class_id where student_id = new.id;
  update public.student_remarks set class_id = new.class_id where student_id = new.id;
  return null;
end;
$$;

-- ===========================================================================
-- merge_students(): also carries remarks and the entry date across.
-- ===========================================================================
create or replace function public.merge_students(p_keep_id uuid, p_remove_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_keep    public.students;
  v_remove  public.students;
  v_moved   int;
  v_dropped int;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_keep_id is null or p_remove_id is null or p_keep_id = p_remove_id then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'student ids';
  end if;

  -- Lock in a stable order to avoid deadlocks between concurrent merges.
  perform 1 from public.students s
  where s.id in (p_keep_id, p_remove_id)
  order by s.id
  for update;

  select * into v_keep from public.students where id = p_keep_id;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'AW003', detail = 'keep';
  end if;
  select * into v_remove from public.students where id = p_remove_id;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'AW003', detail = 'remove';
  end if;

  update public.attendance a
     set student_id = p_keep_id
   where a.student_id = p_remove_id
     and not exists (
       select 1 from public.attendance k
       where k.student_id = p_keep_id and k.service_date = a.service_date
     );
  get diagnostics v_moved = row_count;

  delete from public.attendance where student_id = p_remove_id;
  get diagnostics v_dropped = row_count;

  -- Remarks: a Sunday only one record has moves across; a Sunday both have is joined.
  update public.student_remarks k
     set remark = left(k.remark || ' / ' || r.remark, 500)
    from public.student_remarks r
   where k.student_id = p_keep_id
     and r.student_id = p_remove_id
     and r.service_date = k.service_date;
  update public.student_remarks r
     set student_id = p_keep_id
   where r.student_id = p_remove_id
     and not exists (
       select 1 from public.student_remarks k
       where k.student_id = p_keep_id and k.service_date = r.service_date
     );

  update public.student_flags set student_id = p_keep_id where student_id = p_remove_id;

  update public.students
     set phone      = coalesce(v_keep.phone, v_remove.phone),
         gender     = coalesce(v_keep.gender, v_remove.gender),
         age_group  = coalesce(v_keep.age_group, v_remove.age_group),
         entry_date = least(v_keep.entry_date, v_remove.entry_date)
   where id = p_keep_id;

  delete from public.students where id = p_remove_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'students.merge',
    'students',
    p_keep_id,
    jsonb_build_object(
      'kept', to_jsonb(v_keep),
      'removed', to_jsonb(v_remove),
      'attendance_moved', v_moved,
      'attendance_dropped_as_duplicate_days', v_dropped
    )
  );

  return jsonb_build_object(
    'status', 'merged',
    'kept_id', p_keep_id,
    'removed_id', p_remove_id,
    'attendance_moved', v_moved,
    'attendance_dropped_as_duplicate_days', v_dropped
  );
end;
$$;

-- ===========================================================================
-- add_student(): the Registration Form. Name, phone, sex and age group are
-- all required. Replaces the 0006 version (which took no sex/age group).
-- ===========================================================================
drop function if exists public.add_student(uuid, text, text, text, boolean);

create or replace function public.add_student(
  p_class_id    uuid,
  p_full_name   text,
  p_phone       text,
  p_gender      text,
  p_age_group   text,
  p_device_hash text,
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
  v_gender  text := lower(btrim(coalesce(p_gender, '')));
  v_age     text := lower(btrim(coalesce(p_age_group, '')));
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
  if v_phone is null or v_phone !~ '^\+?[0-9][0-9 ()-]{5,22}[0-9]$' then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'phone';
  end if;
  if v_gender not in ('male', 'female') then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'gender';
  end if;
  if v_age not in ('adult', 'young_adult') then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'age_group';
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

  insert into public.students (class_id, full_name, phone, gender, age_group, created_by)
  values (p_class_id, v_name, v_phone, v_gender, v_age, 'self')
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

-- ===========================================================================
-- Privileges for everything above.
-- ===========================================================================
revoke all on table public.student_remarks, public.teacher_attendance from anon, authenticated;
grant select, insert, update, delete on table public.student_remarks, public.teacher_attendance to authenticated;
grant all on table public.student_remarks, public.teacher_attendance to service_role;

revoke all on function
  public.student_remarks_before_write(),
  public.students_teacher_columns_guard(),
  public.teacher_attendance_before_write(),
  public.students_after_class_change(),
  public.merge_students(uuid, uuid),
  public.add_student(uuid, text, text, text, text, text, boolean)
from public, anon, authenticated;

grant execute on function public.merge_students(uuid, uuid) to authenticated;
grant execute on function public.add_student(uuid, text, text, text, text, text, boolean) to service_role;
