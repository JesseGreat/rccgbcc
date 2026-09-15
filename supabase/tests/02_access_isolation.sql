-- Teacher class isolation (RLS) and zero anonymous table access.
begin;
\ir setup/fixtures.sql

select pg_temp.open_window();

-- Some attendance in both classes: today and a past Sunday.
insert into public.attendance (student_id, class_id, service_date, source) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', public.current_service_date(), 'self'),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1', public.current_service_date() - 7, 'self'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000c2', public.current_service_date(), 'self'),
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000000c2', public.current_service_date() - 7, 'self');

-- ===========================================================================
-- Teacher A (Teens) sees only Teens.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

select pg_temp.assert((select count(*) from public.students) = 9, 'teacher A sees all 9 Teens students (incl. inactive) and nothing else');
select pg_temp.assert((select count(*) from public.students where class_id = '00000000-0000-0000-0000-0000000000c2') = 0,
  'teacher A sees no Men students when filtering by their class id');
select pg_temp.assert((select count(*) from public.students where id = '00000000-0000-0000-0000-0000000005b1') = 0,
  'teacher A cannot fetch a Men student by guessing the id');
select pg_temp.assert((select count(*) from public.attendance) = 2, 'teacher A sees only Teens attendance');
select pg_temp.assert((select count(*) from public.attendance where student_id = '00000000-0000-0000-0000-0000000005b1') = 0,
  'teacher A cannot read Men attendance by student id');
select pg_temp.assert((select count(*) from public.classes) = 1, 'teacher A sees exactly one class');
select pg_temp.assert((select name from public.classes) = 'Teens', 'and it is their own');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'teacher A sees only their own profile');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'teacher A cannot read the audit log');
select pg_temp.assert((select count(*) from public.app_settings) = 1, 'teacher A can read settings (for the window)');

do $$
declare
  n int;
begin
  -- Insert attendance for another class's student: rejected.
  begin
    insert into public.attendance (student_id, class_id) values
      ('00000000-0000-0000-0000-0000000005b3', '00000000-0000-0000-0000-0000000000c2');
    raise exception 'ASSERTION FAILED: teacher A marked a Men student';
  exception when insufficient_privilege then null;
  end;

  -- ...even when lying about the class id (the trigger derives it from the student).
  begin
    insert into public.attendance (student_id, class_id) values
      ('00000000-0000-0000-0000-0000000005b3', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'ASSERTION FAILED: teacher A marked a Men student with a spoofed class_id';
  exception when insufficient_privilege then null;
  end;

  -- Delete another class's attendance: silently affects nothing.
  delete from public.attendance where student_id = '00000000-0000-0000-0000-0000000005b1';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot delete Men attendance');

  -- Delete own class's *past* attendance: not allowed (corrections are admin-only).
  delete from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a2';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot delete past attendance');

  -- No updates to attendance at all.
  update public.attendance set service_date = service_date - 1;
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot update attendance');

  -- Students are read-only for teachers.
  update public.students set full_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000005a3';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot update students');
  begin
    insert into public.students (class_id, full_name) values ('00000000-0000-0000-0000-0000000000c1', 'Sneaky Add');
    raise exception 'ASSERTION FAILED: teacher A inserted a student';
  exception when insufficient_privilege then null;
  end;

  -- Cannot flag another class's student.
  begin
    insert into public.student_flags (student_id, class_id, reason) values
      ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000000c1', 'looks wrong');
    raise exception 'ASSERTION FAILED: teacher A flagged a Men student';
  exception when insufficient_privilege then null;
  end;

  -- Cannot change their own role or class.
  update public.profiles set role = 'super_admin', class_id = null
   where id = '00000000-0000-0000-0000-00000000a002';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot promote themselves');

  -- Cannot edit settings.
  update public.app_settings set max_marks_per_device = 50;
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot change settings');

  -- Admin-only and service-only functions.
  begin
    perform public.merge_students('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a2');
    raise exception 'ASSERTION FAILED: teacher A merged students';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.search_students('00000000-0000-0000-0000-0000000000c2', 'segun');
    raise exception 'ASSERTION FAILED: teacher A called search_students directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.rate_limits;
    raise exception 'ASSERTION FAILED: teacher A read rate_limits';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Own class, today, window open: allowed; source/device_hash cannot be spoofed.
insert into public.attendance (student_id, class_id, source, device_hash) values
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000000c1', 'self', 'spoofed-device-hash-000');
select pg_temp.assert(
  (select source = 'teacher' and device_hash is null from public.attendance
    where student_id = '00000000-0000-0000-0000-0000000005a3'),
  'teacher mark is stamped source=teacher with no device hash');

-- Teacher can flag their own student.
insert into public.student_flags (student_id, class_id, reason) values
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000000c1', 'Duplicate of Amaka Eze?');
select pg_temp.assert((select count(*) from public.student_flags) = 1, 'teacher A flagged own student');

reset role;

-- ===========================================================================
-- Teacher B (Men) sees only Men, and not teacher A's flag.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.students) = 3, 'teacher B sees only the 3 Men students');
select pg_temp.assert((select count(*) from public.attendance) = 2, 'teacher B sees only Men attendance');
select pg_temp.assert((select count(*) from public.student_flags) = 0, 'teacher B cannot see Teens flags');
reset role;

-- ===========================================================================
-- A deactivated teacher sees nothing.
-- ===========================================================================
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-00000000a003';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.students) = 0, 'deactivated teacher sees no students');
select pg_temp.assert((select count(*) from public.classes) = 0, 'deactivated teacher sees no classes');
reset role;

-- A signed-in user with no profile at all sees nothing.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000ffff","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.students) = 0, 'profile-less user sees no students');
select pg_temp.assert((select count(*) from public.attendance) = 0, 'profile-less user sees no attendance');
reset role;

-- ===========================================================================
-- Super admin sees everything.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.students) = 12, 'admin sees all students');
select pg_temp.assert((select count(*) from public.classes) = 3, 'admin sees all classes incl. inactive');
select pg_temp.assert((select count(*) from public.attendance) = 5, 'admin sees all attendance');
select pg_temp.assert((select count(*) from public.profiles) = 3, 'admin sees all profiles');
reset role;

-- ===========================================================================
-- anon: no table access and no function access whatsoever.
-- ===========================================================================
set local role anon;
reset "request.jwt.claims";
do $$
declare
  t text;
begin
  foreach t in array array['classes', 'profiles', 'students', 'attendance', 'app_settings',
                           'audit_log', 'student_flags', 'rate_limits'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'ASSERTION FAILED: anon can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.attendance (student_id, class_id) values
      ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'ASSERTION FAILED: anon inserted attendance';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.get_classes();
    raise exception 'ASSERTION FAILED: anon called get_classes directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_attendance('00000000-0000-0000-0000-0000000005a1', 'device-aaaaaaaaaaaaaaaa');
    raise exception 'ASSERTION FAILED: anon called mark_attendance directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.search_students('00000000-0000-0000-0000-0000000000c1', 'chidi');
    raise exception 'ASSERTION FAILED: anon called search_students directly';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
