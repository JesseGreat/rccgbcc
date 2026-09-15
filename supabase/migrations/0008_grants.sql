-- 0008: privileges. Idempotent.
--
-- Supabase grants broad default privileges to anon/authenticated on everything
-- in `public`. We strip those and grant back only what each role needs.
--
-- anon          : nothing. Not a single table, not a single function.
-- authenticated : table privileges that RLS then narrows per row; role helpers.
-- service_role  : the student RPCs (called only from rate-limited API routes)
--                 plus full table access for trusted server code.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
revoke all on table
  public.classes, public.profiles, public.students, public.attendance,
  public.app_settings, public.audit_log, public.student_flags, public.rate_limits
from anon, authenticated;

grant select, insert, update, delete on table
  public.classes, public.students, public.attendance, public.student_flags
to authenticated;
grant select, update on table public.profiles, public.app_settings to authenticated;
grant select on table public.audit_log to authenticated;

grant all on table
  public.classes, public.profiles, public.students, public.attendance,
  public.app_settings, public.audit_log, public.student_flags, public.rate_limits
to service_role;

-- ---------------------------------------------------------------------------
-- Functions: revoke from everyone, then grant explicitly.
-- ---------------------------------------------------------------------------
revoke all on function
  public.normalize_name(text),
  public.clean_display_name(text),
  public.is_attendance_open_at(timestamptz),
  public.is_attendance_open(),
  public.current_service_date(),
  public.attendance_window_state_at(timestamptz),
  public.attendance_window_state(),
  public.current_profile_role(),
  public.current_profile_class_id(),
  public.is_super_admin(),
  public.is_teacher(),
  public.audit_row_change(),
  public.attendance_before_write(),
  public.students_before_write(),
  public.students_after_class_change(),
  public.classes_before_write(),
  public.app_settings_before_update(),
  public.student_flags_before_write(),
  public.assert_attendance_open(),
  public.normalize_device_hash(text),
  public.get_classes(),
  public.search_students(uuid, text),
  public.check_device_cap(text, date, uuid, text, uuid, text, text),
  public.mark_attendance(uuid, text),
  public.add_student(uuid, text, text, text, boolean),
  public.merge_students(uuid, uuid),
  public.hit_rate_limit(text, int, int)
from public, anon, authenticated;

-- Used inside RLS policies and generated columns, and by the staff dashboards.
grant execute on function
  public.normalize_name(text),
  public.clean_display_name(text),
  public.is_attendance_open(),
  public.current_service_date(),
  public.attendance_window_state(),
  public.current_profile_role(),
  public.current_profile_class_id(),
  public.is_super_admin(),
  public.is_teacher(),
  public.merge_students(uuid, uuid)       -- checks is_super_admin() itself
to authenticated;

grant execute on function
  public.normalize_name(text),
  public.clean_display_name(text),
  public.is_attendance_open_at(timestamptz),
  public.is_attendance_open(),
  public.current_service_date(),
  public.attendance_window_state_at(timestamptz),
  public.attendance_window_state(),
  public.get_classes(),
  public.search_students(uuid, text),
  public.mark_attendance(uuid, text),
  public.add_student(uuid, text, text, text, boolean),
  public.hit_rate_limit(text, int, int)
to service_role;

-- Future objects created by this role in `public` start closed to anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
