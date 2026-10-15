import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { datesOnWeekday } from "@/lib/attendance/dates";
import { fetchAll } from "@/lib/db/fetch-all";
import type { Database } from "@/lib/supabase/database.types";

import type { DateRange } from "./load";

type Client = SupabaseClient<Database>;
type ClassScope = string[] | "all";

// ---------------------------------------------------------------------------
// Sunday remarks
// ---------------------------------------------------------------------------
export type Remark = { studentId: string; date: string; remark: string };

/** Remarks keyed "studentId|date". Runs as the caller, so RLS bounds it. */
export async function loadRemarks(
  supabase: Client,
  opts: { classIds: ClassScope; range?: DateRange },
): Promise<Remark[]> {
  const rows = await fetchAll((a, b) => {
    let q = supabase
      .from("student_remarks")
      .select("student_id, service_date, remark")
      .order("service_date")
      .order("id")
      .range(a, b);
    if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
    if (opts.range) q = q.gte("service_date", opts.range.from).lte("service_date", opts.range.to);
    return q;
  });
  return rows.map((r) => ({ studentId: r.student_id, date: r.service_date, remark: r.remark }));
}

export function remarkKey(studentId: string, date: string): string {
  return `${studentId}|${date}`;
}

// ---------------------------------------------------------------------------
// Sunday School Students Registration Form
// ---------------------------------------------------------------------------
export type RegistrationRow = {
  id: string;
  fullName: string;
  className: string;
  ageGroup: string | null;
  gender: string | null;
  phone: string | null;
  entryDate: string | null;
  /** Every remark, oldest first. */
  remarks: { date: string; remark: string }[];
};

/** Active students, sorted by class then name, with all their remarks. */
export async function loadRegistration(supabase: Client, opts: { classIds: ClassScope }): Promise<RegistrationRow[]> {
  const [students, remarks] = await Promise.all([
    fetchAll((a, b) => {
      let q = supabase
        .from("students")
        .select("id, full_name, age_group, gender, phone, entry_date, classes(name)")
        .eq("is_active", true)
        .order("id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
    loadRemarks(supabase, { classIds: opts.classIds }),
  ]);

  const byStudent = new Map<string, { date: string; remark: string }[]>();
  for (const r of remarks) {
    let list = byStudent.get(r.studentId);
    if (!list) byStudent.set(r.studentId, (list = []));
    list.push({ date: r.date, remark: r.remark });
  }

  return students
    .map((s) => ({
      id: s.id,
      fullName: s.full_name,
      className: s.classes?.name ?? "",
      ageGroup: s.age_group,
      gender: s.gender,
      phone: s.phone,
      entryDate: s.entry_date,
      remarks: byStudent.get(s.id) ?? [],
    }))
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className) || a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base" }),
    );
}

// ---------------------------------------------------------------------------
// Sunday School Teachers and Assistant Teachers Form
// ---------------------------------------------------------------------------
export type TeacherFormRow = {
  date: string;
  profileId: string;
  name: string;
  title: "teacher" | "assistant_teacher";
  className: string;
  present: boolean;
  markedAt: string | null;
  topic: string | null;
  remarks: string | null;
};

/**
 * One row per teacher per service day in the range: present (with topic and
 * remarks) or absent. Absent rows use the teacher's current class and title;
 * present rows use what was recorded that day. Super admin only (RLS).
 */
export async function loadTeachersForm(
  supabase: Client,
  opts: { classIds: ClassScope; range: DateRange; today: string; serviceDow: number },
): Promise<{ dates: string[]; rows: TeacherFormRow[] }> {
  const { from, to } = opts.range;
  const [teachers, entries, classes] = await Promise.all([
    fetchAll((a, b) => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, staff_title, class_id, is_active, created_at")
        .eq("role", "teacher")
        .order("id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
    fetchAll((a, b) => {
      let q = supabase
        .from("teacher_attendance")
        .select("profile_id, class_id, staff_title, service_date, marked_at, topic, remarks, profiles(full_name, email)")
        .gte("service_date", from)
        .lte("service_date", to)
        .order("id")
        .range(a, b);
      if (opts.classIds !== "all") q = q.in("class_id", opts.classIds);
      return q;
    }),
    fetchAll((a, b) => supabase.from("classes").select("id, name").order("id").range(a, b)),
  ]);

  const classNames = new Map(classes.map((c) => [c.id, c.name]));
  const lastDate = to < opts.today ? to : opts.today;
  const dateSet = new Set(from <= lastDate ? datesOnWeekday(from, lastDate, opts.serviceDow) : []);
  for (const e of entries) dateSet.add(e.service_date);
  const dates = [...dateSet].sort();

  const entryByKey = new Map(entries.map((e) => [`${e.profile_id}|${e.service_date}`, e]));
  const rows: TeacherFormRow[] = [];

  for (const date of dates) {
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.service_date !== date) continue;
      seen.add(e.profile_id);
      rows.push({
        date,
        profileId: e.profile_id,
        name: e.profiles?.full_name || e.profiles?.email || "Unknown",
        title: e.staff_title,
        className: classNames.get(e.class_id) ?? "",
        present: true,
        markedAt: e.marked_at,
        topic: e.topic,
        remarks: e.remarks,
      });
    }
    for (const t of teachers) {
      // Absent only counts for active teachers who already existed that day.
      if (seen.has(t.id) || !t.is_active || !t.class_id || t.created_at.slice(0, 10) > date) continue;
      if (entryByKey.has(`${t.id}|${date}`)) continue;
      rows.push({
        date,
        profileId: t.id,
        name: t.full_name || t.email || "Unknown",
        title: t.staff_title,
        className: classNames.get(t.class_id) ?? "",
        present: false,
        markedAt: null,
        topic: null,
        remarks: null,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.className.localeCompare(b.className) ||
      (a.title === b.title ? 0 : a.title === "teacher" ? -1 : 1) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  return { dates, rows };
}
