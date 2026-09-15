import type { Metadata } from "next";

import { CorrectionsRoster } from "@/components/admin/corrections-roster";
import { addDays, dayOfWeek, formatLongDate, isIsoDate } from "@/lib/attendance/dates";
import { DAY_NAMES } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";

export const metadata: Metadata = { title: "Corrections" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CorrectionsPage(props: PageProps<"/sundayschool/corrections">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);

  const [{ data: today }, { data: classes }, { data: settings }] = await Promise.all([
    supabase.rpc("current_service_date"),
    supabase.from("classes").select("id, name, is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("app_settings").select("service_dow, timezone").eq("id", 1).single(),
  ]);
  if (!today || !settings) throw new Error("Settings unavailable");

  const allClasses = classes ?? [];
  const classId =
    typeof sp.classId === "string" && UUID_RE.test(sp.classId) && allClasses.some((c) => c.id === sp.classId)
      ? sp.classId
      : (allClasses[0]?.id ?? "");
  const lastServiceDay = addDays(today, -((dayOfWeek(today) - settings.service_dow + 7) % 7));
  const date = isIsoDate(sp.date) && sp.date <= today ? sp.date : lastServiceDay;
  const offDay = dayOfWeek(date) !== settings.service_dow;

  const [students, marks] = classId
    ? await Promise.all([
        fetchAll((a, b) =>
          supabase.from("students").select("id, full_name, is_active").eq("class_id", classId).order("full_name").order("id").range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("attendance")
            .select("student_id, marked_at, source")
            .eq("class_id", classId)
            .eq("service_date", date)
            .order("id")
            .range(a, b),
        ),
      ])
    : [[], []];

  const markByStudent = new Map(marks.map((m) => [m.student_id, m]));
  const rows = students
    .filter((s) => s.is_active || markByStudent.has(s.id))
    .map((s) => {
      const m = markByStudent.get(s.id);
      return {
        studentId: s.id,
        fullName: s.full_name,
        isActive: s.is_active,
        mark: m ? { markedAt: m.marked_at, source: m.source } : null,
      };
    });

  const inputClass = "h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Attendance corrections</h2>
        <p className="text-base text-muted-foreground">
          Mark or unmark anyone on any date. Each change is saved straight away and recorded in the audit log.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Class</span>
          <select name="classId" defaultValue={classId} className={inputClass}>
            {allClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? "" : " (deactivated)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Date</span>
          <input type="date" name="date" defaultValue={date} max={today} className={inputClass} />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
          Show
        </button>
      </form>

      <div>
        <h3 className="text-xl font-bold">{formatLongDate(date)}</h3>
        {offDay && (
          <p className="mt-1 rounded-xl bg-accent p-3 font-bold text-accent-foreground">
            This isn&apos;t a {DAY_NAMES[settings.service_dow]}. Marks saved here will show as an extra column in reports.
          </p>
        )}
      </div>

      {classId ? (
        <CorrectionsRoster key={`${classId}-${date}`} rows={rows} classId={classId} date={date} timeZone={settings.timezone} />
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">Create a class first.</p>
      )}
    </div>
  );
}
