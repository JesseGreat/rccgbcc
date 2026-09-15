"use client";

import { useCallback, useRef, useState } from "react";

import {
  apiFetch,
  clearLastStudent,
  getDeviceId,
  parseLastStudent,
  readLastStudentRaw,
  saveLastStudent,
} from "@/lib/attendance/client";
import type { MarkAttendanceResult, WindowState } from "@/lib/db/types";

export type MarkTarget = {
  studentId: string;
  fullName: string;
  classId: string;
  className: string;
};

export type MarkOutcome =
  | { kind: "idle" }
  /** Optimistic: success is shown immediately and confirmed (or rolled back) by the server. */
  | { kind: "saving"; target: MarkTarget }
  | { kind: "marked"; target: MarkTarget; markedAt: string; already: boolean }
  | { kind: "device_limit"; target: MarkTarget; limit: number }
  | { kind: "closed"; target: MarkTarget; window?: WindowState }
  | { kind: "offline"; target: MarkTarget }
  | { kind: "not_found"; target: MarkTarget }
  | { kind: "busy"; target: MarkTarget }
  | { kind: "error"; target: MarkTarget };

export function useMarkAttendance() {
  const [outcome, setOutcome] = useState<MarkOutcome>({ kind: "idle" });
  const inFlight = useRef(false);

  const mark = useCallback(async (target: MarkTarget) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOutcome({ kind: "saving", target });

    try {
      const res = await apiFetch<MarkAttendanceResult>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ studentId: target.studentId, deviceId: getDeviceId() }),
      });

      if (res.ok) {
        const d = res.data;
        if (d.status === "device_limit_reached") {
          setOutcome({ kind: "device_limit", target, limit: d.limit });
          return;
        }
        const confirmed: MarkTarget = {
          studentId: d.student_id,
          fullName: d.full_name,
          classId: d.class_id,
          className: d.class_name,
        };
        saveLastStudent({ ...confirmed, markedOn: d.service_date, markedAt: d.marked_at });
        setOutcome({ kind: "marked", target: confirmed, markedAt: d.marked_at, already: d.status === "already_marked" });
        return;
      }

      switch (res.error.code) {
        case "OFFLINE":
          setOutcome({ kind: "offline", target });
          break;
        case "WINDOW_CLOSED":
          setOutcome({ kind: "closed", target, window: res.error.window });
          break;
        case "STUDENT_NOT_FOUND":
        case "CLASS_NOT_FOUND":
          if (parseLastStudent(readLastStudentRaw())?.studentId === target.studentId) clearLastStudent();
          setOutcome({ kind: "not_found", target });
          break;
        case "RATE_LIMITED":
          setOutcome({ kind: "busy", target });
          break;
        default:
          setOutcome({ kind: "error", target });
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setOutcome({ kind: "idle" }), []);

  return { outcome, mark, reset };
}
