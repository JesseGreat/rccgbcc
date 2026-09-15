import { describe, expect, it } from "vitest";

import { buildAttendanceMatrix } from "@/lib/reports/matrix";

const base = {
  from: "2026-08-25",
  to: "2026-09-20",
  today: "2026-09-14",
  serviceDow: 0,
};

describe("buildAttendanceMatrix", () => {
  const matrix = buildAttendanceMatrix({
    ...base,
    students: [
      { id: "a", fullName: "Amaka Eze", isActive: true, createdDate: "2026-01-01" },
      { id: "b", fullName: "bola Ade", isActive: true, createdDate: "2026-09-06" },
      { id: "c", fullName: "Chidi Obi", isActive: false, createdDate: "2026-01-01" },
      { id: "d", fullName: "Dayo Musa", isActive: false, createdDate: "2026-01-01" },
    ],
    marks: [
      { studentId: "a", serviceDate: "2026-08-30" },
      { studentId: "a", serviceDate: "2026-09-13" },
      { studentId: "b", serviceDate: "2026-09-06" },
      { studentId: "d", serviceDate: "2026-09-02" },
      { studentId: "a", serviceDate: "2026-06-01" }, // outside the range
    ],
  });
  const row = (name: string) => matrix.rows.find((r) => r.fullName === name);

  it("uses every service day up to today, plus off-day correction dates", () => {
    expect(matrix.dates).toEqual(["2026-08-30", "2026-09-02", "2026-09-06", "2026-09-13"]);
  });

  it("marks present and absent, and computes percentages", () => {
    expect(row("Amaka Eze")?.cells).toEqual(["present", "absent", "absent", "present"]);
    expect(row("Amaka Eze")?.presentCount).toBe(2);
    expect(row("Amaka Eze")?.percentage).toBe(50);
  });

  it("does not count Sundays before a student joined", () => {
    expect(row("bola Ade")?.cells).toEqual(["not_yet", "not_yet", "present", "absent"]);
    expect(row("bola Ade")?.possibleCount).toBe(2);
  });

  it("hides inactive students unless they attended in the range", () => {
    expect(row("Chidi Obi")).toBeUndefined();
    expect(row("Dayo Musa")?.presentCount).toBe(1);
  });

  it("totals each column and sorts names case-insensitively", () => {
    expect(matrix.totals).toEqual([1, 1, 1, 1]);
    expect(matrix.rows.map((r) => r.fullName)).toEqual(["Amaka Eze", "bola Ade", "Dayo Musa"]);
  });

  it("returns a null percentage when nothing was possible", () => {
    const empty = buildAttendanceMatrix({
      ...base,
      from: "2026-09-14",
      to: "2026-09-14",
      students: [{ id: "x", fullName: "New Person", isActive: true, createdDate: "2026-09-14" }],
      marks: [],
    });
    expect(empty.dates).toEqual([]);
    expect(empty.rows[0].percentage).toBeNull();
  });
});
