// Date/time formatting that renders identically on server and client.
// Only numeric fields come from Intl; words come from our own tables, so ICU
// version differences between Node and phones can't cause hydration mismatches.

import type { WindowState } from "@/lib/db/types";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; dow: number };

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function localParts(iso: string, timeZone: string): LocalParts {
  let fmt = partFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partFormatters.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(iso)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, dow };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:22", or "2:05:09" past an hour. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "8:05 AM" in the given timezone. */
export function formatTime(iso: string, timeZone: string): string {
  const { hour, minute } = localParts(iso, timeZone);
  return formatClock(hour, minute);
}

/** "08:40" (from app settings) -> "8:40 AM". */
export function formatSettingTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return formatClock(h, m);
}

function formatClock(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${suffix}`;
}

/** "Sunday 20 September" in the given timezone. */
export function formatDayDate(iso: string, timeZone: string): string {
  const { day, month, dow } = localParts(iso, timeZone);
  return `${DAY_NAMES[dow]} ${day} ${MONTH_NAMES[month - 1]}`;
}

/** "YYYY-MM-DD" in the given timezone. */
export function localDate(iso: string, timeZone: string): string {
  const { year, month, day } = localParts(iso, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export type WindowPhase = "open" | "opens-today" | "closed";

export function windowPhase(window: WindowState): WindowPhase {
  if (window.is_open) return "open";
  return localDate(window.opens_at, window.timezone) === window.service_date ? "opens-today" : "closed";
}

/** ISO timestamp for local midnight at the start of `date` in `timeZone` (e.g. "2026-09-13T00:00:00+01:00"). */
export function startOfLocalDay(date: string, timeZone: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  const offset = match ? `${match[1]}:${match[2] ?? "00"}` : "+00:00";
  return `${date}T00:00:00${offset}`;
}
