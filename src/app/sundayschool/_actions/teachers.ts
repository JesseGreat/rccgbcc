"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { fail, formValues, fromZodError, ok, unexpected, type FormState } from "@/lib/admin/form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Teacher accounts are provisioned here with the service role: it's the only
// way auth users are created. There is no signup route anywhere.

const password = z.string().min(10, "Use at least 10 characters.").max(72, "Keep it under 72 characters.");

const createSchema = z.object({
  fullName: z.string().min(2, "Enter their name.").max(100),
  email: z.email("Enter a valid email address.").transform((e) => e.toLowerCase()),
  classId: z.uuid("Choose a class."),
  password,
});

async function audit(actorId: string, action: string, entityId: string | null, details: Record<string, unknown>) {
  const { error } = await getSupabaseAdmin().from("audit_log").insert({
    actor_id: actorId,
    action,
    entity: "profiles",
    entity_id: entityId,
    details: details as never,
  });
  if (error) console.error("[admin] audit insert failed", action, error.message);
}

export async function createTeacher(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile: me } = await requireSuperAdmin();
  const parsed = createSchema.safeParse(formValues(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { fullName, email, classId, password: pw } = parsed.data;

  const { data: cls } = await supabase.from("classes").select("id, name, is_active").eq("id", classId).maybeSingle();
  if (!cls) return fail("That class doesn't exist.", { classId: "Choose a class." });
  if (!cls.is_active) return fail("That class is deactivated.", { classId: "Choose an active class." });

  const admin = getSupabaseAdmin();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError || !created.user) {
    const exists = authError?.code === "email_exists" || /already been registered|already exists/i.test(authError?.message ?? "");
    if (exists) return fail("An account with this email already exists.", { email: "Email already in use." });
    if (authError?.code === "weak_password") return fail("That password is too weak.", { password: authError.message });
    return unexpected("createTeacher auth", authError);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    role: "teacher",
    class_id: classId,
  });
  if (profileError) {
    // Don't leave a login without a profile behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return unexpected("createTeacher profile", profileError);
  }

  await audit(me.id, "teachers.create", created.user.id, { email, full_name: fullName, class_id: classId, class_name: cls.name });
  refresh();
  return ok(`${fullName} can now sign in to ${cls.name} with ${email} and this password:`, pw);
}

export async function resetTeacherPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile: me } = await requireSuperAdmin();
  const values = formValues(formData);
  const userId = z.uuid().safeParse(values.userId);
  const pw = password.safeParse(values.password);
  if (!userId.success) return fail("Unknown account.");
  if (!pw.success) return fail("Please check the password.", { password: pw.error.issues[0].message });

  const { data: target } = await supabase.from("profiles").select("id, email, full_name").eq("id", userId.data).maybeSingle();
  if (!target) return fail("Unknown account.");

  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId.data, { password: pw.data });
  if (error) return unexpected("resetTeacherPassword", error);

  await audit(me.id, "teachers.reset_password", userId.data, { email: target.email });
  return ok(`New password for ${target.full_name || target.email}:`, pw.data);
}

export async function reassignTeacherClass(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const values = formValues(formData);
  const userId = z.uuid().safeParse(values.userId);
  const classId = z.uuid().safeParse(values.classId);
  if (!userId.success) return fail("Unknown account.");
  if (!classId.success) return fail("Choose a class.", { classId: "Choose a class." });

  // Audited by the profiles trigger (old and new class).
  const { data, error } = await supabase
    .from("profiles")
    .update({ class_id: classId.data })
    .eq("id", userId.data)
    .eq("role", "teacher")
    .select("id");
  if (error) return unexpected("reassignTeacherClass", error);
  if (!data?.length) return fail("Only teacher accounts have a class.");
  refresh();
  return ok("Class updated. They'll see the new class next time a page loads.");
}

export async function setTeacherActive(userId: string, active: boolean): Promise<FormState> {
  const { supabase, profile: me } = await requireSuperAdmin();
  if (!z.uuid().safeParse(userId).success) return fail("Unknown account.");
  if (userId === me.id) return fail("You can't deactivate your own account.");

  // Profile flag: RLS stops a deactivated account seeing anything immediately.
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return unexpected("setTeacherActive", error);

  // Auth ban: stops new sign-ins and token refreshes.
  const { error: banError } = await getSupabaseAdmin().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) console.error("[admin] ban update failed", banError.message);

  refresh();
  return ok(active ? "Account reactivated." : "Account deactivated.");
}
