# RCCG Bethel Christian Center · Sunday School Attendance

Students mark themselves present from their own phone in a few seconds.
Teachers see and export their own class. The superintendent manages everything.

- **Students** don't sign in. They pick their class, find their name (or add it) and tap once.
- **Teachers** sign in and see **only their class**: a live roster, history, and Excel/PDF export.
- **The superintendent** manages classes, teacher accounts, students (including merging duplicates),
  corrections, settings, exports and the audit log.

Attendance can only be marked during the window (default **Sundays 08:00–08:40, Africa/Lagos**).
The database clock decides this, so changing a phone's clock does nothing.

---

## Contents

1. [How it works](#how-it-works)
2. [Tech stack & project layout](#tech-stack--project-layout)
3. [Set up Supabase](#1-set-up-supabase)
4. [Run it locally](#2-run-it-locally)
5. [Create the first superintendent](#3-create-the-first-superintendent)
6. [Deploy to Vercel](#4-deploy-to-vercel)
7. [Running a Sunday](#running-a-sunday)
8. [Testing](#testing)
9. [Security model](#security-model)
10. [Troubleshooting](#troubleshooting)

---

## How it works

| Who | Signs in? | Can do |
|---|---|---|
| Student | No | Pick class → find or add own name → mark present, only while the window is open |
| Teacher | Email + password | Own class only: live roster, mark in / undo (while open), history, export, flag bad records |
| Superintendent | Email + password | Everything, at any time, with every change recorded in the audit log |

There is **no signup page**. The superintendent creates teacher accounts, and the first
superintendent account is created from the command line.

Rules the **database** enforces, so no app bug or crafted request can get around them:

- The attendance window: server time converted to the configured timezone.
- A student can be marked at most once per day.
- **Device cap:** one phone can mark at most *N* different people per day (default 4). Every
  rejection is logged, so you can tell whether the limit is too low. Teacher marks ignore the cap.
- Teachers can only ever read their own class's students and attendance (Row Level Security).
- Anonymous visitors cannot read any table. Everything goes through a few locked-down functions
  called from rate-limited API routes.

---

## Tech stack & project layout

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Supabase (Postgres, Auth, RLS) ·
Vercel · pnpm · exceljs · jsPDF · Vitest · Playwright

```
supabase/
  migrations/        0001…0009 SQL migrations (idempotent, run in order)
  tests/             SQL tests: window boundaries, isolation, double-marking, device cap…
  config.toml        Supabase CLI config (signups disabled)
scripts/
  db-migrate.sh      apply migrations to any database (pnpm db:migrate)
  seed.ts            sample data for development (pnpm db:seed)
  create-super-admin.ts
  test-db.sh         run the SQL tests on a throwaway Postgres (pnpm test:db)
src/
  app/
    page.tsx, class/[id]/…        student flow
    api/…                         rate-limited student API + exports
    login/, dashboard/            teacher area
    sundayschool/                 superintendent area
  components/student|dashboard|admin|pwa|ui
  lib/
    attendance/                   RPC wrappers, formatting, browser helpers
    auth/                         session + role guards, sign in/out
    reports/                      matrix builder, Excel and PDF generators
    supabase/                     clients (server, service-role) and database types
  proxy.ts                        refreshes staff sessions (Next 16's name for middleware)
public/sw.js, offline.html        service worker + offline page
tests/unit, tests/e2e             Vitest and Playwright
```

---

## 1. Set up Supabase

1. **Create a project** at [supabase.com](https://supabase.com). Choose the region closest to Nigeria
   that's available and keep the database password somewhere safe.

2. **Copy the keys.** In **Project Settings → API Keys**, note:
   - the **Project URL**
   - the **anon / publishable** key (safe for browsers)
   - the **service_role / secret** key (**server only**: never share it or put it in client code)

3. **Turn off public signups.** In **Authentication → Sign In / Providers**:
   - switch **off** "Allow new users to sign up"
   - keep the **Email** provider enabled (staff sign in with email + password)

   Accounts created by the superintendent are confirmed automatically, so no confirmation emails are sent.

4. **Set the site URL** (after you deploy): **Authentication → URL Configuration → Site URL** =
   your live address, e.g. `https://bethel-attendance.vercel.app`.

5. **Run the migrations.** Pick one:

   - **Option A: `pnpm db:migrate`** (needs `psql`; easiest)
     In the dashboard click **Connect**, copy the **Session pooler** connection string, put your
     database password in it, then:
     ```bash
     DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-….pooler.supabase.com:5432/postgres" pnpm db:migrate
     ```
   - **Option B: SQL Editor** (no tools needed)
     Open **SQL Editor**, then paste and run each file in `supabase/migrations/` **in number order**
     (`0001` first, `0009` last).
   - **Option C: Supabase CLI**
     `pnpm dlx supabase link --project-ref <ref>`, then `pnpm dlx supabase db push`.

   Every migration is idempotent: running them again is safe, and a failed run can simply be re-run.

---

## 2. Run it locally

Requirements: **Node.js 22+** and **pnpm 10+**.

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key (server only) |
| `DEVICE_HASH_SALT` | any long random string: `openssl rand -base64 32` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally |

Every variable is documented in [`.env.example`](.env.example).

```bash
pnpm dev          # http://localhost:3000
```

### Sample data (development only)

```bash
# in .env.local: SEED_SUPER_ADMIN_PASSWORD=… and SEED_TEACHER_PASSWORD=… (10+ characters)
pnpm db:seed
```

This creates a superintendent (`admin@bethel.local`), four classes (Teens, Young Adults, Men, Women),
a teacher for each (`teens.teacher@bethel.local`, …), 15 students per class and about four months of
attendance. It refuses to touch a hosted project unless you add `--remote`. **Don't seed your
real church database.**

> **Testing outside the Sunday window:** marking is locked outside it by design. To try the student
> flow on a weekday, sign in as the superintendent → **Settings**, set the service day to today and a
> window around the current time, then put it back afterwards.

---

## 3. Create the first superintendent

There is no signup, so the very first account is made from the command line (with `.env.local` filled in):

```bash
pnpm create-super-admin --email superintendent@example.org --name "Deacon Adewale"
```

You'll be asked for a password (10+ characters). If the email already belongs to someone, that
account is promoted and its password reset. Then sign in at `/login`. From the dashboard you can
create classes and teacher accounts.

---

## 4. Deploy to Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. On [vercel.com](https://vercel.com) → **Add New… → Project** → import the repository.
   Vercel detects Next.js and pnpm automatically.
3. Under **Environment Variables**, add for **Production** (and Preview if you use it):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DEVICE_HASH_SALT`
   - `NEXT_PUBLIC_SITE_URL` (your Vercel URL or custom domain)
   - optional: `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_SEARCH_MAX`, `RATE_LIMIT_MARK_MAX`, `RATE_LIMIT_ADD_MAX`
4. **Deploy.**
5. In Supabase, set **Site URL** to the deployed address (step 1.4).
6. Optional: under **Settings → Functions**, pick a Vercel region near your Supabase region to shave latency.

Checklist after the first deploy:
- [ ] `/` loads and shows your classes (create them in the dashboard first)
- [ ] `/login` works for the superintendent; `/dashboard` redirects to `/login` when signed out
- [ ] On Android Chrome, the app offers **Install**; on iPhone, Share → **Add to Home Screen** works
- [ ] Settings show the right service day, times and timezone

---

## Running a Sunday

**Before the service**
- Print a QR code of the site address and put it at the hall entrance.
- Check **Settings**: service day, open/close time, phone limit.
- Make sure every class has an active teacher account.

**During the window (08:00–08:40 by default)**
- Students scan, choose their class, find their name and tap **Yes, mark me present**. New people
  tap **Can't find your name? Add it**.
- If someone is told *"This phone has already marked 4 people today"*, their teacher marks them in
  from **Dashboard → Today**. That's the normal fix for families sharing a phone.
- Teachers' rosters update by themselves every 20 seconds.

**After the service**
- Missed someone? The superintendent uses **Corrections** (any class, any date; every change is audited).
- Teachers can flag duplicates or misspellings; the superintendent sees them under **Students** and can merge.
- Exports: **History → Download Excel / PDF** (teachers), **Export** (superintendent, all classes).
- If **Overview** shows many device-limit rejections, raise the limit in **Settings**.

**Poor signal in the hall?** The installed app still opens offline, but marking needs a connection
(so a mark can't be saved after the window closes). Church WiFi helps a lot; teachers can always mark people in.

---

## Testing

```bash
pnpm test            # unit tests + SQL tests
pnpm test:unit       # Vitest: dates, matrix maths, Excel/PDF builders, request helpers
pnpm test:db         # SQL tests on a throwaway local Postgres
pnpm test:e2e        # Playwright browser tests (see below)
pnpm lint && pnpm typecheck
```

**SQL tests** (`supabase/tests/`) cover the risky parts:
- `is_attendance_open()` boundaries: 07:59:59 closed, 08:00:00 open, 08:39:59 open, 08:40:00 closed, non-Sunday closed
- teacher class isolation (including guessed IDs and spoofed class IDs), and zero anonymous access
- the double-marking guard
- the device cap: 4 succeed, the 5th is rejected and logged, a re-mark returns `already_marked`, teacher marks are unaffected
- merges, class moves, auditing, and the reporting view's permissions

`pnpm test:db` needs PostgreSQL 15+ **server** binaries on the machine (`initdb`, `pg_ctl`); it
applies every migration twice to prove they're idempotent. Or point it at a disposable database
that already has the migrations: `DATABASE_URL=… pnpm test:db`.

**Browser tests** (`tests/e2e/`) run the real app at 360px width:
- the student flow, including the closed window, device cap, duplicate detection and offline marking
- the 360px rules: no sideways scrolling, tap targets ≥ 48px, inputs ≥ 16px
- PWA install and offline behaviour
- teacher isolation, marking and export
- a superintendent smoke test

They need a Supabase database with migrations applied and `pnpm db:seed` data, plus the seed
passwords in `.env.local`. They change the window settings (and restore them) and create `E2E …`
records (and delete them). They **refuse to run against a hosted project** unless
`E2E_ALLOW_REMOTE=1`. Use a separate, disposable test project, never the church's real one.
```bash
pnpm exec playwright install chromium   # once (or set CHROME_PATH to an installed Chrome)
pnpm test:e2e                           # builds and starts the app on :3100
```

---

## Security model

- **Anonymous visitors can't read any table.** Student actions call four `SECURITY DEFINER`
  functions (`get_classes`, `search_students`, `add_student`, `mark_attendance`). Only the service
  role can execute them, and only from the rate-limited API routes, so the member list can't be
  scraped and the rate limit can't be bypassed. Search needs 2+ characters, returns at most 10
  names and only works while the window is open.
- **Staff use their own session**, so Row Level Security applies to every query. The service-role
  key is used only in server code: student API routes, teacher account provisioning and audit writes.
  The `server-only` package makes the build fail if it's ever imported into browser code.
- **Audit log:** database triggers record every change made by a signed-in staff member (old and new
  values). Merges, account changes, device-limit rejections and exports are logged explicitly.
- **Device cap:** browsers keep a random ID, which the server hashes with `DEVICE_HASH_SALT` before
  it reaches the database. It stops casual misuse (one phone marking a whole class). It isn't
  identity: someone who clears their browser data gets a fresh count. Teachers are the backstop.
- **Rate limits:** per IP, stored in Postgres (works on serverless). The defaults are generous
  because a church WiFi or mobile carrier can put a whole hall behind one IP.
- **Accounts:** no signup; passwords are 10+ characters. Deactivating a teacher both locks their
  profile (immediate) and bans the login. Resetting a password signs that person out everywhere.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, HSTS and a strict referrer policy. Staff pages are
  `noindex`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| "We can't reach attendance right now" | Missing or wrong Supabase env vars, or migrations not applied. Check the Vercel logs for `[rpc]` errors. |
| Classes are greyed out | The window is closed. Check **Settings** (day, times, timezone). |
| A teacher sees "Your account isn't active" | The account was deactivated or has no class. Fix it under **Teachers**. |
| `permission denied for function …` in logs | Migration `0008_grants.sql` didn't run, or the service-role key is wrong. |
| `extensions.similarity does not exist` | `pg_trgm` was previously installed in a different schema. Run `alter extension pg_trgm set schema extensions;` then re-run migrations. |
| Many "device limit" rejections | Families share phones. Raise **Settings → People one phone can mark per day**. |
| Changes don't show after deploying | The installed app's service worker updates on the next load; closing and reopening the app is enough. |
