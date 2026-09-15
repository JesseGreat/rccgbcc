-- Shared fixtures for the SQL tests. Include from inside a transaction:
--   begin;
--   \ir setup/fixtures.sql
--   ...
--   rollback;
--
-- Ids are fixed so tests can refer to them directly:
--   super admin  ...a001        teacher A (Teens) ...a002     teacher B (Men) ...a003
--   class A      ...00c1 Teens  class B ...00c2 Men           class C ...00c3 Closed (inactive)
--   class A students ...05a1 - ...05a8, class B students ...05b1 - ...05b3,
--   inactive student in A ...05a9

set local client_min_messages = warning;

create or replace function pg_temp.assert(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'ASSERTION FAILED: %', p_msg;
  end if;
end;
$$;

-- Make the window open for the whole current (Lagos) day.
create or replace function pg_temp.open_window()
returns void language sql as $$
  update public.app_settings
     set service_dow  = extract(dow from now() at time zone timezone)::int,
         window_start = '00:00',
         window_end   = '23:59:59.999999'
   where id = 1;
$$;

-- Make the window closed for the whole current (Lagos) day.
create or replace function pg_temp.close_window()
returns void language sql as $$
  update public.app_settings
     set service_dow  = (extract(dow from now() at time zone timezone)::int + 1) % 7,
         window_start = '08:00',
         window_end   = '08:40'
   where id = 1;
$$;

update public.app_settings
   set window_start = '08:00', window_end = '08:40', service_dow = 0,
       timezone = 'Africa/Lagos', max_marks_per_device = 4
 where id = 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'teacher.a@test.local'),
  ('00000000-0000-0000-0000-00000000a003', 'teacher.b@test.local');

insert into public.classes (id, name, is_active) values
  ('00000000-0000-0000-0000-0000000000c1', 'Teens', true),
  ('00000000-0000-0000-0000-0000000000c2', 'Men', true),
  ('00000000-0000-0000-0000-0000000000c3', 'Closed Class', false);

insert into public.profiles (id, full_name, email, role, class_id) values
  ('00000000-0000-0000-0000-00000000a001', 'Super Admin', 'admin@test.local', 'super_admin', null),
  ('00000000-0000-0000-0000-00000000a002', 'Teacher A', 'teacher.a@test.local', 'teacher', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-00000000a003', 'Teacher B', 'teacher.b@test.local', 'teacher', '00000000-0000-0000-0000-0000000000c2');

insert into public.students (id, class_id, full_name, is_active) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000c1', 'Chidi Okafor', true),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000c1', 'Ngozi Adeyemi', true),
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000000c1', 'Tunde Bakare', true),
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-0000000000c1', 'Amaka Eze', true),
  ('00000000-0000-0000-0000-0000000005a5', '00000000-0000-0000-0000-0000000000c1', 'Emeka Obi', true),
  ('00000000-0000-0000-0000-0000000005a6', '00000000-0000-0000-0000-0000000000c1', 'Funke Adebayo', true),
  ('00000000-0000-0000-0000-0000000005a7', '00000000-0000-0000-0000-0000000000c1', 'Kelechi Nwosu', true),
  ('00000000-0000-0000-0000-0000000005a8', '00000000-0000-0000-0000-0000000000c1', 'Yetunde Balogun', true),
  ('00000000-0000-0000-0000-0000000005a9', '00000000-0000-0000-0000-0000000000c1', 'Old Record', false),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000c2', 'Segun Ojo', true),
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000000c2', 'Ibrahim Musa', true),
  ('00000000-0000-0000-0000-0000000005b3', '00000000-0000-0000-0000-0000000000c2', 'Chinedu Okeke', true);
