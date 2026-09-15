import type { Metadata } from "next";

import {
  CreateTeacherButton,
  ReassignClassButton,
  ResetPasswordButton,
  TeacherActiveButton,
} from "@/components/admin/teacher-controls";
import { Badge } from "@/components/ui/badge";
import { formatMediumDate } from "@/lib/attendance/dates";
import { localDate } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const { supabase, profile: me } = await requireSuperAdmin();

  const [profiles, classes, settings, authUsers] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, class_id, is_active").order("full_name"),
    supabase.from("classes").select("id, name, is_active").order("name"),
    supabase.from("app_settings").select("timezone").eq("id", 1).single(),
    // Last sign-in lives in auth, readable only with the service role (server-side).
    getSupabaseAdmin().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const timeZone = settings.data?.timezone ?? "Africa/Lagos";
  const classNames = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
  const activeClasses = (classes.data ?? []).filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }));
  const lastSignIn = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));

  const all = profiles.data ?? [];
  const teachers = all.filter((p) => p.role === "teacher");
  const admins = all.filter((p) => p.role === "super_admin");

  const seen = (id: string) => {
    const at = lastSignIn.get(id);
    return at ? `Last signed in ${formatMediumDate(localDate(at, timeZone))}` : "Never signed in";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Teachers</h2>
          <p className="text-base text-muted-foreground">Each teacher sees only the class they&apos;re assigned to.</p>
        </div>
        <CreateTeacherButton classes={activeClasses} />
      </div>

      <ul className="flex flex-col gap-2">
        {teachers.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {t.full_name || t.email}
                {!t.is_active && <Badge variant="secondary">Deactivated</Badge>}
              </p>
              <p className="text-base break-all text-muted-foreground">{t.email}</p>
              <p className="text-sm text-muted-foreground">
                {(t.class_id && classNames.get(t.class_id)) ?? "No class"} · {seen(t.id)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ReassignClassButton userId={t.id} name={t.full_name} classId={t.class_id} classes={activeClasses} />
              <ResetPasswordButton userId={t.id} name={t.full_name || t.email || "this teacher"} />
              <TeacherActiveButton userId={t.id} name={t.full_name || t.email || "this teacher"} active={t.is_active} />
            </div>
          </li>
        ))}
        {teachers.length === 0 && (
          <li className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No teacher accounts yet.</li>
        )}
      </ul>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">Superintendents</h3>
        <p className="text-sm text-muted-foreground">
          Superintendent accounts are created from the command line (<code>pnpm create-super-admin</code>).
        </p>
        <ul className="flex flex-col gap-2">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-bold">
                  {a.full_name || a.email} {a.id === me.id && <span className="text-base font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="text-sm break-all text-muted-foreground">
                  {a.email} · {seen(a.id)}
                </p>
              </div>
              <ResetPasswordButton userId={a.id} name={a.full_name || a.email || "this account"} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
