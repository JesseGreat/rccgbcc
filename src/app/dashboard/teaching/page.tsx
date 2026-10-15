import { Check } from "lucide-react";
import type { Metadata } from "next";

import { formatLongDate } from "@/lib/attendance/dates";
import { formatTime } from "@/lib/attendance/format";
import { requireTeacher } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";
import { staffTitleLabel, TEACHERS_FORM_TITLE } from "@/lib/forms/labels";
import { loadSettings } from "@/lib/reports/load";

export const metadata: Metadata = { title: "My attendance" };

/** A teacher's own lines on the Teachers and Assistant Teachers Form. */
export default async function MyAttendancePage() {
  const { supabase, profile } = await requireTeacher();

  const [settings, entries] = await Promise.all([
    loadSettings(supabase),
    fetchAll((a, b) =>
      supabase
        .from("teacher_attendance")
        .select("id, service_date, marked_at, staff_title, topic, remarks, classes(name)")
        .eq("profile_id", profile.id)
        .order("service_date", { ascending: false })
        .order("id")
        .range(a, b),
    ),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{TEACHERS_FORM_TITLE}</p>
        <h2 className="text-xl font-bold">
          {entries.length} {entries.length === 1 ? "Sunday" : "Sundays"} marked present
        </h2>
        <p className="text-base text-muted-foreground">
          Mark yourself present on the Today tab while attendance is open. Only you and the superintendent can see this.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e, i) => (
            <li
              key={e.id}
              className="flex animate-rise-in items-start gap-3 rounded-2xl border bg-card p-4"
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <Check className="size-5" strokeWidth={3} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold">{formatLongDate(e.service_date)}</p>
                <p className="text-sm text-muted-foreground">
                  {[formatTime(e.marked_at, settings.timezone), staffTitleLabel(e.staff_title), e.classes?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {e.topic && (
                  <p className="mt-1 text-base">
                    <span className="font-bold">Topic:</span> {e.topic}
                  </p>
                )}
                {e.remarks && (
                  <p className="text-base">
                    <span className="font-bold">Remarks:</span> {e.remarks}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
