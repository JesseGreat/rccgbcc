-- 0002: core tables. Idempotent.

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint classes_name_key unique (name),
  constraint classes_name_length check (char_length(btrim(name)) between 1 and 80)
);

-- "Teens" and "teens " are the same class.
create unique index if not exists classes_name_ci_key
  on public.classes (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- profiles (extends auth.users; staff only; students are never auth users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       text not null,
  class_id   uuid references public.classes (id) on delete restrict,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('super_admin', 'teacher')),
  constraint profiles_role_class_check check (
    (role = 'teacher' and class_id is not null)
    or (role = 'super_admin' and class_id is null)
  )
);

create index if not exists profiles_class_id_idx on public.profiles (class_id);

-- ---------------------------------------------------------------------------
-- students (plain rows, created by self-registration or staff)
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete restrict,
  full_name       text not null,
  normalized_name text not null generated always as (public.normalize_name(full_name)) stored,
  phone           text,
  gender          text,
  age_group       text,
  is_active       boolean not null default true,
  created_by      text not null default 'self',   -- 'self' | profile id
  created_at      timestamptz not null default now(),
  constraint students_class_name_key unique (class_id, normalized_name),
  constraint students_full_name_length check (char_length(full_name) between 2 and 100),
  constraint students_normalized_name_length check (char_length(normalized_name) >= 2),
  constraint students_phone_length check (phone is null or char_length(phone) <= 32),
  constraint students_gender_length check (gender is null or char_length(gender) <= 20),
  constraint students_age_group_length check (age_group is null or char_length(age_group) <= 40)
);

create index if not exists students_class_id_idx on public.students (class_id);
create index if not exists students_normalized_name_trgm_idx
  on public.students using gin (normalized_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete restrict, -- denormalized; kept in sync by trigger
  service_date date not null,        -- Lagos calendar date, set server-side
  marked_at    timestamptz not null default now(),
  source       text not null default 'self',
  device_hash  text,
  constraint attendance_student_date_key unique (student_id, service_date),
  constraint attendance_source_check check (source in ('self', 'teacher', 'admin')),
  constraint attendance_device_hash_length check (device_hash is null or char_length(device_hash) <= 128)
);

create index if not exists attendance_class_date_idx on public.attendance (class_id, service_date);
create index if not exists attendance_date_device_idx
  on public.attendance (service_date, device_hash) where device_hash is not null;

-- ---------------------------------------------------------------------------
-- app_settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                   int primary key default 1,
  window_start         time not null default '08:00',
  window_end           time not null default '08:40',
  service_dow          int not null default 0,          -- 0 = Sunday
  timezone             text not null default 'Africa/Lagos',
  church_name          text not null default 'RCCG Bethel Christian Center',
  max_marks_per_device int not null default 4,
  updated_at           timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1),
  constraint app_settings_dow_check check (service_dow between 0 and 6),
  constraint app_settings_window_order check (window_end > window_start),
  constraint app_settings_max_marks_check check (max_marks_per_device between 1 and 50),
  constraint app_settings_church_name_length check (char_length(btrim(church_name)) between 1 and 120)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- audit_log (append-only; no FK on actor so history survives account deletion)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

-- ---------------------------------------------------------------------------
-- student_flags (teachers flag bad roster entries for super-admin cleanup)
-- ---------------------------------------------------------------------------
create table if not exists public.student_flags (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  class_id    uuid not null references public.classes (id) on delete restrict, -- set by trigger
  reason      text not null,
  status      text not null default 'open',
  flagged_by  uuid references auth.users (id) on delete set null,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint student_flags_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint student_flags_reason_length check (char_length(btrim(reason)) between 3 and 500)
);

create index if not exists student_flags_class_status_idx on public.student_flags (class_id, status);

-- ---------------------------------------------------------------------------
-- rate_limits (fixed-window IP counters used by the public API routes)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key    text not null,
  bucket timestamptz not null,
  hits   int not null default 0,
  primary key (key, bucket)
);

-- ---------------------------------------------------------------------------
-- Row Level Security on for everything. Policies live in 0004.
-- ---------------------------------------------------------------------------
alter table public.classes       enable row level security;
alter table public.profiles      enable row level security;
alter table public.students      enable row level security;
alter table public.attendance    enable row level security;
alter table public.app_settings  enable row level security;
alter table public.audit_log     enable row level security;
alter table public.student_flags enable row level security;
alter table public.rate_limits   enable row level security;
