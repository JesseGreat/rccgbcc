import { describe, expect, it } from "vitest";

import { registerMonths } from "@/lib/reports/register";

describe("registerMonths", () => {
  it("groups Sundays by month and numbers them Wk1-Wk5", () => {
    const months = registerMonths(
      ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-11-01"],
      0,
    );
    expect(months.map((m) => m.label)).toEqual(["August 2026", "September 2026", "November 2026"]);
    expect(months[0].columns).toEqual([{ date: "2026-08-30", label: "Wk5", day: 30 }]);
    expect(months[1].columns.map((c) => c.label)).toEqual(["Wk1", "Wk2", "Wk3", "Wk4"]);
    expect(months[2].columns[0]).toMatchObject({ label: "Wk1", day: 1 });
  });

  it("labels a one-off corrected weekday by its day name", () => {
    const months = registerMonths(["2026-09-06", "2026-09-09", "2026-09-13"], 0);
    expect(months[0].columns.map((c) => c.label)).toEqual(["Wk1", "Wed 9", "Wk2"]);
  });

  it("returns nothing for no dates", () => {
    expect(registerMonths([], 0)).toEqual([]);
  });
});
