"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { fail, formValues, fromZodError, ok, unexpected, type FormState } from "@/lib/admin/form";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { MergeStudentsResult } from "@/lib/db/types";

const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,22}[0-9]$/;

const studentSchema = z.object({
  classId: z.uuid("Choose a class."),
  fullName: z.string().min(2, "Enter the full name.").max(100, "Keep it under 100 characters."),
  phone: z
    .string()
    .max(32)
    .refine((v) => !v || PHONE_RE.test(v), "Use digits only, like 0803 123 4567.")
    .optional()
    .default(""),
  gender: z.enum(["", "male", "female"]).optional().default(""),
  ageGroup: z.string().max(40).optional().default(""),
});

const NAME_TAKEN = fail("Someone with that name is already in that class. Consider merging the two records.", {
  fullName: "Name already used in that class.",
});

export async function createStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const parsed = studentSchema.safeParse(formValues(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;

  const { error } = await supabase.from("students").insert({
    class_id: d.classId,
    full_name: d.fullName,
    phone: d.phone || null,
    gender: d.gender || null,
    age_group: d.ageGroup || null,
  });
  if (error?.code === "23505") return NAME_TAKEN;
  if (error) return unexpected("createStudent", error);
  refresh();
  return ok(`${d.fullName} added.`);
}

export async function updateStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const values = formValues(formData);
  const id = z.uuid().safeParse(values.id);
  if (!id.success) return fail("Unknown student.");
  const parsed = studentSchema.safeParse(values);
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;

  // Moving class also moves attendance history (database trigger); all audited.
  const { error } = await supabase
    .from("students")
    .update({
      class_id: d.classId,
      full_name: d.fullName,
      phone: d.phone || null,
      gender: d.gender || null,
      age_group: d.ageGroup || null,
    })
    .eq("id", id.data);
  if (error?.code === "23505") return NAME_TAKEN;
  if (error) return unexpected("updateStudent", error);
  refresh();
  return ok("Student updated.");
}

export async function setStudentActive(studentId: string, active: boolean): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  if (!z.uuid().safeParse(studentId).success) return fail("Unknown student.");
  const { error } = await supabase.from("students").update({ is_active: active }).eq("id", studentId);
  if (error?.code === "23505") return NAME_TAKEN;
  if (error) return unexpected("setStudentActive", error);
  refresh();
  return ok(active ? "Student reactivated." : "Student deactivated.");
}

/** Hard delete, only for records with no attendance (mistakes, test entries). */
export async function deleteStudent(studentId: string): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  if (!z.uuid().safeParse(studentId).success) return fail("Unknown student.");

  const { count, error: countError } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  if (countError) return unexpected("deleteStudent count", countError);
  if (count) {
    return fail(
      `This student has ${count} attendance ${count === 1 ? "record" : "records"}. Deactivate them, or merge them into the correct record, instead.`,
    );
  }

  const { error } = await supabase.from("students").delete().eq("id", studentId);
  if (error) return unexpected("deleteStudent", error);
  refresh();
  return ok("Student deleted.");
}

export async function mergeStudents(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const values = formValues(formData);
  const keep = z.uuid().safeParse(values.keepId);
  const remove = z.uuid().safeParse(values.removeId);
  if (!keep.success || !remove.success || keep.data === remove.data) return fail("Choose two different records.");

  const { data, error } = await supabase.rpc("merge_students", { p_keep_id: keep.data, p_remove_id: remove.data });
  if (error?.code === "AW003") return fail("One of those records no longer exists.");
  if (error) return unexpected("mergeStudents", error);

  const result = data as unknown as MergeStudentsResult;
  refresh();
  return ok(
    `Merged. ${result.attendance_moved} attendance ${result.attendance_moved === 1 ? "day" : "days"} moved` +
      (result.attendance_dropped_as_duplicate_days
        ? `, ${result.attendance_dropped_as_duplicate_days} already on the kept record.`
        : "."),
  );
}

export async function resolveFlag(flagId: string, status: "resolved" | "dismissed"): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  if (!z.uuid().safeParse(flagId).success) return fail("Unknown flag.");
  const { error } = await supabase.from("student_flags").update({ status }).eq("id", flagId);
  if (error) return unexpected("resolveFlag", error);
  refresh();
  return ok(status === "resolved" ? "Marked as fixed." : "Flag dismissed.");
}
