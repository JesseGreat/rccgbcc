-- Double-marking guard, teacher mark/undo rules, admin corrections + audit,
-- search behaviour, and add_student duplicate detection.
begin;
\ir setup/fixtures.sql

select pg_temp.open_window();

-- ===========================================================================
-- Double-marking guard (student path)
-- ===========================================================================
set local role service_role;
reset "request.jwt.claims";
do $$
declare
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
begin
  r1 := public.mark_attendance('00000000-0000-0000-0000-0000000005a1', 'device-xxxxxxxxxxxxxxxx');
  perform pg_temp.assert(r1 ->> 'status' = 'marked', 'first mark -> marked, got ' || r1::text);
  perform pg_temp.assert(r1 ->> 'full_name' = 'Chidi Okafor', 'marked payload includes the name');
  perform pg_temp.assert(r1 ->> 'class_name' = 'Teens', 'marked payload includes the class');

  r2 := public.mark_attendance('00000000-0000-0000-0000-0000000005a1', 'device-xxxxxxxxxxxxxxxx');
  perform pg_temp.assert(r2 ->> 'status' = 'already_marked', 'second mark, same device -> already_marked');
  perform pg_temp.assert(r2 ->> 'marked_at' = r1 ->> 'marked_at', 'already_marked returns the original marked_at');

  r3 := public.mark_attendance('00000000-0000-0000-0000-0000000005a1', 'device-yyyyyyyyyyyyyyyy');
  perform pg_temp.assert(r3 ->> 'status' = 'already_marked', 'second mark, other device -> already_marked');

  begin
    perform public.mark_attendance('00000000-0000-0000-0000-0000000005a9', 'device-xxxxxxxxxxxxxxxx');
    raise exception 'ASSERTION FAILED: inactive student was marked';
  exception when sqlstate 'AW003' then null;
  end;
  begin
    perform public.mark_attendance('00000000-0000-0000-0000-000000000000', 'device-xxxxxxxxxxxxxxxx');
    raise exception 'ASSERTION FAILED: unknown student was marked';
  exception when sqlstate 'AW003' then null;
  end;
  begin
    perform public.mark_attendance('00000000-0000-0000-0000-0000000005a2', 'short');
    raise exception 'ASSERTION FAILED: malformed device hash accepted';
  exception when sqlstate 'AW004' then null;
  end;
  begin
    perform public.mark_attendance('00000000-0000-0000-0000-0000000005a2', null);
    raise exception 'ASSERTION FAILED: missing device hash accepted';
  exception when sqlstate 'AW004' then null;
  end;
end
$$;
reset role;

select pg_temp.assert(
  (select count(*) from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a1') = 1,
  'exactly one attendance row after three mark attempts');
select pg_temp.assert(
  (select count(*) from public.attendance where device_hash = 'device-yyyyyyyyyyyyyyyy') = 0,
  'an already_marked attempt writes nothing for the second device');

-- The unique constraint backs this up for every path.
do $$
begin
  insert into public.attendance (student_id, class_id, service_date)
  values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', public.current_service_date());
  raise exception 'ASSERTION FAILED: duplicate attendance row inserted';
exception when unique_violation then null;
end
$$;

-- ===========================================================================
-- Teacher: mark, undo, re-mark while open; blocked once closed.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

do $$
declare
  n int;
begin
  begin
    insert into public.attendance (student_id, class_id)
    values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'ASSERTION FAILED: teacher double-marked a student';
  exception when unique_violation then null;
  end;

  insert into public.attendance (student_id, class_id)
  values ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1');

  delete from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a2';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'teacher can undo today''s mark while open');

  insert into public.attendance (student_id, class_id)
  values ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1');
end
$$;
reset role;

select pg_temp.assert(
  (select count(*) from public.audit_log where actor_id = '00000000-0000-0000-0000-00000000a002'
     and action in ('attendance.insert', 'attendance.delete')) = 3,
  'teacher mark, undo and re-mark are all audited');

select pg_temp.close_window();

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
do $$
declare
  n int;
begin
  begin
    insert into public.attendance (student_id, class_id)
    values ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'ASSERTION FAILED: teacher marked while closed';
  exception when insufficient_privilege then null;
  end;

  delete from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a2';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 0, 'teacher cannot undo once closed');
end
$$;
reset role;

-- ===========================================================================
-- Super admin: corrections at any time, any date, always audited.
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare
  n int;
begin
  insert into public.attendance (student_id, class_id, service_date, source)
  values ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000000c1',
          public.current_service_date() - 14, 'self');

  update public.attendance set service_date = service_date - 7
   where student_id = '00000000-0000-0000-0000-0000000005a4';

  delete from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a2';
  get diagnostics n = row_count;
  perform pg_temp.assert(n = 1, 'admin can unmark while closed');
end
$$;
reset role;

select pg_temp.assert(
  (select source from public.attendance where student_id = '00000000-0000-0000-0000-0000000005a4') = 'admin',
  'admin mark is stamped source=admin even when the client sends self');
select pg_temp.assert(
  (select array_agg(action order by id) from public.audit_log
    where actor_id = '00000000-0000-0000-0000-00000000a001')
  = array['attendance.insert', 'attendance.update', 'attendance.delete'],
  'every admin attendance change is audited');

-- ===========================================================================
-- search_students
-- ===========================================================================
select pg_temp.open_window();
insert into public.students (class_id, full_name)
select '00000000-0000-0000-0000-0000000000c1', 'Search Person ' || chr(64 + g)
from generate_series(1, 15) g;

set local role service_role;
reset "request.jwt.claims";
select pg_temp.assert(
  (select count(*) from public.search_students('00000000-0000-0000-0000-0000000000c1', 'c')) = 0,
  'one-character query returns nothing');
select pg_temp.assert(
  (select count(*) from public.search_students('00000000-0000-0000-0000-0000000000c1', ' . ')) = 0,
  'punctuation-only query returns nothing');
select pg_temp.assert(
  (select count(*) from public.search_students('00000000-0000-0000-0000-0000000000c1', 'search')) = 10,
  'results are capped at 10');
select pg_temp.assert(
  (select full_name from public.search_students('00000000-0000-0000-0000-0000000000c1', 'chi') limit 1) = 'Chidi Okafor',
  'prefix query ranks the prefix match first');
select pg_temp.assert(
  (select already_marked_today from public.search_students('00000000-0000-0000-0000-0000000000c1', 'chidi') limit 1),
  'already_marked_today is true for a marked student');
select pg_temp.assert(
  not (select already_marked_today from public.search_students('00000000-0000-0000-0000-0000000000c1', 'tunde') limit 1),
  'already_marked_today is false for an unmarked student');
select pg_temp.assert(
  (select full_name from public.search_students('00000000-0000-0000-0000-0000000000c1', 'okafr chidi') limit 1) = 'Chidi Okafor',
  'typo + reversed word order still finds the student');
select pg_temp.assert(
  (select full_name from public.search_students('00000000-0000-0000-0000-0000000000c1', 'okafor') limit 1) = 'Chidi Okafor',
  'surname search works');
select pg_temp.assert(
  (select count(*) from public.search_students('00000000-0000-0000-0000-0000000000c1', 'segun')) = 0,
  'search never returns students from another class');
select pg_temp.assert(
  (select count(*) from public.search_students('00000000-0000-0000-0000-0000000000c1', 'old record')) = 0,
  'inactive students are hidden');
do $$
begin
  perform public.search_students('00000000-0000-0000-0000-0000000000c3', 'anyone');
  raise exception 'ASSERTION FAILED: searched an inactive class';
exception when sqlstate 'AW002' then null;
end
$$;

-- ===========================================================================
-- add_student: duplicate detection, force, validation
-- ===========================================================================
do $$
declare
  r jsonb;
  v_before int;
begin
  select count(*) into v_before from public.students;

  -- Exact (normalised) name: never inserts, even with force.
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', '  chidi   OKAFOR. ', null, 'device-addaddaddaddadd', true);
  perform pg_temp.assert(r ->> 'status' = 'possible_duplicate', 'exact name -> possible_duplicate, got ' || r::text);
  perform pg_temp.assert((r ->> 'exact_match')::boolean, 'exact_match flag set');
  perform pg_temp.assert(r -> 'matches' -> 0 ->> 'id' = '00000000-0000-0000-0000-0000000005a1', 'match is Chidi');
  perform pg_temp.assert((r -> 'matches' -> 0 ->> 'already_marked_today')::boolean, 'match reports already marked');

  -- Close name: possible_duplicate without insert.
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Chidi Okafo', '0803 123 4567', 'device-addaddaddaddadd');
  perform pg_temp.assert(r ->> 'status' = 'possible_duplicate', 'similar name -> possible_duplicate, got ' || r::text);
  perform pg_temp.assert(not (r ->> 'exact_match')::boolean, 'fuzzy match is not exact');
  perform pg_temp.assert((select count(*) from public.students) = v_before, 'possible_duplicate inserts nothing');

  -- Same name in a different class is not a duplicate.
  r := public.add_student('00000000-0000-0000-0000-0000000000c2', 'Chidi Okafor', null, 'device-addaddaddaddadd');
  perform pg_temp.assert(r ->> 'status' = 'created', 'same name in another class -> created, got ' || r::text);

  -- Force: creates and marks present in one step.
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Chidi Okafo', '+234 803 123 4567', 'device-addaddaddaddadd', true);
  perform pg_temp.assert(r ->> 'status' = 'created', 'forced add -> created, got ' || r::text);
  perform pg_temp.assert(
    exists (select 1 from public.attendance a
            where a.student_id = (r ->> 'student_id')::uuid
              and a.service_date = public.current_service_date()
              and a.source = 'self'
              and a.device_hash = 'device-addaddaddaddadd'),
    'created student is marked present in the same call');
  perform pg_temp.assert(
    (select created_by from public.students where id = (r ->> 'student_id')::uuid) = 'self',
    'self-registered student has created_by = self');

  -- A clearly different name goes straight through.
  r := public.add_student('00000000-0000-0000-0000-0000000000c1', 'Oluwaseun Adewale-Johnson', null, 'device-addaddaddaddadd');
  perform pg_temp.assert(r ->> 'status' = 'created', 'distinct name -> created, got ' || r::text);

  -- Name belonging to a deactivated record.
  begin
    perform public.add_student('00000000-0000-0000-0000-0000000000c1', 'Old Record', null, 'device-addaddaddaddadd', true);
    raise exception 'ASSERTION FAILED: reused a deactivated record''s name';
  exception when sqlstate 'AW005' then null;
  end;

  -- Validation.
  begin
    perform public.add_student('00000000-0000-0000-0000-0000000000c1', 'A', null, 'device-addaddaddaddadd');
    raise exception 'ASSERTION FAILED: one-letter name accepted';
  exception when sqlstate 'AW004' then null;
  end;
  begin
    perform public.add_student('00000000-0000-0000-0000-0000000000c1', 'Valid Name', 'call me', 'device-addaddaddaddadd');
    raise exception 'ASSERTION FAILED: junk phone accepted';
  exception when sqlstate 'AW004' then null;
  end;
  begin
    perform public.add_student('00000000-0000-0000-0000-0000000000c3', 'Valid Name', null, 'device-addaddaddaddadd');
    raise exception 'ASSERTION FAILED: added to inactive class';
  exception when sqlstate 'AW002' then null;
  end;
end
$$;
reset role;

rollback;
