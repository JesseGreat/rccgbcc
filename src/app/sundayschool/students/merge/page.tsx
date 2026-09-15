import { ArrowLeft, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MergePanel, type MergeCandidate } from "@/components/admin/merge-panel";
import { formatMediumDate } from "@/lib/attendance/dates";
import { localDate } from "@/lib/attendance/format";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Merge duplicates" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function loadCandidate(supabase: Client, id: string, timeZone: string): Promise<MergeCandidate | null> {
  const [{ data: s }, { count }, { data: first }, { data: last }] = await Promise.all([
    supabase.from("students").select("id, full_name, phone, is_active, created_at, created_by, classes(name)").eq("id", id).maybeSingle(),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("student_id", id),
    supabase.from("attendance").select("service_date").eq("student_id", id).order("service_date").limit(1),
    supabase.from("attendance").select("service_date").eq("student_id", id).order("service_date", { ascending: false }).limit(1),
  ]);
  if (!s) return null;
  return {
    id: s.id,
    fullName: s.full_name,
    className: s.classes?.name ?? "",
    phone: s.phone,
    isActive: s.is_active,
    addedOn: formatMediumDate(localDate(s.created_at, timeZone)),
    addedBy: s.created_by === "self" ? "by themselves" : "by staff",
    attendanceCount: count ?? 0,
    firstDate: first?.[0] ? formatMediumDate(first[0].service_date) : null,
    lastDate: last?.[0] ? formatMediumDate(last[0].service_date) : null,
  };
}

export default async function MergePage(props: PageProps<"/sundayschool/students/merge">) {
  const [sp, { supabase }] = await Promise.all([props.searchParams, requireSuperAdmin()]);
  const aId = typeof sp.a === "string" && UUID_RE.test(sp.a) ? sp.a : "";
  const bId = typeof sp.b === "string" && UUID_RE.test(sp.b) && sp.b !== aId ? sp.b : "";
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const { data: settings } = await supabase.from("app_settings").select("timezone").eq("id", 1).single();
  const timeZone = settings?.timezone ?? "Africa/Lagos";

  const [a, b] = await Promise.all([
    aId ? loadCandidate(supabase, aId, timeZone) : null,
    bId ? loadCandidate(supabase, bId, timeZone) : null,
  ]);

  // Suggest likely duplicates of A by first/last name fragments, or run the typed search.
  const needle = query || (a ? a.fullName.split(" ").sort((x, y) => y.length - x.length)[0] : "");
  const { data: results } = needle
    ? await supabase
        .from("students")
        .select("id, full_name, is_active, classes(name)")
        .ilike("full_name", `%${needle.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
        .order("full_name")
        .limit(25)
    : { data: [] };

  const href = (next: { a?: string; b?: string }) => {
    const params = new URLSearchParams();
    const na = next.a ?? aId;
    const nb = next.b ?? bId;
    if (na) params.set("a", na);
    if (nb) params.set("b", nb);
    if (query) params.set("q", query);
    return `/sundayschool/students/merge?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/sundayschool/students" className="flex items-center gap-2 self-start text-base font-bold text-muted-foreground">
        <ArrowLeft className="size-5" aria-hidden /> Students
      </Link>
      <div>
        <h2 className="text-2xl font-bold">Merge duplicate records</h2>
        <p className="text-base text-muted-foreground">
          Pick the two records for the same person, then choose which one to keep.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Record A", c: a, param: "a" as const },
          { label: "Record B", c: b, param: "b" as const },
        ].map(({ label, c, param }) => (
          <div key={param} className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-bold text-muted-foreground">{label}</p>
            {c ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold">
                  {c.fullName} <span className="text-base font-normal text-muted-foreground">· {c.className}</span>
                </p>
                <Link href={href({ [param]: "" })} className="text-sm font-bold text-primary underline">
                  Change
                </Link>
              </div>
            ) : (
              <p className="text-lg text-muted-foreground">Not chosen yet</p>
            )}
          </div>
        ))}
      </div>

      {a && b ? (
        <MergePanel key={`${a.id}-${b.id}`} a={a} b={b} />
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <form method="get" className="flex flex-wrap items-end gap-2">
            {aId && <input type="hidden" name="a" value={aId} />}
            {bId && <input type="hidden" name="b" value={bId} />}
            <label className="flex min-w-56 flex-1 flex-col gap-1">
              <span className="text-sm font-bold">Find a student</span>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Type part of a name"
                  className="h-12 w-full rounded-xl border-2 border-input bg-card pr-3 pl-10 text-base focus:border-primary focus:outline-none"
                />
              </span>
            </label>
            <button type="submit" className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
              Search
            </button>
          </form>
          {needle && !query && a && <p className="text-sm text-muted-foreground">Showing names containing &ldquo;{needle}&rdquo;.</p>}
          <ul className="divide-y">
            {(results ?? [])
              .filter((r) => r.id !== aId && r.id !== bId)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-bold">{r.full_name}</span>{" "}
                    <span className="text-muted-foreground">
                      · {r.classes?.name}
                      {!r.is_active && " · deactivated"}
                    </span>
                  </span>
                  <Link
                    href={href(aId ? { b: r.id } : { a: r.id })}
                    className="flex h-10 items-center rounded-lg border-2 px-3 text-sm font-bold"
                  >
                    Choose as {aId ? "B" : "A"}
                  </Link>
                </li>
              ))}
            {needle && (results ?? []).filter((r) => r.id !== aId && r.id !== bId).length === 0 && (
              <li className="py-3 text-muted-foreground">No other records match.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
