// Shared helpers for CLI scripts (seed, create-super-admin). Runs under Node,
// outside Next.js, so it builds its own service-role client.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/supabase/database.types";

export type AdminClient = SupabaseClient<Database>;

export function createAdminClient(): { client: AdminClient; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, url };
}

export function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export async function findUserByEmail(client: AdminClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

type StaffInput = {
  email: string;
  password: string;
  fullName: string;
  role: "super_admin" | "teacher";
  classId: string | null;
};

/**
 * Creates the auth user if missing (email pre-confirmed) and upserts the
 * matching profile row. Existing users keep their password unless
 * `resetPassword` is set.
 */
export async function ensureStaffUser(
  client: AdminClient,
  input: StaffInput,
  { resetPassword = false } = {},
): Promise<{ id: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  let user = await findUserByEmail(client, email);
  let created = false;

  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error) throw error;
    user = data.user;
    created = true;
  } else if (resetPassword) {
    const { error } = await client.auth.admin.updateUserById(user.id, { password: input.password });
    if (error) throw error;
  }

  const { error: profileError } = await client.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: input.fullName,
      role: input.role,
      class_id: input.role === "teacher" ? input.classId : null,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  return { id: user.id, created };
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
