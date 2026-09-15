import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Role } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffProfile = {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
  classId: string | null;
  className: string | null;
};

/**
 * The signed-in staff member, or null. Verified against the auth server (not
 * just the cookie) and memoised for the duration of one request.
 * An auth user without an active profile row counts as signed out.
 */
export const getStaffSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, class_id, is_active, classes(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] profile lookup failed", error.message);
    return null;
  }
  if (!profile || !profile.is_active) return null;

  const staff: StaffProfile = {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    classId: profile.class_id,
    className: profile.classes?.name ?? null,
  };
  return { supabase, profile: staff };
});

export function homePathFor(role: Role): string {
  return role === "super_admin" ? "/sundayschool" : "/dashboard";
}

/** For teacher pages and actions. Super admins are sent to their own dashboard. */
export async function requireTeacher() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "teacher") redirect(homePathFor(session.profile.role));
  const { classId, className } = session.profile;
  if (!classId || !className) {
    // A teacher whose class was removed or is unreadable: nothing safe to show.
    redirect("/login?error=no_class");
  }
  return { ...session, classId, className };
}

export async function requireSuperAdmin() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "super_admin") redirect(homePathFor(session.profile.role));
  return session;
}
