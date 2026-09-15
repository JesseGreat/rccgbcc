-- 0009: reporting helpers. Idempotent.

-- Each student's first-ever attendance date. Reports use it to decide from
-- which Sunday a student "could have attended" without loading full history.
-- security_invoker: the caller's RLS applies, so a teacher only sees their class.
create or replace view public.student_first_attendance
with (security_invoker = true) as
select a.student_id, a.class_id, min(a.service_date) as first_service_date
from public.attendance a
group by a.student_id, a.class_id;

revoke all on public.student_first_attendance from anon, authenticated;
grant select on public.student_first_attendance to authenticated, service_role;
