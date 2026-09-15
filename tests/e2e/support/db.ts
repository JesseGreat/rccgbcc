import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../src/lib/supabase/database.types";

// Test-only database helpers (service role). Never import from app code.

let client: SupabaseClient<Database> | undefined;

export function db(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".local");
  if (!local && process.env.E2E_ALLOW_REMOTE !== "1") {
    throw new Error(`Refusing to run E2E tests against ${url}. Set E2E_ALLOW_REMOTE=1 for a disposable test project.`);
  }
  client = createClient<Database>(url, key, { auth: { persistSession: false } });
  return client;
}

export const creds = {
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@bethel.local",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_SUPER_ADMIN_PASSWORD ?? "",
  teacherEmail: process.env.E2E_TEACHER_EMAIL ?? "teens.teacher@bethel.local",
  teacherPassword: process.env.E2E_TEACHER_PASSWORD ?? process.env.SEED_TEACHER_PASSWORD ?? "",
  teacherClass: process.env.E2E_TEACHER_CLASS ?? "Teens",
};

type Settings = Database["public"]["Tables"]["app_settings"]["Row"];
let original: Settings | undefined;

async function settings(): Promise<Settings> {
  const { data, error } = await db().from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  original ??= data;
  return data;
}

function localClock(timeZone: string, offsetMinutes: number): { dow: number; time: string } {
  const at = new Date(Date.now() + offsetMinutes * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { dow, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

/** Open the window now, closing `closesInMinutes` from now (same local day assumed). */
export async function openWindow(closesInMinutes = 30) {
  const s = await settings();
  const start = localClock(s.timezone, -5);
  const end = localClock(s.timezone, closesInMinutes);
  const { error } = await db()
    .from("app_settings")
    .update({ service_dow: localClock(s.timezone, 0).dow, window_start: start.time, window_end: end.time })
    .eq("id", 1);
  if (error) throw error;
}

export async function closeWindow() {
  const s = await settings();
  const tomorrow = (localClock(s.timezone, 0).dow + 1) % 7;
  const { error } = await db()
    .from("app_settings")
    .update({ service_dow: tomorrow, window_start: "08:00", window_end: "08:40" })
    .eq("id", 1);
  if (error) throw error;
}

export async function setDeviceCap(cap: number) {
  await settings();
  const { error } = await db().from("app_settings").update({ max_marks_per_device: cap }).eq("id", 1);
  if (error) throw error;
}

export async function restoreSettings() {
  if (!original) return;
  const { church_name, service_dow, window_start, window_end, timezone, max_marks_per_device } = original;
  await db()
    .from("app_settings")
    .update({ church_name, service_dow, window_start, window_end, timezone, max_marks_per_device })
    .eq("id", 1);
}

export async function classId(name: string): Promise<string> {
  const { data, error } = await db().from("classes").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

export async function createStudents(className: string, names: string[]): Promise<Record<string, string>> {
  const cid = await classId(className);
  const { data, error } = await db()
    .from("students")
    .insert(names.map((full_name) => ({ class_id: cid, full_name, created_by: "e2e" })))
    .select("id, full_name");
  if (error) throw error;
  return Object.fromEntries(data.map((s) => [s.full_name, s.id]));
}

export async function attendanceToday(studentName: string) {
  const { data: date } = await db().rpc("current_service_date");
  const { data, error } = await db()
    .from("attendance")
    .select("source, device_hash, students!inner(full_name)")
    .eq("students.full_name", studentName)
    .eq("service_date", date as string);
  if (error) throw error;
  return data;
}

/** Remove everything the tests created. */
export async function cleanupE2E() {
  await db().from("students").delete().like("full_name", "E2E %");
}

export function uniqueName(label: string): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const tag = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  return `E2E ${label} ${tag[0].toUpperCase()}${tag.slice(1)}`;
}
