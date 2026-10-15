import type { Metadata } from "next";

import { ExportButtons } from "@/components/dashboard/export-buttons";
import { RegistrationTable } from "@/components/forms/registration-table";
import { addDays, datesOnWeekday } from "@/lib/attendance/dates";
import { requireTeacher } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";
import { REGISTRATION_FORM_TITLE } from "@/lib/forms/labels";
import { loadRegistration } from "@/lib/reports/forms";
import { loadSettings } from "@/lib/reports/load";

export const metadata: Metadata = { title: "Registration form" };

export default async function RegistrationPage() {
  const { supabase, classId, className } = await requireTeacher();

  const [{ data: today, error }, settings, rows, flags, inactive] = await Promise.all([
    supabase.rpc("current_service_date"),
    loadSettings(supabase),
    loadRegistration(supabase, { classIds: [classId] }),
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
    supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("is_active", false),
  ]);
  if (error || !today) throw error ?? new Error("No service date");

  const openFlags: Record<string, string> = {};
  for (const f of flags) openFlags[f.student_id] ??= f.reason;

  const latestServiceDate = datesOnWeekday(addDays(today, -6), today, settings.service_dow)[0] ?? today;
  const missingEntry = rows.filter((r) => !r.entryDate).length;
  const inactiveCount = inactive.count ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{REGISTRATION_FORM_TITLE}</p>
          <h2 className="text-xl font-bold">
            {className} · {rows.length} {rows.length === 1 ? "student" : "students"}
          </h2>
          <p className="text-base text-muted-foreground">
            Students fill in their name, age, sex and phone. You set the entry date and write remarks.
            {missingEntry > 0 && (
              <>
                {" "}
                <strong className="text-primary">
                  {missingEntry} {missingEntry === 1 ? "student needs" : "students need"} an entry date.
                </strong>
              </>
            )}
          </p>
        </div>
        <ExportButtons form="registration" />
      </div>

      <RegistrationTable rows={rows} today={today} latestServiceDate={latestServiceDate} flags={openFlags} />

      <p className="text-base text-muted-foreground">
        Spot a duplicate or misspelt name? Flag it and the superintendent will tidy it up.
        {inactiveCount > 0 &&
          ` ${inactiveCount} deactivated ${inactiveCount === 1 ? "record is" : "records are"} hidden; their past attendance still appears in the register.`}
      </p>
    </div>
  );
}
