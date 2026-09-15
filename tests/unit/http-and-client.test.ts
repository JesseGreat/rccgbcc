import { describe, expect, it } from "vitest";

import { parseLastStudent } from "@/lib/attendance/client";
import { hashDeviceId, isUuid } from "@/lib/http/api";
import { getClientIp } from "@/lib/http/rate-limit";

describe("device id hashing", () => {
  it("rejects malformed ids and never returns the raw id", () => {
    expect(hashDeviceId("short")).toBeNull();
    expect(hashDeviceId("has spaces in it!!!!")).toBeNull();
    expect(hashDeviceId(42)).toBeNull();
    const hash = hashDeviceId("abcdefghijklmnopqrstuv");
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("abcdefghijklmnop");
    expect(hashDeviceId("abcdefghijklmnopqrstuv")).toBe(hash); // stable
  });
});

describe("request helpers", () => {
  it("validates uuids", () => {
    expect(isUuid("00000000-0000-0000-0000-0000000005a1")).toBe(true);
    expect(isUuid("nope")).toBe(false);
  });

  it("takes the first forwarded IP", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    expect(getClientIp(req)).toBe("203.0.113.7");
    expect(getClientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(getClientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("returning user storage", () => {
  it("parses a valid value and ignores junk", () => {
    const value = { classId: "c", className: "Teens", studentId: "s", fullName: "Chidi Okafor" };
    expect(parseLastStudent(JSON.stringify(value))).toEqual(value);
    expect(parseLastStudent("{not json")).toBeNull();
    expect(parseLastStudent(JSON.stringify({ fullName: "No ids" }))).toBeNull();
    expect(parseLastStudent(null)).toBeNull();
  });
});
