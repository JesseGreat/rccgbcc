import { Flag } from "lucide-react";
import type { Metadata } from "next";

import { FlagStudentButton } from "@/components/dashboard/flag-student-button";
import { formatMediumDate } from "@/lib/attendance/dates";
import { localDate } from "@/lib/attendance/format";
import { requireTeacher } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  const { supabase, classId } = await requireTeacher();

  const [students, flags, settings] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("students")
        .select("id, full_name, phone, is_active, created_by, created_at")
        .eq("class_id", classId)
        .order("full_name")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("student_flags")
        .select("student_id, reason, created_at")
        .eq("class_id", classId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    supabase.from("app_settings").select("timezone").eq("id", 1).single(),
  ]);

  const timeZone = settings.data?.timezone ?? "Africa/Lagos";
  const openFlag = new Map<string, string>();
  for (const f of flags) if (!openFlag.has(f.student_id)) openFlag.set(f.student_id, f.reason);

  const active = students.filter((s) => s.is_active);
  const inactiveCount = students.length - active.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{active.length} students</h2>
        <p className="text-base text-muted-foreground">
          Spot a duplicate or misspelt name? Flag it and the superintendent will tidy it up.
        </p>
      </div>

      {active.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No students yet.</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {active.map((s) => {
            const flag = openFlag.get(s.id);
            return (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-bold">{s.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      s.phone,
                      `Added ${formatMediumDate(localDate(s.created_at, timeZone))}`,
                      s.created_by === "self" ? "added themselves" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {flag && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm font-bold text-primary">
                      <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Flagged: {flag}
                    </p>
                  )}
                </div>
                {!flag && <FlagStudentButton studentId={s.id} studentName={s.full_name} />}
              </li>
            );
          })}
        </ul>
      )}

      {inactiveCount > 0 && (
        <p className="text-base text-muted-foreground">
          {inactiveCount} deactivated {inactiveCount === 1 ? "record is" : "records are"} hidden. Their past attendance still
          appears in History.
        </p>
      )}
    </div>
  );
}
