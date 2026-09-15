"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { setAttendance } from "@/app/sundayschool/_actions/attendance";
import { formatTime } from "@/lib/attendance/format";
import type { AttendanceSource } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Row = {
  studentId: string;
  fullName: string;
  isActive: boolean;
  mark: { markedAt: string; source: AttendanceSource } | null;
};

const SOURCE: Record<AttendanceSource, string> = { self: "self", teacher: "teacher", admin: "admin" };

export function CorrectionsRoster({
  rows,
  classId,
  date,
  timeZone,
}: {
  rows: Row[];
  classId: string;
  date: string;
  timeZone: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, apply] = useOptimistic(rows, (current, change: { studentId: string; present: boolean }) =>
    current.map((r) =>
      r.studentId === change.studentId
        ? { ...r, mark: change.present ? { markedAt: new Date().toISOString(), source: "admin" as const } : null }
        : r,
    ),
  );

  const toggle = (row: Row, present: boolean) => {
    setNotice(null);
    startTransition(async () => {
      apply({ studentId: row.studentId, present });
      const result = await setAttendance({ studentId: row.studentId, classId, date, present });
      if (result.status === "error") setNotice(`${row.fullName}: ${result.message}`);
    });
  };

  const present = optimistic.filter((r) => r.mark).length;

  if (rows.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No students in this class.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">
        <strong>{present}</strong> of {optimistic.filter((r) => r.isActive).length} present
      </p>
      <p aria-live="polite" className={cn("rounded-xl bg-accent p-3 font-bold", !notice && "sr-only")}>
        {notice}
      </p>
      <ul className="grid gap-2 lg:grid-cols-2">
        {optimistic.map((r) => (
          <li
            key={r.studentId}
            className={cn(
              "flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 bg-card px-4 py-2",
              r.mark && "border-success/40 bg-success-soft/60",
            )}
          >
            <div className="min-w-0">
              <p className="font-bold break-words">
                {r.fullName}
                {!r.isActive && <span className="font-normal text-muted-foreground"> (deactivated)</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {r.mark ? `Present · ${formatTime(r.mark.markedAt, timeZone)} · ${SOURCE[r.mark.source]}` : "Absent"}
              </p>
            </div>
            <div role="group" aria-label={`Attendance for ${r.fullName}`} className="flex shrink-0 rounded-xl border-2 p-0.5">
              <button
                type="button"
                aria-pressed={Boolean(r.mark)}
                onClick={() => !r.mark && toggle(r, true)}
                className={cn(
                  "flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-bold",
                  r.mark ? "bg-success text-success-foreground" : "text-muted-foreground",
                )}
              >
                {r.mark && <Check className="size-4" strokeWidth={3} aria-hidden />}
                Present
              </button>
              <button
                type="button"
                aria-pressed={!r.mark}
                onClick={() => r.mark && toggle(r, false)}
                className={cn(
                  "h-11 rounded-lg px-3 text-sm font-bold",
                  !r.mark ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                Absent
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
