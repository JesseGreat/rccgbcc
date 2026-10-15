import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExportButtons, type ExportForm } from "@/components/dashboard/export-buttons";
import { RangePicker } from "@/components/dashboard/range-picker";
import { RegisterTable } from "@/components/forms/register-table";
import { RegistrationTable } from "@/components/forms/registration-table";
import { addDays, datesOnWeekday, formatLongDate, formatMediumDate } from "@/lib/attendance/dates";
import { formatTime } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { REGISTER_TITLE, REGISTRATION_FORM_TITLE, staffTitleLabel, TEACHERS_FORM_TITLE } from "@/lib/forms/labels";
import { loadRegistration, loadRemarks, loadTeachersForm, remarkKey, type TeacherFormRow } from "@/lib/reports/forms";
import { loadAttendanceMatrix, loadSettings, parseRange } from "@/lib/reports/load";
import { registerMonths } from "@/lib/reports/register";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Forms" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMS: { key: ExportForm; label: string; title: string }[] = [
  { key: "register", label: "Attendance register", title: REGISTER_TITLE },
  { key: "registration", label: "Registration form", title: REGISTRATION_FORM_TITLE },
  { key: "teachers", label: "Teachers' form", title: TEACHERS_FORM_TITLE },
];

const selectClass = "h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none";

export default async function FormsPage(props: PageProps<"/sundayschool/export">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);
  const classId = typeof sp.classId === "string" && UUID_RE.test(sp.classId) ? sp.classId : "";
  const form: ExportForm = sp.form === "registration" || sp.form === "teachers" ? sp.form : "register";
  const current = FORMS.find((f) => f.key === form)!;

  const [{ data: today }, { data: classes }, settings] = await Promise.all([
    supabase.rpc("current_service_date"),
    supabase.from("classes").select("id, name, is_active").order("name"),
    loadSettings(supabase),
  ]);
  if (!today) throw new Error("No service date");
  const range = parseRange(sp, today);
  const classIds = classId ? [classId] : ("all" as const);
  const className = classId ? (classes ?? []).find((c) => c.id === classId)?.name : "All classes";

  const classSelect = (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold">Class</span>
      <select name="classId" defaultValue={classId} className={selectClass}>
        <option value="">All classes</option>
        {(classes ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_active ? "" : " (deactivated)"}
          </option>
        ))}
      </select>
    </label>
  );

  const tabHref = (key: ExportForm) => {
    const params = new URLSearchParams({ form: key });
    if (classId) params.set("classId", classId);
    if (key !== "registration") {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    return `/sundayschool/export?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Forms</h2>
        <p className="text-base text-muted-foreground">View, correct and download the three Sunday School forms.</p>
      </div>

      <nav aria-label="Form" className="flex flex-wrap gap-2">
        {FORMS.map((f) => (
          <Link
            key={f.key}
            href={tabHref(f.key)}
            aria-current={f.key === form ? "page" : undefined}
            className={cn(
              "flex h-11 items-center rounded-full border-2 px-4 text-base font-bold transition-colors",
              f.key === form ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {form === "registration" ? (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
          <input type="hidden" name="form" value="registration" />
          {classSelect}
          <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground">
            Show
          </button>
        </form>
      ) : (
        <RangePicker basePath="/sundayschool/export" range={range} today={today} params={{ form, classId }}>
          <input type="hidden" name="form" value={form} />
          {classSelect}
        </RangePicker>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{current.title}</p>
          <h3 className="text-xl font-bold">
            {className}
            {form !== "registration" && ` · ${formatMediumDate(range.from)} to ${formatMediumDate(range.to)}`}
          </h3>
        </div>
        <ExportButtons form={form} range={form === "registration" ? undefined : range} classId={classId || undefined} />
      </div>

      {form === "register" && <RegisterView supabase={supabase} classIds={classIds} range={range} today={today} serviceDow={settings.service_dow} />}
      {form === "registration" && (
        <RegistrationView supabase={supabase} classIds={classIds} today={today} serviceDow={settings.service_dow} />
      )}
      {form === "teachers" && (
        <TeachersView
          supabase={supabase}
          classIds={classIds}
          range={range}
          today={today}
          serviceDow={settings.service_dow}
          timeZone={settings.timezone}
        />
      )}
    </div>
  );
}

type ViewProps = {
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];
  classIds: string[] | "all";
  today: string;
  serviceDow: number;
};

async function RegisterView({ supabase, classIds, range, today, serviceDow }: ViewProps & { range: { from: string; to: string } }) {
  const [{ matrix }, remarks] = await Promise.all([
    loadAttendanceMatrix(supabase, { classIds, range, today }),
    loadRemarks(supabase, { classIds, range }),
  ]);
  return (
    <>
      <p className="text-base text-muted-foreground">
        {matrix.rows.length} students · {matrix.dates.length} service days. As superintendent you can correct any Sunday; every change is
        logged.
      </p>
      <RegisterTable
        months={registerMonths(matrix.dates, serviceDow)}
        dates={matrix.dates}
        rows={matrix.rows}
        remarks={Object.fromEntries(remarks.map((r) => [remarkKey(r.studentId, r.date), r.remark]))}
        today={today}
        mode={{ kind: "admin" }}
        showClass={classIds === "all"}
      />
    </>
  );
}

async function RegistrationView({ supabase, classIds, today, serviceDow }: ViewProps) {
  const rows = await loadRegistration(supabase, { classIds });
  const latestServiceDate = datesOnWeekday(addDays(today, -6), today, serviceDow)[0] ?? today;
  return <RegistrationTable rows={rows} today={today} latestServiceDate={latestServiceDate} showClass={classIds === "all"} />;
}

async function TeachersView({
  supabase,
  classIds,
  range,
  today,
  serviceDow,
  timeZone,
}: ViewProps & { range: { from: string; to: string }; timeZone: string }) {
  const { dates, rows } = await loadTeachersForm(supabase, { classIds, range, today, serviceDow });
  if (rows.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No teachers or entries in this range.</p>;
  }

  const byDate = new Map<string, TeacherFormRow[]>();
  for (const r of rows) {
    let list = byDate.get(r.date);
    if (!list) byDate.set(r.date, (list = []));
    list.push(r);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...dates].reverse().map((date) => {
        const list = byDate.get(date) ?? [];
        if (list.length === 0) return null;
        const present = list.filter((r) => r.present).length;
        return (
          <section key={date} className="overflow-hidden rounded-2xl border bg-card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/50 px-4 py-3">
              <h4 className="text-lg font-bold">{formatLongDate(date)}</h4>
              <p className="text-base font-bold text-muted-foreground tabular-nums">
                {present} of {list.length} present
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-base">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-bold">
                      Name
                    </th>
                    <th scope="col" className="px-2 py-2 font-bold">
                      Title
                    </th>
                    {classIds === "all" && (
                      <th scope="col" className="px-2 py-2 font-bold">
                        Class
                      </th>
                    )}
                    <th scope="col" className="px-2 py-2 font-bold">
                      Attendance
                    </th>
                    <th scope="col" className="px-2 py-2 font-bold">
                      Topic taught
                    </th>
                    <th scope="col" className="px-4 py-2 font-bold">
                      Remarks
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.profileId} className="border-t align-top">
                      <th scope="row" className="px-4 py-2.5 text-left font-bold">
                        {r.name}
                      </th>
                      <td className="px-2 py-2.5 whitespace-nowrap">{staffTitleLabel(r.title)}</td>
                      {classIds === "all" && <td className="px-2 py-2.5 whitespace-nowrap">{r.className}</td>}
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {r.present ? (
                          <span className="flex items-center gap-1.5 font-bold text-success">
                            <Check className="size-4" strokeWidth={3} aria-hidden /> Present
                            {r.markedAt && <span className="font-normal text-muted-foreground">{formatTime(r.markedAt, timeZone)}</span>}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Minus className="size-4" aria-hidden /> Absent
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">{r.topic ?? ""}</td>
                      <td className="px-4 py-2.5">{r.remarks ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
