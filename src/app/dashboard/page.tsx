import { TodayRoster } from "@/components/dashboard/today-roster";
import { requireTeacher } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";
import type { WindowState } from "@/lib/db/types";

export default async function TodayPage() {
  const { supabase, classId } = await requireTeacher();

  const { data: windowData, error: windowError } = await supabase.rpc("attendance_window_state");
  if (windowError || !windowData) throw windowError ?? new Error("No window state");
  const window = windowData as unknown as WindowState;

  const [students, marks] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("students")
        .select("id, full_name")
        .eq("class_id", classId)
        .eq("is_active", true)
        .order("full_name")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("attendance")
        .select("student_id, marked_at, source")
        .eq("class_id", classId)
        .eq("service_date", window.service_date)
        .order("id")
        .range(a, b),
    ),
  ]);

  return (
    <TodayRoster
      window={window}
      students={students.map((s) => ({ id: s.id, fullName: s.full_name }))}
      marks={marks.map((m) => ({ studentId: m.student_id, markedAt: m.marked_at, source: m.source }))}
    />
  );
}
