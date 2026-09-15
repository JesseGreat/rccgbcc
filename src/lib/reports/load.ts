import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, daysBetween, isIsoDate } from "@/lib/attendance/dates";
import { localDate } from "@/lib/attendance/format";
import { fetchAll } from "@/lib/db/fetch-all";
import type { Database } from "@/lib/supabase/database.types";

import { buildAttendanceMatrix, type AttendanceMatrix } from "./matrix";

type Client = SupabaseClient<Database>;

export const MAX_RANGE_DAYS = 366;
/** Matches the "12 weeks" preset in the range picker. */
export const DEFAULT_RANGE_DAYS = 83;

export type DateRange = { from: string; to: string };

/** Parse ?from=&to= with sane defaults (last 12 weeks) and a one-year cap. */
export function parseRange(params: { from?: unknown; to?: unknown }, today: string): DateRange {
  let to = isIsoDate(params.to) ? params.to : today;
  let from = isIsoDate(params.from) ? params.from : addDays(to, -DEFAULT_RANGE_DAYS);
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
  return { from, to };
}

export async function loadSettings(supabase: Client) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("church_name, timezone, service_dow, window_start, window_end, max_marks_per_device")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Attendance matrix for one class (teacher) or several/all classes (admin).
 * Runs with the caller's client, so RLS decides what is visible.
 */
export async function loadAttendanceMatrix(
  supabase: Client,
  opts: { classIds: string[] | "all"; range: DateRange; today: string },
): Promise<{ matrix: AttendanceMatrix; settings: Awaited<ReturnType<typeof loadSettings>> }> {
  const settings = await loadSettings(supabase);
  const { from, to } = opts.range;

  const [students, marks, firstMarks] = await Promise.all([
    fetchAll((a, b) => {
      let q = supabase
        .from("students")
        .select("id, full_name, is_active, created_at, class_id, classes(name)")
        .order("id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
    fetchAll((a, b) => {
      let q = supabase
        .from("attendance")
        .select("student_id, service_date")
        .gte("service_date", from)
        .lte("service_date", to)
        .order("id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
    // When each student first attended, so earlier history counts toward "could have attended".
    fetchAll((a, b) => {
      let q = supabase
        .from("student_first_attendance")
        .select("student_id, first_service_date")
        .order("student_id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
  ]);

  const firstMarkByStudent = new Map(firstMarks.map((f) => [f.student_id, f.first_service_date]));

  const matrix = buildAttendanceMatrix({
    students: students.map((s) => ({
      id: s.id,
      fullName: s.full_name,
      isActive: s.is_active,
      createdDate: earliest(localDate(s.created_at, settings.timezone), firstMarkByStudent.get(s.id)),
      className: opts.classIds === "all" || opts.classIds.length > 1 ? (s.classes?.name ?? "") : undefined,
    })),
    marks: marks.map((m) => ({ studentId: m.student_id, serviceDate: m.service_date })),
    from,
    to,
    today: opts.today,
    serviceDow: settings.service_dow,
  });

  return { matrix, settings };
}

function earliest(a: string, b: string | undefined): string {
  return b && b < a ? b : a;
}
