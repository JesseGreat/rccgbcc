import type { Metadata } from "next";
import Link from "next/link";

import { addDays, formatMediumDate, isIsoDate } from "@/lib/attendance/dates";
import { formatTime, localDate, startOfLocalDay } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

// Each category is an action filter: an exact action, a LIKE pattern, or several patterns.
const CATEGORIES: Record<string, { label: string; actions: string[] }> = {
  all: { label: "Everything", actions: [] },
  attendance: { label: "Attendance changes", actions: ["attendance.insert", "attendance.update", "attendance.delete"] },
  device_limit: { label: "Device-limit rejections", actions: ["attendance.device_limit_reached"] },
  students: { label: "Students & merges", actions: ["students.%"] },
  flags: { label: "Teacher flags", actions: ["student_flags.%"] },
  classes: { label: "Classes", actions: ["classes.%"] },
  accounts: { label: "Staff accounts", actions: ["profiles.%", "teachers.%"] },
  settings: { label: "Settings", actions: ["app_settings.%"] },
  export: { label: "Exports", actions: ["export.%"] },
};

function describe(action: string, details: Json): string {
  const d = (details ?? {}) as Record<string, unknown>;
  const row = ((d.new ?? d.old) ?? {}) as Record<string, unknown>;
  const name = (d.full_name ?? row.full_name ?? row.name ?? d.email ?? row.email ?? "") as string;
  const changed = (field: string) =>
    Boolean(d.old && d.new) && JSON.stringify((d.old as Record<string, unknown>)[field]) !== JSON.stringify((d.new as Record<string, unknown>)[field]);
  const activeChange = changed("is_active") ? ((d.new as Record<string, unknown>).is_active ? "Reactivated" : "Deactivated") : null;
  if (action === "profiles.update" || action === "students.update" || action === "classes.update") {
    const what = action === "profiles.update" ? "account" : action === "students.update" ? "student" : "class";
    if (activeChange) return `${activeChange} ${what} ${name}`;
    if (changed("class_id")) return `Moved ${what} ${name} to another class`;
    if (changed("full_name") || changed("name")) {
      const oldName = ((d.old as Record<string, unknown>).full_name ?? (d.old as Record<string, unknown>).name) as string;
      return `Renamed ${what} ${oldName} → ${name}`;
    }
  }
  const labels: Record<string, string> = {
    "attendance.insert": `Marked present (${row.service_date ?? ""}, ${row.source ?? ""})`,
    "attendance.delete": `Removed attendance (${row.service_date ?? ""})`,
    "attendance.update": "Changed attendance record",
    "attendance.device_limit_reached": `Phone limit reached (limit ${d.limit}): ${name} · ${d.class_name ?? ""}`,
    "students.insert": `Added student ${name}`,
    "students.update": `Updated student ${name}`,
    "students.delete": `Deleted student ${name}`,
    "students.merge": `Merged ${(d.removed as Record<string, unknown>)?.full_name ?? ""} into ${(d.kept as Record<string, unknown>)?.full_name ?? ""}`,
    "classes.insert": `Created class ${name}`,
    "classes.update": `Updated class ${name}`,
    "profiles.update": `Updated account ${name}`,
    "profiles.insert": `Created account ${name}`,
    "teachers.create": `Created teacher account ${name} (${d.class_name ?? ""})`,
    "teachers.reset_password": `Reset password for ${d.email ?? ""}`,
    "app_settings.update": "Changed settings",
    "export.xlsx": `Exported Excel: ${d.scope ?? ""}, ${d.from ?? ""} to ${d.to ?? ""}`,
    "export.pdf": `Exported PDF: ${d.scope ?? ""}, ${d.from ?? ""} to ${d.to ?? ""}`,
    "student_flags.insert": `Flagged a student: “${row.reason ?? ""}”`,
    "student_flags.update": `Flag marked ${row.status ?? ""}`,
    "seed.run": "Sample data loaded",
  };
  return labels[action] ?? action;
}

export default async function AuditPage(props: PageProps<"/sundayschool/audit">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);
  const category = typeof sp.category === "string" && sp.category in CATEGORIES ? sp.category : "all";
  const from = isIsoDate(sp.from) ? sp.from : "";
  const to = isIsoDate(sp.to) ? sp.to : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  const { data: settings } = await supabase.from("app_settings").select("timezone").eq("id", 1).single();
  const timeZone = settings?.timezone ?? "Africa/Lagos";

  let q = supabase
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const actions = CATEGORIES[category].actions;
  if (actions.length) q = q.or(actions.map((a) => (a.includes("%") ? `action.like.${a}` : `action.eq.${a}`)).join(","));
  // Filter by calendar days in the church's timezone.
  if (from) q = q.gte("created_at", startOfLocalDay(from, timeZone));
  if (to) q = q.lt("created_at", startOfLocalDay(addDays(to, 1), timeZone));

  const [{ data: rows, count, error }, { data: people }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  if (error) throw error;

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || "Staff"]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (p > 1) params.set("page", String(p));
    return `/sundayschool/audit?${params.toString()}`;
  };
  const inputClass = "h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Audit log</h2>
        <p className="text-base text-muted-foreground">Every staff change, rejection and export, newest first.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Show</span>
          <select name="category" defaultValue={category} className={inputClass}>
            {Object.entries(CATEGORIES).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">From</span>
          <input type="date" name="from" defaultValue={from} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">To</span>
          <input type="date" name="to" defaultValue={to} className={inputClass} />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
          Filter
        </button>
      </form>

      <p className="text-base text-muted-foreground">{(count ?? 0).toLocaleString("en-NG")} entries</p>

      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className="font-bold break-words">{describe(r.action, r.details)}</p>
              <p className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                {formatMediumDate(localDate(r.created_at, timeZone))} · {formatTime(r.created_at, timeZone)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {r.actor_id ? (names.get(r.actor_id) ?? "Former staff member") : "Student app / system"} ·{" "}
              <code className="text-xs">{r.action}</code>
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Details</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(r.details, null, 2)}
              </pre>
            </details>
          </li>
        ))}
        {(rows ?? []).length === 0 && <li className="p-6 text-center text-muted-foreground">Nothing recorded for these filters.</li>}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={href(page - 1)} className="flex h-12 items-center rounded-xl border-2 bg-card px-4 font-bold">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="flex h-12 items-center rounded-xl border-2 bg-card px-4 font-bold">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
