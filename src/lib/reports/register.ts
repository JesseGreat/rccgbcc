// Column layout for the Sunday School Class Attendance Register: months across
// the top, and under each month one column per service day labelled Wk1-Wk5.

import { dayOfWeek } from "@/lib/attendance/dates";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RegisterColumn = {
  date: string;
  /** "Wk2" for a service day; "Wed 8" for a one-off corrected date. */
  label: string;
  /** Day of the month, shown under the week label. */
  day: number;
};

export type RegisterMonth = {
  /** "2026-10" */
  key: string;
  /** "October 2026" */
  label: string;
  columns: RegisterColumn[];
};

/**
 * Groups the matrix dates (ascending) into months. A service day's week number
 * is its position among that weekday's dates in the month, so a month shows
 * only the Sundays it actually has (Wk1-Wk4, or Wk1-Wk5).
 */
export function registerMonths(dates: string[], serviceDow: number): RegisterMonth[] {
  const months: RegisterMonth[] = [];
  for (const date of dates) {
    const [year, month, dayStr] = date.split("-");
    const key = `${year}-${month}`;
    const day = Number(dayStr);
    let group = months.at(-1);
    if (!group || group.key !== key) {
      group = { key, label: `${MONTHS_LONG[Number(month) - 1]} ${year}`, columns: [] };
      months.push(group);
    }
    const dow = dayOfWeek(date);
    const label = dow === serviceDow ? `Wk${Math.ceil(day / 7)}` : `${DAY_SHORT[dow]} ${day}`;
    group.columns.push({ date, label, day });
  }
  return months;
}
