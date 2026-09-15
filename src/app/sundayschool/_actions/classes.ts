"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { fail, formValues, fromZodError, ok, unexpected, type FormState } from "@/lib/admin/form";
import { requireSuperAdmin } from "@/lib/auth/session";

const classSchema = z.object({
  name: z.string().min(1, "Enter a class name.").max(80, "Keep it under 80 characters."),
  description: z.string().max(200, "Keep it under 200 characters.").optional().default(""),
});

export async function createClass(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const parsed = classSchema.safeParse(formValues(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const { error } = await supabase.from("classes").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
  });
  if (error?.code === "23505") return fail("A class with that name already exists.", { name: "Name already in use." });
  if (error) return unexpected("createClass", error);
  refresh();
  return ok(`Class "${parsed.data.name}" created.`);
}

export async function updateClass(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const values = formValues(formData);
  const id = z.uuid().safeParse(values.id);
  const parsed = classSchema.safeParse(values);
  if (!id.success) return fail("Unknown class.");
  if (!parsed.success) return fromZodError(parsed.error);

  const { error } = await supabase
    .from("classes")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", id.data);
  if (error?.code === "23505") return fail("A class with that name already exists.", { name: "Name already in use." });
  if (error) return unexpected("updateClass", error);
  refresh();
  return ok("Class updated.");
}

export async function setClassActive(classId: string, active: boolean): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  if (!z.uuid().safeParse(classId).success) return fail("Unknown class.");
  const { error } = await supabase.from("classes").update({ is_active: active }).eq("id", classId);
  if (error) return unexpected("setClassActive", error);
  refresh();
  return ok(active ? "Class reactivated." : "Class deactivated. Its history is kept.");
}
