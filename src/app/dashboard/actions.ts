"use server";

import { refresh } from "next/cache";

import { requireTeacher } from "@/lib/auth/session";

export type TeacherActionResult =
  | { ok: true }
  | { ok: false; code: "WINDOW_CLOSED" | "INVALID_INPUT" | "UNAVAILABLE"; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLOSED: TeacherActionResult = {
  ok: false,
  code: "WINDOW_CLOSED",
  message: "Attendance can only be changed while it's open.",
};
const UNAVAILABLE: TeacherActionResult = {
  ok: false,
  code: "UNAVAILABLE",
  message: "That didn't save. Check your connection and try again.",
};

// Every action re-checks the session and runs as the teacher, so RLS enforces
// "own class, today, window open". The checks here only produce friendly messages.

export async function markPresent(studentId: string): Promise<TeacherActionResult> {
  if (!UUID_RE.test(studentId)) return { ok: false, code: "INVALID_INPUT", message: "Unknown student." };
  const { supabase, classId } = await requireTeacher();

  // class_id, service_date and source are set by the database trigger.
  const { error } = await supabase.from("attendance").insert({ student_id: studentId, class_id: classId });

  refresh();
  if (!error || error.code === "23505") return { ok: true }; // 23505: already present
  if (error.code === "42501") return CLOSED; // RLS: window closed (or not their student)
  console.error("[dashboard] markPresent failed", error.code, error.message);
  return UNAVAILABLE;
}

export async function undoMark(studentId: string): Promise<TeacherActionResult> {
  if (!UUID_RE.test(studentId)) return { ok: false, code: "INVALID_INPUT", message: "Unknown student." };
  const { supabase } = await requireTeacher();

  const [{ data: serviceDate, error: dateError }, { data: isOpen }] = await Promise.all([
    supabase.rpc("current_service_date"),
    supabase.rpc("is_attendance_open"),
  ]);
  if (dateError || !serviceDate) return UNAVAILABLE;
  if (!isOpen) {
    refresh();
    return CLOSED;
  }

  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("service_date", serviceDate);

  refresh();
  if (error) {
    console.error("[dashboard] undoMark failed", error.code, error.message);
    return UNAVAILABLE;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Teachers and Assistant Teachers Form: a teacher marks themselves present,
// only while the window is open. RLS locks every change once it closes.
// ---------------------------------------------------------------------------

function cleanText(value: string, max: number): string | null | false {
  const text = value.trim();
  if (text.length > max) return false;
  return text || null;
}

export async function markSelfPresent(input: { topic: string; remarks: string }): Promise<TeacherActionResult> {
  const topic = cleanText(input.topic, 200);
  const remarks = cleanText(input.remarks, 500);
  if (topic === false || remarks === false) {
    return { ok: false, code: "INVALID_INPUT", message: "Keep the topic under 200 and remarks under 500 characters." };
  }
  const { supabase, profile } = await requireTeacher();

  // class, title, date and time are stamped by the database trigger.
  const { error } = await supabase.from("teacher_attendance").insert({ profile_id: profile.id, topic, remarks });

  refresh();
  if (!error || error.code === "23505") return { ok: true }; // 23505: already marked
  if (error.code === "42501") return CLOSED;
  console.error("[dashboard] markSelfPresent failed", error.code, error.message);
  return UNAVAILABLE;
}

export async function updateSelfEntry(input: { topic: string; remarks: string }): Promise<TeacherActionResult> {
  const topic = cleanText(input.topic, 200);
  const remarks = cleanText(input.remarks, 500);
  if (topic === false || remarks === false) {
    return { ok: false, code: "INVALID_INPUT", message: "Keep the topic under 200 and remarks under 500 characters." };
  }
  const { supabase, profile } = await requireTeacher();

  const { data: serviceDate } = await supabase.rpc("current_service_date");
  if (!serviceDate) return UNAVAILABLE;
  const { data, error } = await supabase
    .from("teacher_attendance")
    .update({ topic, remarks })
    .eq("profile_id", profile.id)
    .eq("service_date", serviceDate)
    .select("id");

  refresh();
  if (error) {
    console.error("[dashboard] updateSelfEntry failed", error.code, error.message);
    return UNAVAILABLE;
  }
  return data?.length ? { ok: true } : CLOSED; // RLS hides the row once the window closes
}

export async function undoSelfMark(): Promise<TeacherActionResult> {
  const { supabase, profile } = await requireTeacher();

  const { data: serviceDate } = await supabase.rpc("current_service_date");
  if (!serviceDate) return UNAVAILABLE;
  const { data, error } = await supabase
    .from("teacher_attendance")
    .delete()
    .eq("profile_id", profile.id)
    .eq("service_date", serviceDate)
    .select("id");

  refresh();
  if (error) {
    console.error("[dashboard] undoSelfMark failed", error.code, error.message);
    return UNAVAILABLE;
  }
  return data?.length ? { ok: true } : CLOSED;
}

export async function flagStudent(studentId: string, reason: string): Promise<TeacherActionResult> {
  const trimmed = reason.trim();
  if (!UUID_RE.test(studentId) || trimmed.length < 3 || trimmed.length > 500) {
    return { ok: false, code: "INVALID_INPUT", message: "Please describe the problem (at least a few words)." };
  }
  const { supabase, classId, profile } = await requireTeacher();

  const { error } = await supabase.from("student_flags").insert({
    student_id: studentId,
    class_id: classId,
    reason: trimmed,
    flagged_by: profile.id,
  });

  refresh();
  if (error) {
    console.error("[dashboard] flagStudent failed", error.code, error.message);
    return error.code === "42501"
      ? { ok: false, code: "INVALID_INPUT", message: "You can only flag students in your own class." }
      : UNAVAILABLE;
  }
  return { ok: true };
}
