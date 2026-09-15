"use server";

import { redirect } from "next/navigation";

import { homePathFor } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string; email?: string };

const GENERIC_ERROR = "That email and password don't match. Please try again.";

/** Only same-site staff paths are allowed as a post-login destination. */
function safeNext(next: FormDataEntryValue | null, fallback: string): string {
  if (typeof next !== "string") return fallback;
  return /^\/(dashboard|sundayschool)(\/|\?|$)/.test(next) ? next : fallback;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && error.status !== 400) console.error("[auth] sign-in failed", error.status, error.message);
    return {
      error: error?.status === 429 ? "Too many attempts. Please wait a minute and try again." : GENERIC_ERROR,
      email,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, class_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || (profile.role === "teacher" && !profile.class_id)) {
    await supabase.auth.signOut();
    return {
      error: "Your account isn't active. Please ask the Sunday School superintendent to check it.",
      email,
    };
  }

  const home = homePathFor(profile.role);
  // A teacher can't be sent into the admin area (and vice versa) via ?next=.
  const next = safeNext(formData.get("next"), home);
  redirect(next.startsWith(home) ? next : home);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
