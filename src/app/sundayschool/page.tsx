import { Flag, SmartphoneNfc } from "lucide-react";
import Link from "next/link";

import { LiveRefresh } from "@/components/admin/live-refresh";
import { TrendChart } from "@/components/admin/trend-chart";
import { StatusPill } from "@/components/student/status-pill";
import { addDays, dayOfWeek, datesOnWeekday, formatLongDate } from "@/lib/attendance/dates";
import { DAY_NAMES } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";
import type { WindowState } from "@/lib/db/types";

export default async function OverviewPage() {
  const { supabase } = await requireSuperAdmin();

  const { data: windowData, error } = await supabase.rpc("attendance_window_state");
  if (error || !windowData) throw error ?? new Error("No window state");
  const window = windowData as unknown as WindowState;

  // "Today" when it's a service day, otherwise the most recent one.
  const today = window.service_date;
  const dow = window.service_dow;
  const focusDate = addDays(today, -((dayOfWeek(today) - dow + 7) % 7));
  const isToday = focusDate === today;
  const trendDates = datesOnWeekday(addDays(focusDate, -77), focusDate, dow);

  const [classes, students, marks, teachers, openFlags, rejections] = await Promise.all([
    supabase.from("classes").select("id, name, is_active").order("name"),
    fetchAll((a, b) => supabase.from("students").select("class_id").eq("is_active", true).order("id").range(a, b)),
    fetchAll((a, b) =>
      supabase
        .from("attendance")
        .select("class_id, service_date")
        .gte("service_date", trendDates[0])
        .lte("service_date", focusDate)
        .order("id")
        .range(a, b),
    ),
    supabase.from("profiles").select("full_name, class_id").eq("role", "teacher").eq("is_active", true),
    supabase.from("student_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "attendance.device_limit_reached")
      .eq("details->>service_date", focusDate),
  ]);

  const activeStudentsByClass = new Map<string, number>();
  for (const s of students) activeStudentsByClass.set(s.class_id, (activeStudentsByClass.get(s.class_id) ?? 0) + 1);

  const presentByClass = new Map<string, number>();
  const presentByDate = new Map<string, number>();
  for (const m of marks) {
    presentByDate.set(m.service_date, (presentByDate.get(m.service_date) ?? 0) + 1);
    if (m.service_date === focusDate) presentByClass.set(m.class_id, (presentByClass.get(m.class_id) ?? 0) + 1);
  }

  const teacherNames = new Map<string, string[]>();
  for (const t of teachers.data ?? []) {
    if (!t.class_id) continue;
    teacherNames.set(t.class_id, [...(teacherNames.get(t.class_id) ?? []), t.full_name]);
  }

  const activeClasses = (classes.data ?? []).filter((c) => c.is_active);
  const totalPresent = presentByDate.get(focusDate) ?? 0;
  const totalStudents = activeClasses.reduce((sum, c) => sum + (activeStudentsByClass.get(c.id) ?? 0), 0);
  const totalPct = totalStudents ? Math.round((totalPresent / totalStudents) * 100) : 0;

  const previousDate = trendDates.at(-2);
  const previous = previousDate ? (presentByDate.get(previousDate) ?? 0) : null;
  const delta = previous === null ? null : totalPresent - previous;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh active={window.is_open} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base text-muted-foreground">{isToday ? "Today" : `Last ${DAY_NAMES[dow]}`}</p>
          <h2 className="text-2xl font-bold">{formatLongDate(focusDate)}</h2>
        </div>
        <StatusPill key={window.now} window={window} />
      </div>

      {/* KPI row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headline numbers">
        <div className="rounded-2xl border bg-card p-5 sm:col-span-2 lg:col-span-2">
          <p className="text-base text-muted-foreground">Present across all classes</p>
          <p className="mt-1 text-5xl leading-none font-bold">{totalPresent.toLocaleString("en-NG")}</p>
          <p className="mt-2 text-base text-muted-foreground">
            {totalPct}% of {totalStudents.toLocaleString("en-NG")} active students
            {delta !== null && (
              <>
                {" · "}
                <span className="font-bold text-foreground">
                  {delta > 0 ? `+${delta}` : delta === 0 ? "no change" : delta}
                </span>{" "}
                vs previous week
              </>
            )}
          </p>
        </div>
        <Link href="/sundayschool/students#flags" className="rounded-2xl border bg-card p-5 hover:border-primary">
          <p className="flex items-center gap-2 text-base text-muted-foreground">
            <Flag className="size-4" aria-hidden /> Open flags from teachers
          </p>
          <p className="mt-1 text-4xl font-bold">{openFlags.count ?? 0}</p>
        </Link>
        <Link href="/sundayschool/audit?category=device_limit" className="rounded-2xl border bg-card p-5 hover:border-primary">
          <p className="flex items-center gap-2 text-base text-muted-foreground">
            <SmartphoneNfc className="size-4" aria-hidden /> Device-limit rejections
          </p>
          <p className="mt-1 text-4xl font-bold">{rejections.count ?? 0}</p>
          <p className="text-sm text-muted-foreground">If this is high, consider raising the limit in Settings.</p>
        </Link>
      </section>

      {/* Trend */}
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="text-lg font-bold">Present each {DAY_NAMES[dow]}, last 12 weeks</h3>
        <p className="mb-4 text-sm text-muted-foreground">All classes combined</p>
        <TrendChart points={trendDates.map((d) => ({ date: d, present: presentByDate.get(d) ?? 0 }))} />
      </section>

      {/* Per class */}
      <section className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-left text-base">
          <caption className="px-5 pt-5 text-left text-lg font-bold">By class</caption>
          <thead>
            <tr className="border-b text-sm text-muted-foreground">
              <th className="px-5 py-3 font-bold">Class</th>
              <th className="px-3 py-3 font-bold max-sm:hidden">Teacher</th>
              <th className="px-3 py-3 text-right font-bold">Present</th>
              <th className="px-5 py-3 font-bold sm:w-48">Share</th>
            </tr>
          </thead>
          <tbody>
            {activeClasses.map((c) => {
              const present = presentByClass.get(c.id) ?? 0;
              const size = activeStudentsByClass.get(c.id) ?? 0;
              const pct = size ? Math.round((present / size) * 100) : 0;
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-5 py-3 font-bold max-sm:pr-2 max-sm:pl-4">
                    {c.name}
                    <span className="block text-sm font-normal text-muted-foreground sm:hidden">
                      {teacherNames.get(c.id)?.join(", ") ?? "No teacher"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground max-sm:hidden">
                    {teacherNames.get(c.id)?.join(", ") ?? <span className="italic">No teacher</span>}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                    <span className="font-bold">{present}</span>
                    <span className="text-muted-foreground"> / {size}</span>
                  </td>
                  <td className="px-5 py-3 max-sm:pr-4 max-sm:pl-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-accent max-sm:hidden" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#2c5190" }} />
                      </div>
                      <span className="w-10 text-right text-sm font-bold tabular-nums">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {activeClasses.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                  No classes yet. <Link href="/sundayschool/classes" className="font-bold text-primary underline">Create one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
