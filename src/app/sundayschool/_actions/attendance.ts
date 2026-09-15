"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isIsoDate } from "@/lib/attendance/dates";
import { fail, ok, unexpected, type FormState } from "@/lib/admin/form";
import { requireSuperAdmin } from "@/lib/auth/session";

/**
 * Admin correction: mark or unmark anyone on any past or current date.
 * Stamped source=admin and written to audit_log by database triggers.
 */
export async function setAttendance(input: {
  studentId: string;
  classId: string;
  date: string;
  present: boolean;
}): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  if (!z.uuid().safeParse(input.studentId).success || !z.uuid().safeParse(input.classId).success) {
    return fail("Unknown student.");
  }
  if (!isIsoDate(input.date)) return fail("Choose a valid date.");

  const { data: today } = await supabase.rpc("current_service_date");
  if (today && input.date > today) return fail("You can't mark attendance for a future date.");

  if (input.present) {
    const { error } = await supabase.from("attendance").insert({
      student_id: input.studentId,
      class_id: input.classId,
      service_date: input.date,
      source: "admin",
    });
    if (error && error.code !== "23505") return unexpected("setAttendance insert", error);
  } else {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("student_id", input.studentId)
      .eq("service_date", input.date);
    if (error) return unexpected("setAttendance delete", error);
  }

  refresh();
  return ok(input.present ? "Marked present." : "Marked absent.");
}
