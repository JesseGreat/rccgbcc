import type { Metadata } from "next";

import { AttendanceMatrixTable } from "@/components/dashboard/attendance-matrix";
import { ExportButtons } from "@/components/dashboard/export-buttons";
import { RangePicker } from "@/components/dashboard/range-picker";
import { dayOfWeek, formatMediumDate } from "@/lib/attendance/dates";
import { DAY_NAMES } from "@/lib/attendance/format";
import { requireTeacher } from "@/lib/auth/session";
import { loadAttendanceMatrix, parseRange } from "@/lib/reports/load";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage(props: PageProps<"/dashboard/history">) {
  const [searchParams, { supabase, classId }] = await Promise.all([props.searchParams, requireTeacher()]);

  const { data: today, error } = await supabase.rpc("current_service_date");
  if (error || !today) throw error ?? new Error("No service date");

  const range = parseRange(searchParams, today);
  const { matrix, settings } = await loadAttendanceMatrix(supabase, { classIds: [classId], range, today });
  const allOnServiceDay = matrix.dates.every((d) => dayOfWeek(d) === settings.service_dow);
  const dayWord = allOnServiceDay ? DAY_NAMES[settings.service_dow] : "service day";

  const activeRows = matrix.rows.filter((r) => r.isActive);
  const average =
    matrix.dates.length && activeRows.length
      ? Math.round(matrix.totals.reduce((sum, t) => sum + t, 0) / matrix.dates.length)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <RangePicker basePath="/dashboard/history" range={range} today={today} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {formatMediumDate(range.from)} to {formatMediumDate(range.to)}
          </h2>
          <p className="text-base text-muted-foreground">
            {matrix.dates.length} {matrix.dates.length === 1 ? dayWord : `${dayWord}s`} · about {average} present each week
          </p>
        </div>
        <ExportButtons range={range} />
      </div>

      <AttendanceMatrixTable matrix={matrix} />
    </div>
  );
}
