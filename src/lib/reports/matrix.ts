// Pure attendance-matrix computation, shared by the History tab and exports.

import { datesOnWeekday } from "@/lib/attendance/dates";

export type MatrixStudent = {
  id: string;
  fullName: string;
  isActive: boolean;
  /** Lagos calendar date the record was created. */
  createdDate: string;
  className?: string;
};

export type MatrixMark = { studentId: string; serviceDate: string };

export type MatrixCell = "present" | "absent" | "not_yet";

export type MatrixRow = {
  studentId: string;
  fullName: string;
  className?: string;
  isActive: boolean;
  cells: MatrixCell[];
  presentCount: number;
  /** Sundays in range on or after the student joined. */
  possibleCount: number;
  /** 0–100, or null when there were no possible Sundays. */
  percentage: number | null;
};

export type AttendanceMatrix = {
  from: string;
  to: string;
  dates: string[];
  rows: MatrixRow[];
  /** Present count per date column. */
  totals: number[];
};

/**
 * Columns are every service day in the range (up to today) plus any other
 * date that has marks, so a one-off corrected date still shows up.
 * A student only "could have attended" from the earlier of their creation
 * date and their first mark; before that their cells are `not_yet`.
 * Inactive students are included only if they have marks in the range.
 */
export function buildAttendanceMatrix(input: {
  students: MatrixStudent[];
  marks: MatrixMark[];
  from: string;
  to: string;
  today: string;
  serviceDow: number;
}): AttendanceMatrix {
  const { students, marks, from, to, today, serviceDow } = input;
  const lastDate = to < today ? to : today;

  const marksByStudent = new Map<string, Set<string>>();
  const firstMark = new Map<string, string>();
  const dateSet = new Set(from <= lastDate ? datesOnWeekday(from, lastDate, serviceDow) : []);

  for (const m of marks) {
    let set = marksByStudent.get(m.studentId);
    if (!set) marksByStudent.set(m.studentId, (set = new Set()));
    set.add(m.serviceDate);
    const first = firstMark.get(m.studentId);
    if (!first || m.serviceDate < first) firstMark.set(m.studentId, m.serviceDate);
    if (m.serviceDate >= from && m.serviceDate <= to) dateSet.add(m.serviceDate);
  }

  const dates = [...dateSet].sort();
  const totals = dates.map(() => 0);

  const rows: MatrixRow[] = [];
  for (const s of students) {
    const studentMarks = marksByStudent.get(s.id);
    const hasMarksInRange = dates.some((d) => studentMarks?.has(d));
    if (!s.isActive && !hasMarksInRange) continue;

    const first = firstMark.get(s.id);
    const joined = first && first < s.createdDate ? first : s.createdDate;

    let presentCount = 0;
    let possibleCount = 0;
    const cells = dates.map((d, i): MatrixCell => {
      if (studentMarks?.has(d)) {
        presentCount++;
        possibleCount++;
        totals[i]++;
        return "present";
      }
      if (d < joined) return "not_yet";
      possibleCount++;
      return "absent";
    });

    rows.push({
      studentId: s.id,
      fullName: s.fullName,
      className: s.className,
      isActive: s.isActive,
      cells,
      presentCount,
      possibleCount,
      percentage: possibleCount > 0 ? Math.round((presentCount / possibleCount) * 100) : null,
    });
  }

  rows.sort(
    (a, b) =>
      (a.className ?? "").localeCompare(b.className ?? "") ||
      a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base" }),
  );

  return { from, to, dates, rows, totals };
}
