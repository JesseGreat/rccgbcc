# Claude Code Build Prompt — RCCG Bethel Christian Center Sunday School Attendance

Copy everything below the line into Claude Code as your first message.

---

Build a production-ready Sunday School attendance web app for **RCCG Bethel Christian Center**.

Work in phases (listed at the end). After each phase, stop and tell me what you built and what to test before moving on.

## 1. The problem

Sunday School runs **Sundays, 8:00–8:40 AM (Africa/Lagos)**, split across multiple classes. Paper registers don't scale. Students should mark themselves present from their own phone in under 10 seconds. Teachers need clean records they can export.

## 2. Stack

- **Next.js (App Router) + TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** — Postgres, Auth, Row Level Security
- Deploy target: **Vercel**
- Package manager: pnpm

Put all Supabase table access behind typed helpers. Never expose the service-role key to the browser — it may only be used inside server actions / route handlers.

## 3. Roles

| Role | Auth | Can do |
|---|---|---|
| **Student** | None — anonymous | Pick class, search own name, add self if missing, mark present |
| **Teacher** | Email + password | View/export **only their own class**, no other class exists for them |
| **Super admin** | Email + password | Everything: create classes, create teacher accounts, view/export all classes, edit settings, correct records |

Students are **not** auth users. They're just rows in a table. Teacher accounts are created by the super admin only — there is **no public signup page anywhere**.

## 4. Data model

```
classes
  id uuid pk, name text unique, description text, is_active bool default true,
  created_at timestamptz

profiles              -- extends auth.users
  id uuid pk references auth.users on delete cascade,
  full_name text, role text check (role in ('super_admin','teacher')),
  class_id uuid references classes null,   -- required for teacher, null for super_admin
  created_at timestamptz

students
  id uuid pk, class_id uuid references classes on delete restrict,
  full_name text not null,
  normalized_name text not null,           -- generated: lower, punctuation stripped, spaces collapsed
  phone text null, gender text null, age_group text null,
  is_active bool default true,
  created_by text default 'self',          -- 'self' | profile id
  created_at timestamptz
  unique (class_id, normalized_name)

attendance
  id uuid pk,
  student_id uuid references students on delete cascade,
  class_id uuid references classes,        -- denormalized for fast RLS + queries
  service_date date not null,              -- the Lagos calendar date, computed server-side
  marked_at timestamptz default now(),
  source text check (source in ('self','teacher','admin')) default 'self',
  device_hash text null,
  unique (student_id, service_date)

app_settings          -- single row, id = 1
  window_start time default '08:00',
  window_end time default '08:40',
  service_dow int default 0,               -- 0 = Sunday
  timezone text default 'Africa/Lagos',
  church_name text default 'RCCG Bethel Christian Center',
  max_marks_per_device int default 4        -- hard cap, admin-editable

audit_log
  id, actor_id uuid null, action text, entity text, entity_id uuid,
  details jsonb, created_at timestamptz
```

Enable the `pg_trgm` extension — needed for fuzzy name search and duplicate detection.

## 5. The attendance window — server-side truth only

**Never trust the client clock.** A user changing their phone time must not be able to mark attendance.

Write a Postgres function:

```sql
is_attendance_open() returns boolean
```

It reads `app_settings`, converts `now()` to the configured timezone, and returns true only when the day-of-week matches `service_dow` **and** the local time falls within `[window_start, window_end)`.

Also write `current_service_date()` returning the Lagos calendar date.

The window is a **hard lock** for the student path — no self-marking one second outside it. The client shows a live countdown purely as UI; the server rejects regardless of what the client believes.

## 6. Anonymous access — RPC only, no direct table reads

Anonymous users get **zero** direct table access. Revoke all table grants from `anon`. Everything goes through `SECURITY DEFINER` Postgres functions so nobody can scrape the full membership roster:

- **`get_classes()`** — returns active classes (id, name) plus the current window state and seconds until it opens/closes.
- **`search_students(p_class_id uuid, p_query text)`** — requires ≥2 characters, trigram-ranked, returns max 10 rows: `id`, `full_name`, `already_marked_today` boolean. Returns empty for shorter queries.
- **`add_student(p_class_id uuid, p_full_name text, p_phone text, p_device_hash text)`** — **only succeeds while the window is open**. Before inserting, runs a trigram similarity check against existing names in that class; if anything scores above ~0.55, it returns `{status: 'possible_duplicate', matches: [...]}` **without inserting**. A second call with `p_force := true` creates it anyway. On success it creates the student and marks them present in one transaction.
- **`mark_attendance(p_student_id uuid, p_device_hash text)`** — **only succeeds while the window is open**. Idempotent: if already marked today, returns `{status: 'already_marked', marked_at: ...}` rather than erroring.

Every one of these raises a clear, typed error when the window is closed so the UI can show the right message.

Rate-limit by IP on the API routes wrapping these calls.

**Device cap — enforced, not advisory.** `mark_attendance` and `add_student` both count how many distinct students this `device_hash` has already marked today. If that count is at or above `app_settings.max_marks_per_device`, the function **rejects** and returns `{status: 'device_limit_reached', limit: n}`. No row is written. Enforce this inside the Postgres function, not in application code, so it can't be bypassed by calling the API directly.

Re-marking a student the same device already marked is **not** blocked — that path returns `already_marked` and doesn't count against the cap. The cap counts distinct students only.

Log every rejection to `audit_log` with the device hash and attempted student, so the super admin can see whether the limit is set too low.

## 7. RLS policies

- `attendance`, `students`: teachers may `SELECT` only rows where `class_id = (select class_id from profiles where id = auth.uid())`. This is the hard boundary — a teacher must be unable to see another class's students even by guessing IDs or hitting the API directly. Write a test proving it.
- Super admin (`role = 'super_admin'`) may select/update everything.
- Teachers may `INSERT` and `DELETE` attendance rows **only while the window is open**, and only for students in their own class. `source` is set to `'teacher'`. This is the escape hatch for mis-taps and for anyone blocked by the device cap. Teacher marks bypass the device cap entirely — the teacher is authenticated, so the cap is pointless there. Nothing else is permitted.
- Super admin may insert/edit/delete attendance at any time, `source = 'admin'`, and every such change **must** write to `audit_log`.

## 8. Student flow — mobile first, ruthlessly simple

This is the part that matters most. It must feel instant.

**Screen 1 — Landing (`/`)**
- Church name, "Sunday School Attendance".
- A prominent live status pill, one of:
  - `Opens in 14:22` (grey, disabled state)
  - `Open — closes in 8:03` (green, pulsing)
  - `Closed — see you next Sunday` (grey)
- Below it, a grid of class cards. Large tap targets, minimum 56px tall, generous spacing, one or two columns depending on width.
- **Returning-user shortcut:** if `localStorage` holds a previous class + student, show a card at the very top: *"Welcome back, Chidi Okafor — Mark me present"* as a single tap. Include a small "Not you?" link that clears it.

**Screen 2 — Search (`/class/[id]`)**
- Sticky header with class name and a back arrow.
- Search input **auto-focused**, `inputMode="text"`, `font-size: 16px` so iOS doesn't zoom on focus.
- Debounced 250ms search. Results appear as large rows showing the name, and a green check if already marked today.
- A persistent "Can't find your name? Add it" button pinned below the results.

**Screen 3 — Confirm**
- Bottom sheet: "Mark **Chidi Okafor** present?" with a big primary button and a cancel.
- One confirmation step only. Do not add more.

**Screen 4 — Success**
- Full-screen green check animation, the student's name, the time marked, and "You're all set 🎉".
- Auto-returns to landing after 4 seconds.

**Add-student flow**
- Full name (required), phone (optional). Nothing else — extra fields kill adoption.
- If the server returns `possible_duplicate`, show: "Is this you?" with the matching names as tappable options, plus "No, add me as new".
- On success, the student is created *and* marked present in one step. Never make someone add themselves then search for themselves.

**Device-limit state**
- When the server returns `device_limit_reached`, show a calm explanatory screen, not an error toast: "This phone has already marked 4 people today. Please ask your teacher to mark you in." Include the student's name and class so the teacher can find them quickly. No blame, no red warning styling — the most common person seeing this is a parent with several children.

**Closed-window state**
- If someone opens the app outside the window, every class card is disabled and the page explains when attendance next opens. No dead ends, no error toasts.

## 9. PWA + mobile requirements

- Installable: `manifest.json`, maskable icons, `apple-touch-icon`, theme color.
- `viewport-fit=cover` with `env(safe-area-inset-*)` padding so nothing sits under the iPhone home indicator.
- All touch targets ≥48×48px.
- All inputs ≥16px font size.
- Offline shell via service worker; if the device is offline when marking, show a clear "No connection — try again" rather than silently failing. Do **not** queue offline marks, since the window is a hard lock and a queued mark would sync outside it.
- Test the whole student flow at 360px width.
- Optimistic UI on the mark action, rolled back on server rejection.

## 10. Teacher dashboard (`/dashboard`)

Login redirects straight into their own class. There is no class switcher — the concept of "another class" does not appear in their UI at all.

- **Today tab:** live roster showing present/absent, a present count and percentage, auto-refreshing every 20s while the window is open. Each absent student has a **Mark present** button and each present student an **Undo**, both active only while the window is open and both disabled the moment it closes.
- **History tab:** date-range picker, a matrix view (students down the side, Sundays across the top, checks in the cells), plus per-student attendance percentage.
- **Students tab:** read-only roster, with a way to flag a bad entry for super-admin cleanup.
- **Export:** Excel (`.xlsx`) and PDF for any date range.
  - Excel via `exceljs` in a server route — Sheet 1 the attendance matrix, Sheet 2 a summary (name, times present, total Sundays, percentage). Header row frozen and styled.
  - PDF via a server route — church name and class in the header, date range, the same matrix, page numbers, landscape when the range is wide.
  - Filename pattern: `RCCG-Bethel-{ClassName}-{startDate}-to-{endDate}.xlsx`.

## 11. Super admin dashboard (`/sundayschool`)

- **Overview:** today's total attendance across all classes, per-class breakdown, trend chart of the last 12 Sundays.
- **Classes:** create, rename, deactivate. Deactivating hides a class from students but preserves history.
- **Teachers:** create a teacher account (email, name, assigned class) via a server action using the service-role key — it provisions the auth user and the profile row together. Also reset a password, reassign a class, deactivate an account. No public signup route exists.
- **Students:** full CRUD, move a student between classes, and a **merge duplicates** tool (pick two records, merge attendance history into one, delete the other, write to `audit_log`).
- **Attendance corrections:** manually mark or unmark anyone, any date. Every change is audited.
- **Settings:** edit window start/end, service day, timezone, church name.
- **Export:** everything, all classes, any range, Excel and PDF.
- **Audit log viewer.**

## 12. Also deliver

- `.env.example` with every variable documented.
- SQL migrations in `supabase/migrations/`, sequentially numbered, each idempotent.
- A seed script creating: one super admin, 4 sample classes (e.g. Teens, Young Adults, Men, Women), a teacher per class, and ~15 students per class with a few months of plausible attendance history.
- `README.md` covering local setup, Supabase project setup, running migrations, seeding, creating the first super admin, and deploying to Vercel.
- Tests for the pieces that can hurt us: `is_attendance_open()` boundary behaviour (07:59:59, 08:00:00, 08:39:59, 08:40:00, and a non-Sunday), teacher class isolation, the double-marking guard, and the device cap (4 distinct students succeed, the 5th is rejected, re-marking an existing one still returns `already_marked`, and a teacher mark is unaffected).

## 13. Design direction

Clean and warm, not corporate. Deep navy or burgundy as the primary with a warm neutral background; green reserved exclusively for success states. Large friendly typography. It should feel calm and obvious to a 60-year-old opening it for the first time on a cracked Android in a crowded hall with poor signal. Fast over fancy — no heavy animation libraries, no unnecessary client-side JavaScript on the student path.

## 14. Build order

1. Supabase schema, RLS, RPC functions, migrations, seed script.
2. Student flow end to end (landing → class → search → mark → success), including the closed-window state.
3. Add-student flow with duplicate detection.
4. Auth + teacher dashboard with class isolation.
5. Excel and PDF export.
6. Super admin dashboard.
7. PWA polish, mobile QA at 360px, tests, README.

Stop after each phase and report.