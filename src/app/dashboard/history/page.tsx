import type { Metadata } from "next";

import { ExportButtons } from "@/components/dashboard/export-buttons";
import { RangePicker } from "@/components/dashboard/range-picker";
import { RegisterTable } from "@/components/forms/register-table";
import { dayOfWeek, formatMediumDate } from "@/lib/attendance/dates";
import { DAY_NAMES } from "@/lib/attendance/format";
import { requireTeacher } from "@/lib/auth/session";
import type { WindowState } from "@/lib/db/types";
import { REGISTER_TITLE } from "@/lib/forms/labels";
import { loadRemarks, remarkKey } from "@/lib/reports/forms";
import { loadAttendanceMatrix, parseRange } from "@/lib/reports/load";
import { registerMonths } from "@/lib/reports/register";

export const metadata: Metadata = { title: "Attendance register" };

export default async function RegisterPage(props: PageProps<"/dashboard/history">) {
  const [searchParams, { supabase, classId, className }] = await Promise.all([props.searchParams, requireTeacher()]);

  const { data: windowData, error } = await supabase.rpc("attendance_window_state");
  if (error || !windowData) throw error ?? new Error("No window state");
  const window = windowData as unknown as WindowState;
  const today = window.service_date;

  const range = parseRange(searchParams, today);
  const [{ matrix, settings }, remarks] = await Promise.all([
    loadAttendanceMatrix(supabase, { classIds: [classId], range, today }),
    loadRemarks(supabase, { classIds: [classId], range }),
  ]);
  const allOnServiceDay = matrix.dates.every((d) => dayOfWeek(d) === settings.service_dow);
  const dayWord = allOnServiceDay ? DAY_NAMES[settings.service_dow] : "service day";

  const average =
    matrix.dates.length && matrix.rows.length
      ? Math.round(matrix.totals.reduce((sum, t) => sum + t, 0) / matrix.dates.length)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <RangePicker basePath="/dashboard/history" range={range} today={today} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{REGISTER_TITLE}</p>
          <h2 className="text-xl font-bold">
            {className} · {formatMediumDate(range.from)} to {formatMediumDate(range.to)}
          </h2>
          <p className="text-base text-muted-foreground">
            {matrix.dates.length} {matrix.dates.length === 1 ? dayWord : `${dayWord}s`} · about {average} present each week
          </p>
        </div>
        <ExportButtons form="register" range={range} />
      </div>

      <RegisterTable
        months={registerMonths(matrix.dates, settings.service_dow)}
        dates={matrix.dates}
        rows={matrix.rows}
        remarks={Object.fromEntries(remarks.map((r) => [remarkKey(r.studentId, r.date), r.remark]))}
        today={today}
        mode={{ kind: "teacher", openDate: window.is_open ? today : null }}
      />
    </div>
  );
}
