-- Merge duplicates, moving a student between classes, and staff-change auditing.
begin;
\ir setup/fixtures.sql

-- History: a1 (keep) attended D-14, D-7. a4 (remove) attended D-7, D-21.
insert into public.attendance (student_id, class_id, service_date) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', current_date - 14),
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', current_date - 7),
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000000c1', current_date - 7),
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000000c1', current_date - 21);
update public.students set phone = '08030000000' where id = '00000000-0000-0000-0000-0000000005a4';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

do $$
declare
  r jsonb;
begin
  r := public.merge_students('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a4');
  perform pg_temp.assert(r ->> 'status' = 'merged', 'merge succeeded');
  perform pg_temp.assert((r ->> 'attendance_moved')::int = 1, 'one non-overlapping day moved');
  perform pg_temp.assert((r ->> 'attendance_dropped_as_duplicate_days')::int = 1, 'one overlapping day collapsed');

  begin
    perform public.merge_students('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a1');
    raise exception 'ASSERTION FAILED: merged a student into itself';
  exception when sqlstate 'AW004' then null;
  end;
end
$$;
reset role;

select pg_temp.assert(not exists (select 1 from public.students where id = '00000000-0000-0000-0000-0000000005a4'),
  'removed record is gone');
select pg_temp.assert(
  (select array_agg(service_date order by service_date) from public.attendance
    where student_id = '00000000-0000-0000-0000-0000000005a1')
  = array[current_date - 21, current_date - 14, current_date - 7],
  'kept record has the union of both histories');
select pg_temp.assert(
  (select phone from public.students where id = '00000000-0000-0000-0000-0000000005a1') = '08030000000',
  'blank phone filled from the removed record');
select pg_temp.assert(
  exists (select 1 from public.audit_log
    where action = 'students.merge'
      and actor_id = '00000000-0000-0000-0000-00000000a001'
      and entity_id = '00000000-0000-0000-0000-0000000005a1'
      and details -> 'removed' ->> 'full_name' = 'Amaka Eze'),
  'merge summary written to audit_log');

-- Move a student to another class: history follows, visibility follows.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
update public.students set class_id = '00000000-0000-0000-0000-0000000000c2'
 where id = '00000000-0000-0000-0000-0000000005a1';
reset role;

select pg_temp.assert(
  (select bool_and(class_id = '00000000-0000-0000-0000-0000000000c2') from public.attendance
    where student_id = '00000000-0000-0000-0000-0000000005a1'),
  'attendance class_id follows the student');
select pg_temp.assert(
  exists (select 1 from public.audit_log
    where action = 'students.update' and entity_id = '00000000-0000-0000-0000-0000000005a1'
      and details -> 'old' ->> 'class_id' = '00000000-0000-0000-0000-0000000000c1'
      and details -> 'new' ->> 'class_id' = '00000000-0000-0000-0000-0000000000c2'),
  'class move audited with old and new class');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select pg_temp.assert(
  (select count(*) from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a1') = 0,
  'old teacher no longer sees the moved student''s history');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select pg_temp.assert(
  (select count(*) from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a1') = 3,
  'new teacher sees the moved student''s full history');
reset role;

-- Settings and class changes by the admin are audited.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
update public.app_settings set max_marks_per_device = 6 where id = 1;
update public.classes set is_active = false where id = '00000000-0000-0000-0000-0000000000c2';
reset role;

select pg_temp.assert(exists (select 1 from public.audit_log where action = 'app_settings.update'), 'settings change audited');
select pg_temp.assert(exists (select 1 from public.audit_log where action = 'classes.update'
  and entity_id = '00000000-0000-0000-0000-0000000000c2'), 'class deactivation audited');

-- Deactivated class disappears for students but its history remains.
set local role service_role;
reset "request.jwt.claims";
select pg_temp.assert(
  not exists (select 1 from jsonb_array_elements(public.get_classes() -> 'classes') c
              where c ->> 'id' = '00000000-0000-0000-0000-0000000000c2'),
  'deactivated class hidden from students');
reset role;
select pg_temp.assert(
  (select count(*) from public.attendance where class_id = '00000000-0000-0000-0000-0000000000c2') = 3,
  'deactivated class keeps its history');

rollback;
