-- student_first_attendance respects RLS and reports the earliest date.
begin;
\ir setup/fixtures.sql

insert into public.attendance (student_id, class_id, service_date) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', '2026-03-01'),
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', '2026-01-04'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000c2', '2025-12-28');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.student_first_attendance) = 1, 'teacher A sees only own class in the view');
select pg_temp.assert(
  (select first_service_date from public.student_first_attendance
    where student_id = '00000000-0000-0000-0000-0000000005a1') = '2026-01-04',
  'first date is the earliest mark');
reset role;

set local role anon;
reset "request.jwt.claims";
do $$
begin
  perform 1 from public.student_first_attendance;
  raise exception 'ASSERTION FAILED: anon read the reporting view';
exception when insufficient_privilege then null;
end
$$;
reset role;

rollback;
