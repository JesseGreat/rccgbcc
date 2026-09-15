import { describe, expect, it } from "vitest";

import { addDays, datesOnWeekday, daysBetween, formatLongDate, formatShortDate, isIsoDate } from "@/lib/attendance/dates";
import {
  formatCountdown,
  formatDayDate,
  formatSettingTime,
  formatTime,
  localDate,
  startOfLocalDay,
  windowPhase,
} from "@/lib/attendance/format";
import type { WindowState } from "@/lib/db/types";

describe("calendar dates", () => {
  it("validates real dates only", () => {
    expect(isIsoDate("2026-09-13")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("13/09/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("does date arithmetic across month and year boundaries", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("lists every Sunday in a range", () => {
    expect(datesOnWeekday("2026-08-25", "2026-09-14", 0)).toEqual(["2026-08-30", "2026-09-06", "2026-09-13"]);
    expect(datesOnWeekday("2026-09-13", "2026-09-13", 0)).toEqual(["2026-09-13"]);
    expect(datesOnWeekday("2026-09-14", "2026-09-19", 0)).toEqual([]);
  });

  it("formats dates without locale surprises", () => {
    expect(formatShortDate("2026-09-13")).toBe("13 Sep");
    expect(formatLongDate("2026-09-13")).toBe("Sunday 13 September 2026");
  });
});

describe("times and countdowns", () => {
  it("formats countdowns", () => {
    expect(formatCountdown(862)).toBe("14:22");
    expect(formatCountdown(59)).toBe("0:59");
    expect(formatCountdown(3 * 3600 + 5)).toBe("3:00:05");
    expect(formatCountdown(-4)).toBe("0:00");
  });

  it("shows clock times in the church's timezone, not the device's", () => {
    expect(formatTime("2026-09-13T07:05:00Z", "Africa/Lagos")).toBe("8:05 AM");
    expect(formatTime("2026-09-13T11:30:00Z", "Africa/Lagos")).toBe("12:30 PM");
    expect(formatSettingTime("08:40")).toBe("8:40 AM");
    expect(formatDayDate("2026-09-19T23:30:00Z", "Africa/Lagos")).toBe("Sunday 20 September");
    expect(localDate("2026-09-19T23:30:00Z", "Africa/Lagos")).toBe("2026-09-20");
  });

  it("finds local midnight for any timezone", () => {
    expect(startOfLocalDay("2026-09-13", "Africa/Lagos")).toBe("2026-09-13T00:00:00+01:00");
    expect(startOfLocalDay("2026-01-01", "Asia/Kolkata")).toBe("2026-01-01T00:00:00+05:30");
    expect(startOfLocalDay("2026-01-01", "UTC")).toBe("2026-01-01T00:00:00+00:00");
  });
});

describe("windowPhase", () => {
  const base: WindowState = {
    is_open: false,
    now: "2026-09-13T06:45:00Z",
    service_date: "2026-09-13",
    timezone: "Africa/Lagos",
    service_dow: 0,
    window_start: "08:00",
    window_end: "08:40",
    opens_at: "2026-09-13T07:00:00Z",
    closes_at: "2026-09-13T07:40:00Z",
    seconds_until_open: 900,
    seconds_until_close: null,
  };

  it("is open when the server says so", () => {
    expect(windowPhase({ ...base, is_open: true })).toBe("open");
  });
  it("counts down on the service day before opening", () => {
    expect(windowPhase(base)).toBe("opens-today");
  });
  it("is closed when the next window is another day", () => {
    expect(windowPhase({ ...base, opens_at: "2026-09-20T07:00:00Z" })).toBe("closed");
  });
});
