-- 0007: super-admin and server-side utility functions. Idempotent.

-- ---------------------------------------------------------------------------
-- merge_students(): fold p_remove_id into p_keep_id. Attendance history moves
-- across (a day both records were marked collapses to one row), flags move,
-- blank contact fields are filled from the removed record, and the removed
-- record is deleted. One summary entry lands in audit_log.
-- ---------------------------------------------------------------------------
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

  update public.student_flags set student_id = p_keep_id where student_id = p_remove_id;

  update public.students
     set phone     = coalesce(v_keep.phone, v_remove.phone),
         gender    = coalesce(v_keep.gender, v_remove.gender),
         age_group = coalesce(v_keep.age_group, v_remove.age_group)
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

-- ---------------------------------------------------------------------------
-- hit_rate_limit(): fixed-window counter. Called by API routes (service role)
-- with a key such as 'mark:203.0.113.7'. Returns whether this hit is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_hits   int;
begin
  if p_key is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_INPUT' using errcode = 'AW004', detail = 'rate limit arguments';
  end if;

  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, bucket, hits)
  values (left(p_key, 200), v_bucket, 1)
  on conflict (key, bucket) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup of stale buckets.
  if random() < 0.01 then
    delete from public.rate_limits where bucket < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_max,
    'hits', v_hits,
    'limit', p_max,
    'reset_at', v_bucket + make_interval(secs => p_window_seconds)
  );
end;
$$;
