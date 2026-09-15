-- 0005: integrity triggers and the audit trail. Idempotent.

-- ---------------------------------------------------------------------------
-- Audit: any change made with a signed-in staff session is recorded.
-- Anonymous RPCs and service-role server code write their own audit rows.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row   jsonb;
  v_id    text;
begin
  if v_actor is null then
    return null;
  end if;

  -- Attendance rows re-pointed by another trigger (e.g. a student moving class)
  -- are covered by the parent change's audit entry.
  if tg_table_name = 'attendance' and pg_trigger_depth() > 1 then
    return null;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id  := v_row ->> 'id';

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then v_id::uuid end,
    jsonb_build_object(
      'actor_role', public.current_profile_role(),
      'old', case when tg_op <> 'INSERT' then to_jsonb(old) end,
      'new', case when tg_op <> 'DELETE' then to_jsonb(new) end
    )
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- attendance: derive class_id from the student, fill server-side date/time,
-- and stamp the source from the caller's role (clients can't spoof it).
-- ---------------------------------------------------------------------------
create or replace function public.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_role     text := public.current_profile_role();
begin
  select s.class_id into v_class_id from public.students s where s.id = new.student_id;
  if v_class_id is null then
    raise exception 'student % does not exist', new.student_id
      using errcode = 'foreign_key_violation';
  end if;
  new.class_id := v_class_id;

  if tg_op = 'INSERT' then
    new.service_date := coalesce(new.service_date, public.current_service_date());
    new.marked_at    := coalesce(new.marked_at, now());
    if v_role is not null then
      new.device_hash := null;     -- staff marks never count toward a device cap
    end if;
  end if;

  if v_role = 'teacher' then
    new.source := 'teacher';
  elsif v_role = 'super_admin' then
    new.source := 'admin';
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_before_write on public.attendance;
create trigger attendance_before_write
  before insert or update on public.attendance
  for each row execute function public.attendance_before_write();

drop trigger if exists attendance_audit on public.attendance;
create trigger attendance_audit
  after insert or update or delete on public.attendance
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- students: tidy names; when a student moves class, their history moves too
-- so the new teacher sees it and the old teacher no longer does.
-- ---------------------------------------------------------------------------
create or replace function public.students_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name := public.clean_display_name(new.full_name);
  new.phone     := nullif(btrim(coalesce(new.phone, '')), '');
  new.gender    := nullif(btrim(coalesce(new.gender, '')), '');
  new.age_group := nullif(btrim(coalesce(new.age_group, '')), '');
  if tg_op = 'INSERT' and auth.uid() is not null and new.created_by = 'self' then
    new.created_by := auth.uid()::text;
  end if;
  return new;
end;
$$;

drop trigger if exists students_before_write on public.students;
create trigger students_before_write
  before insert or update on public.students
  for each row execute function public.students_before_write();

create or replace function public.students_after_class_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance set class_id = new.class_id where student_id = new.id;
  update public.student_flags set class_id = new.class_id where student_id = new.id;
  return null;
end;
$$;

drop trigger if exists students_after_class_change on public.students;
create trigger students_after_class_change
  after update of class_id on public.students
  for each row
  when (old.class_id is distinct from new.class_id)
  execute function public.students_after_class_change();

drop trigger if exists students_audit on public.students;
create trigger students_audit
  after insert or update or delete on public.students
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- classes, profiles, app_settings, student_flags: audit staff changes.
-- ---------------------------------------------------------------------------
create or replace function public.classes_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := public.clean_display_name(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  return new;
end;
$$;

drop trigger if exists classes_before_write on public.classes;
create trigger classes_before_write
  before insert or update on public.classes
  for each row execute function public.classes_before_write();

drop trigger if exists classes_audit on public.classes;
create trigger classes_audit
  after insert or update or delete on public.classes
  for each row execute function public.audit_row_change();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create or replace function public.app_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reject unknown timezone names (raises invalid_parameter_value).
  perform now() at time zone new.timezone;
  new.church_name := public.clean_display_name(new.church_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_settings_before_update on public.app_settings;
create trigger app_settings_before_update
  before insert or update on public.app_settings
  for each row execute function public.app_settings_before_update();

drop trigger if exists app_settings_audit on public.app_settings;
create trigger app_settings_audit
  after update on public.app_settings
  for each row execute function public.audit_row_change();

create or replace function public.student_flags_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  select s.class_id into v_class_id from public.students s where s.id = new.student_id;
  if v_class_id is null then
    raise exception 'student % does not exist', new.student_id
      using errcode = 'foreign_key_violation';
  end if;
  new.class_id := v_class_id;
  new.reason := btrim(new.reason);
  if tg_op = 'INSERT' then
    new.flagged_by := coalesce(auth.uid(), new.flagged_by);
  elsif new.status is distinct from old.status and new.status <> 'open' then
    new.resolved_by := coalesce(auth.uid(), new.resolved_by);
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists student_flags_before_write on public.student_flags;
create trigger student_flags_before_write
  before insert or update on public.student_flags
  for each row execute function public.student_flags_before_write();

drop trigger if exists student_flags_audit on public.student_flags;
create trigger student_flags_audit
  after insert or update or delete on public.student_flags
  for each row execute function public.audit_row_change();
