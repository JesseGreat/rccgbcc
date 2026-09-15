// Calendar-date helpers for "YYYY-MM-DD" strings. All arithmetic happens at
// UTC noon so it never crosses a day boundary, whatever the server timezone.

import { DAY_NAMES } from "@/lib/attendance/format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  return toIso(toDate(value)) === value; // rejects 2026-02-30
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function dayOfWeek(iso: string): number {
  return toDate(iso).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** Every date in [from, to] falling on `dow` (0 = Sunday), ascending. */
export function datesOnWeekday(from: string, to: string, dow: number): string[] {
  const out: string[] = [];
  let cursor = addDays(from, (dow - dayOfWeek(from) + 7) % 7);
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** "13 Sep" */
export function formatShortDate(iso: string): string {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "13 Sep 2026" */
export function formatMediumDate(iso: string): string {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Sunday 13 September 2026" */
export function formatLongDate(iso: string): string {
  const d = toDate(iso);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
