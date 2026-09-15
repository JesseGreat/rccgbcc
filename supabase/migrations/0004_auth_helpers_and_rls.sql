-- 0004: role helpers and Row Level Security policies. Idempotent.
--
-- Access model
--   anon          : no table access at all (grants revoked in 0007).
--   teacher       : reads only rows of their own class; may insert/delete today's
--                   attendance for their own class while the window is open.
--   super_admin   : everything; every change is audited by trigger (0005).
--   service_role  : bypasses RLS; used only by server code.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so policies can read profiles without recursion.
-- An inactive profile resolves to no role, and so to no access.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function public.current_profile_class_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.class_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role = 'teacher'
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'super_admin', false)
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'teacher', false)
$$;

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
  for select to authenticated
  using ((select public.is_super_admin()) or id = (select public.current_profile_class_id()));

drop policy if exists classes_admin_insert on public.classes;
create policy classes_admin_insert on public.classes
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists classes_admin_update on public.classes;
create policy classes_admin_update on public.classes
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists classes_admin_delete on public.classes;
create policy classes_admin_delete on public.classes
  for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- profiles (created/deleted by server code with the service role only)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

drop policy if exists students_admin_insert on public.students;
create policy students_admin_insert on public.students
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists students_admin_update on public.students;
create policy students_admin_update on public.students
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists students_admin_delete on public.students;
create policy students_admin_delete on public.students
  for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

-- Teacher escape hatch: today's marks for their own class, only while open.
-- (class_id, source and service_date are normalised by the BEFORE trigger,
-- which runs before this check.)
drop policy if exists attendance_teacher_insert on public.attendance;
create policy attendance_teacher_insert on public.attendance
  for insert to authenticated
  with check (
    (select public.is_teacher())
    and class_id = (select public.current_profile_class_id())
    and source = 'teacher'
    and service_date = (select public.current_service_date())
    and (select public.is_attendance_open())
    and exists (
      select 1 from public.students s
      where s.id = student_id
        and s.class_id = (select public.current_profile_class_id())
        and s.is_active
    )
  );

drop policy if exists attendance_teacher_delete on public.attendance;
create policy attendance_teacher_delete on public.attendance
  for delete to authenticated
  using (
    (select public.is_teacher())
    and class_id = (select public.current_profile_class_id())
    and service_date = (select public.current_service_date())
    and (select public.is_attendance_open())
  );

drop policy if exists attendance_admin_insert on public.attendance;
create policy attendance_admin_insert on public.attendance
  for insert to authenticated
  with check ((select public.is_super_admin()) and source = 'admin');

drop policy if exists attendance_admin_update on public.attendance;
create policy attendance_admin_update on public.attendance
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists attendance_admin_delete on public.attendance;
create policy attendance_admin_delete on public.attendance
  for delete to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using ((select public.current_profile_role()) is not null);

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- audit_log (written only by SECURITY DEFINER functions/triggers and server code)
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- student_flags
-- ---------------------------------------------------------------------------
drop policy if exists student_flags_select on public.student_flags;
create policy student_flags_select on public.student_flags
  for select to authenticated
  using ((select public.is_super_admin()) or class_id = (select public.current_profile_class_id()));

drop policy if exists student_flags_insert on public.student_flags;
create policy student_flags_insert on public.student_flags
  for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      (select public.is_teacher())
      and class_id = (select public.current_profile_class_id())
      and flagged_by = (select auth.uid())
      and status = 'open'
    )
  );

drop policy if exists student_flags_admin_update on public.student_flags;
create policy student_flags_admin_update on public.student_flags
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists student_flags_admin_delete on public.student_flags;
create policy student_flags_admin_delete on public.student_flags
  for delete to authenticated
  using ((select public.is_super_admin()));

-- rate_limits: RLS enabled with no policies: service role only.
