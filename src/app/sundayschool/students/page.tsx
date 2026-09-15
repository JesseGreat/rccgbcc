import { Flag, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CreateStudentButton, FlagActions, StudentRowActions } from "@/components/admin/student-controls";
import { Badge } from "@/components/ui/badge";
import { formatMediumDate } from "@/lib/attendance/dates";
import { localDate } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";

export const metadata: Metadata = { title: "Students" };

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentsAdminPage(props: PageProps<"/sundayschool/students">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);
  const classFilter = typeof sp.class === "string" && UUID_RE.test(sp.class) ? sp.class : "";
  const status = sp.status === "inactive" || sp.status === "all" ? sp.status : "active";
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const notice = typeof sp.notice === "string" ? sp.notice.slice(0, 200) : "";

  let listQuery = supabase
    .from("students")
    .select("id, full_name, phone, gender, age_group, class_id, is_active, created_by, created_at, classes(name)", {
      count: "exact",
    })
    .order("full_name")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (classFilter) listQuery = listQuery.eq("class_id", classFilter);
  if (status !== "all") listQuery = listQuery.eq("is_active", status === "active");
  if (query) listQuery = listQuery.ilike("full_name", `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const [list, classes, flags, settings, staff] = await Promise.all([
    listQuery,
    supabase.from("classes").select("id, name, is_active").order("name"),
    supabase
      .from("student_flags")
      .select("id, reason, created_at, flagged_by, student_id, students(full_name, classes(name))")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase.from("app_settings").select("timezone").eq("id", 1).single(),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (list.error) throw list.error;

  const students = list.data ?? [];
  const total = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const timeZone = settings.data?.timezone ?? "Africa/Lagos";
  const staffNames = new Map((staff.data ?? []).map((p) => [p.id, p.full_name]));
  const allClasses = classes.data ?? [];
  const classOptions = allClasses.map((c) => ({ id: c.id, name: c.is_active ? c.name : `${c.name} (deactivated)` }));

  const attendance = students.length
    ? await fetchAll((a, b) =>
        supabase
          .from("attendance")
          .select("student_id")
          .in("student_id", students.map((s) => s.id))
          .order("id")
          .range(a, b),
      )
    : [];
  const attendanceCount = new Map<string, number>();
  for (const r of attendance) attendanceCount.set(r.student_id, (attendanceCount.get(r.student_id) ?? 0) + 1);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (classFilter) params.set("class", classFilter);
    if (status !== "active") params.set("status", status);
    if (query) params.set("q", query);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/sundayschool/students${s ? `?${s}` : ""}`;
  };

  const inputClass = "h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none";

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p role="status" className="rounded-xl bg-success-soft p-3 text-base font-bold">
          {notice}
        </p>
      )}

      {(flags.data?.length ?? 0) > 0 && (
        <section id="flags" className="flex flex-col gap-2 rounded-2xl border-2 border-primary/30 bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Flag className="size-5 text-primary" aria-hidden /> Flagged by teachers ({flags.data?.length})
          </h2>
          <ul className="divide-y">
            {flags.data?.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">
                    {f.students?.full_name}{" "}
                    <span className="font-normal text-muted-foreground">· {f.students?.classes?.name}</span>
                  </p>
                  <p className="text-base">&ldquo;{f.reason}&rdquo;</p>
                  <p className="text-sm text-muted-foreground">
                    {(f.flagged_by && staffNames.get(f.flagged_by)) || "A teacher"} ·{" "}
                    {formatMediumDate(localDate(f.created_at, timeZone))}
                  </p>
                </div>
                <FlagActions flagId={f.id} studentId={f.student_id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Students</h2>
          <p className="text-base text-muted-foreground">
            {total.toLocaleString("en-NG")} {status === "all" ? "" : status} {total === 1 ? "record" : "records"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sundayschool/students/merge"
            className="flex h-12 items-center rounded-xl border-2 bg-card px-4 text-base font-bold"
          >
            Merge duplicates
          </Link>
          <CreateStudentButton classes={allClasses.filter((c) => c.is_active)} />
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-bold">Name</span>
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={query} placeholder="Search names" className={`${inputClass} w-full pl-10`} />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Class</span>
          <select name="class" defaultValue={classFilter} className={inputClass}>
            <option value="">All classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Status</span>
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground">
          Filter
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {students.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {s.full_name}
                {!s.is_active && <Badge variant="secondary">Deactivated</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                {[
                  s.classes?.name,
                  s.phone,
                  `${attendanceCount.get(s.id) ?? 0} attended`,
                  `added ${formatMediumDate(localDate(s.created_at, timeZone))}${s.created_by === "self" ? " by themselves" : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <StudentRowActions student={s} classes={classOptions} attendanceCount={attendanceCount.get(s.id) ?? 0} />
          </li>
        ))}
        {students.length === 0 && (
          <li className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No students match.</li>
        )}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="flex h-12 items-center rounded-xl border-2 bg-card px-4 font-bold">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-base text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="flex h-12 items-center rounded-xl border-2 bg-card px-4 font-bold">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
