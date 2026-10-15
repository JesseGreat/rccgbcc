-- The three Sunday School forms: registration details, Sunday remarks,
-- entry dates, and the Teachers and Assistant Teachers Form.
begin;
\ir setup/fixtures.sql

select pg_temp.open_window();

-- An assistant teacher in Teens alongside Teacher A.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a004', 'assistant.a@test.local');
insert into public.profiles (id, full_name, email, role, class_id, staff_title) values
  ('00000000-0000-0000-0000-00000000a004', 'Assistant A', 'assistant.a@test.local', 'teacher',
   '00000000-0000-0000-0000-0000000000c1', 'assistant_teacher');

-- ===========================================================================
-- Registration: sex and age group are stored from self-registration.
-- ===========================================================================
set local role service_role;
do $$
declare
  r jsonb;
begin
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Grace Okon', '0803 555 0101', 'Female', 'Young_Adult',
                          'device-regregregregreg');
  perform pg_temp.assert(r ->> 'status' = 'created', 'registration -> created, got ' || r::text);
  perform pg_temp.assert(
    (select gender = 'female' and age_group = 'young_adult' and phone = '0803 555 0101' and entry_date is null
       from public.students where id = (r ->> 'student_id')::uuid),
    'sex/age group are normalised and stored; entry date starts blank');
end
$$;
reset role;

-- ===========================================================================
-- Teacher A: entry dates and remarks for their own class only.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

do $$
declare
  n int;
begin
  update public.students set entry_date = date '2026-01-11' where id = '00000000-0000-0000-0000-0000000005a1';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'teacher A can set an entry date in their class');

  update public.students set entry_date = date '2026-01-11' where id = '00000000-0000-0000-0000-0000000005b1';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher A cannot set an entry date in another class');

  begin
    update public.students set full_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000005a1';
    raise exception 'ASSERTION FAILED: teacher renamed a student';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.students set phone = '0800 000 0000' where id = '00000000-0000-0000-0000-0000000005a1';
    raise exception 'ASSERTION FAILED: teacher changed a phone number';
  exception when insufficient_privilege then null;
  end;

  -- Remarks: any past or current Sunday, own class only.
  insert into public.student_remarks (student_id, class_id, service_date, remark)
  values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1',
          public.current_service_date() - 7, '  Answered every question  ');
  perform pg_temp.assert(
    (select remark from public.student_remarks where student_id = '00000000-0000-0000-0000-0000000005a1') = 'Answered every question',
    'remark saved and trimmed');

  update public.student_remarks set remark = 'Led the opening prayer'
   where student_id = '00000000-0000-0000-0000-0000000005a1';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'teacher A can edit their class''s remark');

  begin
    insert into public.student_remarks (student_id, class_id, service_date, remark)
    values ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000c1',
            public.current_service_date(), 'Sneaky');
    raise exception 'ASSERTION FAILED: teacher A wrote a remark on a Men student';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.student_remarks (student_id, class_id, service_date, remark)
    values ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1',
            public.current_service_date() + 7, 'Future');
    raise exception 'ASSERTION FAILED: remark for a future date accepted';
  exception when sqlstate 'AW004' then null;
  end;
end
$$;

-- Teacher B can't see Teens remarks.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.student_remarks) = 0, 'teacher B sees no Teens remarks');

-- ===========================================================================
-- Teachers and Assistant Teachers Form.
-- ===========================================================================
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$
declare
  n int;
begin
  -- Even when lying about class, title and date, the trigger stamps the truth.
  insert into public.teacher_attendance (profile_id, class_id, staff_title, service_date, topic)
  values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000c2', 'assistant_teacher',
          public.current_service_date() - 7, '  The Good Samaritan ');
  perform pg_temp.assert(
    (select class_id = '00000000-0000-0000-0000-0000000000c1' and staff_title = 'teacher'
            and service_date = public.current_service_date() and topic = 'The Good Samaritan'
            and remarks is null and source = 'self'
       from public.teacher_attendance where profile_id = '00000000-0000-0000-0000-00000000a002'),
    'teacher mark stamped with own class, title, today, trimmed topic');

  update public.teacher_attendance set remarks = 'Good turnout', service_date = service_date - 14
   where profile_id = '00000000-0000-0000-0000-00000000a002';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'teacher can edit their entry while open');
  perform pg_temp.assert(
    (select remarks = 'Good turnout' and service_date = public.current_service_date()
       from public.teacher_attendance where profile_id = '00000000-0000-0000-0000-00000000a002'),
    'only topic/remarks change; the date cannot be moved');

  begin
    insert into public.teacher_attendance (profile_id) values ('00000000-0000-0000-0000-00000000a004');
    raise exception 'ASSERTION FAILED: teacher marked their assistant';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.teacher_attendance (profile_id) values ('00000000-0000-0000-0000-00000000a002');
    raise exception 'ASSERTION FAILED: teacher marked twice';
  exception when unique_violation then null;
  end;
end
$$;

-- The assistant marks themselves and sees only their own entry.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}';
insert into public.teacher_attendance (profile_id) values ('00000000-0000-0000-0000-00000000a004');
select pg_temp.assert((select count(*) from public.teacher_attendance) = 1, 'assistant sees only their own entry');
select pg_temp.assert((select staff_title from public.teacher_attendance) = 'assistant_teacher', 'assistant title snapshotted');

-- Closed window: everything locks for teachers.
reset role;
select pg_temp.close_window();
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$
declare
  n int;
begin
  update public.teacher_attendance set topic = 'Changed later';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'no edits after the window closes');

  delete from public.teacher_attendance;
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'no un-marking after the window closes');

  -- Remarks and entry dates stay editable any time.
  update public.students set entry_date = date '2026-02-01' where id = '00000000-0000-0000-0000-0000000005a1';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'entry date editable while closed');
  insert into public.student_remarks (student_id, class_id, service_date, remark)
  values ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1',
          public.current_service_date(), 'Late but keen');
end
$$;

do $$
begin
  begin
    insert into public.teacher_attendance (profile_id) values ('00000000-0000-0000-0000-00000000a003');
    raise exception 'ASSERTION FAILED: teacher marked after window';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Super admin sees every teacher's entry.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select pg_temp.assert((select count(*) from public.teacher_attendance) = 2, 'super admin sees all teacher entries');
select pg_temp.assert(
  (select count(*) from public.audit_log where entity = 'teacher_attendance') >= 3,
  'teacher form changes are audited');

-- Anonymous: nothing.
set local role anon;
reset "request.jwt.claims";
do $$
begin
  begin
    perform 1 from public.teacher_attendance;
    raise exception 'ASSERTION FAILED: anon read teacher_attendance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.student_remarks;
    raise exception 'ASSERTION FAILED: anon read student_remarks';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
