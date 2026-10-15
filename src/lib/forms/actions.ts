"use server";

import { refresh } from "next/cache";

import { isIsoDate } from "@/lib/attendance/dates";
import { getStaffSession } from "@/lib/auth/session";

// Registration-form edits shared by teachers and the super admin. Each runs as
// the signed-in user, so RLS decides scope: a teacher only reaches their own
// class (at any time); the super admin reaches everyone.

export type StaffEditResult = { ok: true; message: string } | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_OUT: StaffEditResult = { ok: false, message: "Please sign in again." };
const FAILED: StaffEditResult = { ok: false, message: "That didn't save. Check your connection and try again." };

/** Set or clear a student's entry date. */
export async function setEntryDate(studentId: string, date: string | null): Promise<StaffEditResult> {
  if (!UUID_RE.test(studentId)) return { ok: false, message: "Unknown student." };
  if (date !== null && !isIsoDate(date)) return { ok: false, message: "Choose a valid date." };
  const session = await getStaffSession();
  if (!session) return SIGNED_OUT;
  const { supabase } = session;

  const { data: today } = await supabase.rpc("current_service_date");
  if (date && today && date > today) return { ok: false, message: "The entry date can't be in the future." };

  const { data, error } = await supabase.from("students").update({ entry_date: date }).eq("id", studentId).select("id");
  refresh();
  if (error) {
    console.error("[forms] setEntryDate failed", error.code, error.message);
    return FAILED;
  }
  if (!data?.length) return { ok: false, message: "You can only edit students in your own class." };
  return { ok: true, message: date ? "Entry date saved." : "Entry date cleared." };
}

/** Write, change or (with empty text) delete the remark for one student on one Sunday. */
export async function saveRemark(studentId: string, date: string, remark: string): Promise<StaffEditResult> {
  if (!UUID_RE.test(studentId)) return { ok: false, message: "Unknown student." };
  if (!isIsoDate(date)) return { ok: false, message: "Choose a valid date." };
  const text = remark.trim();
  if (text.length > 500) return { ok: false, message: "Keep the remark under 500 characters." };
  const session = await getStaffSession();
  if (!session) return SIGNED_OUT;
  const { supabase } = session;

  if (!text) {
    const { error } = await supabase.from("student_remarks").delete().eq("student_id", studentId).eq("service_date", date);
    refresh();
    if (error) {
      console.error("[forms] delete remark failed", error.code, error.message);
      return FAILED;
    }
    return { ok: true, message: "Remark removed." };
  }

  // class_id is derived from the student by the database trigger.
  const { error } = await supabase
    .from("student_remarks")
    .upsert(
      { student_id: studentId, service_date: date, remark: text },
      { onConflict: "student_id,service_date" },
    );
  refresh();
  if (error) {
    if (error.code === "AW004") return { ok: false, message: "Remarks can't be written for a future date." };
    if (error.code === "42501") return { ok: false, message: "You can only write remarks for your own class." };
    console.error("[forms] saveRemark failed", error.code, error.message);
    return FAILED;
  }
  return { ok: true, message: "Remark saved." };
}
