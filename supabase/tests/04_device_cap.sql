-- Device cap: enforced in the database, counts distinct students only,
-- logs every rejection, and never affects teacher marks.
begin;
\ir setup/fixtures.sql

select pg_temp.open_window();   -- max_marks_per_device = 4 from fixtures

set local role service_role;
reset "request.jwt.claims";
do $$
declare
  r jsonb;
  i int := 0;
  v_ids uuid[] := array[
    '00000000-0000-0000-0000-0000000005a1',
    '00000000-0000-0000-0000-0000000005a2',
    '00000000-0000-0000-0000-0000000005a3',
    '00000000-0000-0000-0000-0000000005a4'
  ]::uuid[];
  v_id uuid;
begin
  -- 4 distinct students from one device succeed.
  foreach v_id in array v_ids loop
    i := i + 1;
    r := public.mark_attendance(v_id, 'parent-phone-0000000001');
    perform pg_temp.assert(r ->> 'status' = 'marked', format('student %s of 4 -> marked, got %s', i, r));
  end loop;

  -- The 5th is rejected.
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a5', 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'device_limit_reached', '5th distinct student -> device_limit_reached, got ' || r::text);
  perform pg_temp.assert((r ->> 'limit')::int = 4, 'payload carries the limit');
  perform pg_temp.assert(r ->> 'full_name' = 'Emeka Obi', 'payload carries the student''s name for the teacher');
  perform pg_temp.assert(r ->> 'class_name' = 'Teens', 'payload carries the class name');

  -- Re-marking a student this device already marked is not blocked.
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a2', 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'already_marked', 're-mark of existing student -> already_marked, got ' || r::text);

  -- Still capped (the re-mark did not count).
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a5', 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'device_limit_reached', 'still capped after a re-mark');

  -- A student already marked by someone else is already_marked, not a cap rejection.
  perform public.mark_attendance('00000000-0000-0000-0000-0000000005a6', 'other-phone-00000000002');
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a6', 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'already_marked', 'capped device re-checking a marked student -> already_marked');

  -- add_student counts against the same cap and creates nothing when capped.
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Zainab Lawal', null, 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'device_limit_reached', 'add_student on capped device -> device_limit_reached, got ' || r::text);
  perform pg_temp.assert(r ->> 'full_name' = 'Zainab Lawal', 'add_student cap payload carries the attempted name');

  -- Another device is unaffected.
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a7', 'other-phone-00000000002');
  perform pg_temp.assert(r ->> 'status' = 'marked', 'a different device is not capped');
end
$$;
reset role;

select pg_temp.assert(
  not exists (select 1 from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a5'),
  'rejected mark wrote no attendance row');
select pg_temp.assert(
  not exists (select 1 from public.students where full_name = 'Zainab Lawal'),
  'rejected add_student created no student');
select pg_temp.assert(
  (select count(distinct student_id) from public.attendance where device_hash = 'parent-phone-0000000001') = 4,
  'device has exactly 4 distinct marks');

-- Every rejection is logged with device hash and attempted student.
select pg_temp.assert(
  (select count(*) from public.audit_log
    where action = 'attendance.device_limit_reached'
      and details ->> 'device_hash' = 'parent-phone-0000000001') = 3,
  'three rejections logged (two marks, one add)');
select pg_temp.assert(
  (select count(*) from public.audit_log
    where action = 'attendance.device_limit_reached'
      and entity_id = '00000000-0000-0000-0000-0000000005a5'
      and details ->> 'full_name' = 'Emeka Obi'
      and (details ->> 'limit')::int = 4) = 2,
  'mark rejections name the attempted student');
select pg_temp.assert(
  exists (select 1 from public.audit_log
    where action = 'attendance.device_limit_reached'
      and details ->> 'via' = 'add_student'
      and details ->> 'full_name' = 'Zainab Lawal'),
  'add_student rejection names the attempted student');

-- Teacher marks bypass the cap entirely.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
insert into public.attendance (student_id, class_id, device_hash)
values ('00000000-0000-0000-0000-0000000005a5', '00000000-0000-0000-0000-0000000000c1', 'parent-phone-0000000001');
reset role;

select pg_temp.assert(
  (select source = 'teacher' and device_hash is null from public.attendance
    where student_id = '00000000-0000-0000-0000-0000000005a5'),
  'teacher marked the capped student; row is source=teacher with no device hash');
select pg_temp.assert(
  (select count(distinct student_id) from public.attendance where device_hash = 'parent-phone-0000000001') = 4,
  'teacher mark did not count toward the device');

-- The cap is admin-editable and read live.
update public.app_settings set max_marks_per_device = 5 where id = 1;
set local role service_role;
reset "request.jwt.claims";
do $$
declare
  r jsonb;
begin
  r := public.mark_attendance('00000000-0000-0000-0000-0000000005a8', 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'marked', 'raising the cap to 5 allows a 5th student, got ' || r::text);
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Zainab Lawal', null, 'parent-phone-0000000001');
  perform pg_temp.assert(r ->> 'status' = 'device_limit_reached', '6th distinct student rejected at cap 5');
  perform pg_temp.assert((r ->> 'limit')::int = 5, 'payload reflects the new limit');
end
$$;
reset role;

rollback;
