import type { Metadata } from "next";

import { AttendanceMatrixTable } from "@/components/dashboard/attendance-matrix";
import { ExportButtons } from "@/components/dashboard/export-buttons";
import { RangePicker } from "@/components/dashboard/range-picker";
import { formatMediumDate } from "@/lib/attendance/dates";
import { requireSuperAdmin } from "@/lib/auth/session";
import { loadAttendanceMatrix, parseRange } from "@/lib/reports/load";

export const metadata: Metadata = { title: "Export" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExportPage(props: PageProps<"/sundayschool/export">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);
  const classId = typeof sp.classId === "string" && UUID_RE.test(sp.classId) ? sp.classId : "";

  const [{ data: today }, { data: classes }] = await Promise.all([
    supabase.rpc("current_service_date"),
    supabase.from("classes").select("id, name, is_active").order("name"),
  ]);
  if (!today) throw new Error("No service date");
  const range = parseRange(sp, today);
  const { matrix } = await loadAttendanceMatrix(supabase, { classIds: classId ? [classId] : "all", range, today });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Export attendance</h2>
        <p className="text-base text-muted-foreground">Any class, or every class, for any range up to a year.</p>
      </div>

      <RangePicker basePath="/sundayschool/export" range={range} today={today} params={{ classId }}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Class</span>
          <select
            name="classId"
            defaultValue={classId}
            className="h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none"
          >
            <option value="">All classes</option>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? "" : " (deactivated)"}
              </option>
            ))}
          </select>
        </label>
      </RangePicker>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">
            {formatMediumDate(range.from)} to {formatMediumDate(range.to)}
          </h3>
          <p className="text-base text-muted-foreground">
            {matrix.rows.length} students · {matrix.dates.length} service days
          </p>
        </div>
        <ExportButtons range={range} classId={classId || undefined} />
      </div>

      <AttendanceMatrixTable matrix={matrix} showClass={!classId} />
    </div>
  );
}
