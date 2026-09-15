import type { Metadata } from "next";

import { ClassActiveButton, CreateClassButton, EditClassButton } from "@/components/admin/class-controls";
import { Badge } from "@/components/ui/badge";
import { requireSuperAdmin } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db/fetch-all";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const { supabase } = await requireSuperAdmin();

  const [classes, students, teachers] = await Promise.all([
    supabase.from("classes").select("id, name, description, is_active, created_at").order("is_active", { ascending: false }).order("name"),
    fetchAll((a, b) => supabase.from("students").select("class_id, is_active").order("id").range(a, b)),
    supabase.from("profiles").select("full_name, class_id, is_active").eq("role", "teacher"),
  ]);

  const counts = new Map<string, number>();
  for (const s of students) if (s.is_active) counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
  const teacherNames = new Map<string, string[]>();
  for (const t of teachers.data ?? []) {
    if (t.class_id && t.is_active) teacherNames.set(t.class_id, [...(teacherNames.get(t.class_id) ?? []), t.full_name]);
  }

  const rows = classes.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Classes</h2>
          <p className="text-base text-muted-foreground">Deactivating hides a class from students but keeps its history.</p>
        </div>
        <CreateClassButton />
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {c.name}
                {!c.is_active && <Badge variant="secondary">Deactivated</Badge>}
              </p>
              {c.description && <p className="text-base text-muted-foreground">{c.description}</p>}
              <p className="text-sm text-muted-foreground">
                {counts.get(c.id) ?? 0} active students ·{" "}
                {teacherNames.get(c.id)?.join(", ") ?? "no teacher assigned"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <EditClassButton cls={c} />
              <ClassActiveButton cls={c} />
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No classes yet.</li>
        )}
      </ul>
    </div>
  );
}
