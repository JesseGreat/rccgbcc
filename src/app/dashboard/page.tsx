import { TeacherSelfMark } from "@/components/forms/teacher-self-mark";
import { TodayRoster } from "@/components/dashboard/today-roster";
import { requireTeacher } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";
import type { WindowState } from "@/lib/db/types";

export default async function TodayPage() {
  const { supabase, classId, profile } = await requireTeacher();

  const { data: windowData, error: windowError } = await supabase.rpc("attendance_window_state");
  if (windowError || !windowData) throw windowError ?? new Error("No window state");
  const window = windowData as unknown as WindowState;

  const [students, marks, self] = await Promise.all([
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
    supabase
      .from("teacher_attendance")
      .select("marked_at, topic, remarks")
      .eq("profile_id", profile.id)
      .eq("service_date", window.service_date)
      .maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <TeacherSelfMark
        // Remount only when the saved entry changes (not on the roster's 20s refresh),
        // so half-typed text survives.
        key={`${window.is_open}|${self.data?.marked_at ?? ""}|${self.data?.topic ?? ""}|${self.data?.remarks ?? ""}`}
        window={window}
        entry={self.data ? { markedAt: self.data.marked_at, topic: self.data.topic, remarks: self.data.remarks } : null}
        staffTitle={profile.staffTitle}
        name={profile.fullName || profile.email || "You"}
      />
      <TodayRoster
        window={window}
        students={students.map((s) => ({ id: s.id, fullName: s.full_name }))}
        marks={marks.map((m) => ({ studentId: m.student_id, markedAt: m.marked_at, source: m.source }))}
      />
    </div>
  );
}
