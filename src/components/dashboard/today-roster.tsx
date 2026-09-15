"use client";

import { Check, Search, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";

import { markPresent, undoMark } from "@/app/dashboard/actions";
import { StatusPill } from "@/components/student/status-pill";
import { useCountdown } from "@/components/student/use-countdown";
import { formatLongDate } from "@/lib/attendance/dates";
import { DAY_NAMES, formatDayDate, formatSettingTime, formatTime } from "@/lib/attendance/format";
import type { AttendanceSource, WindowState } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type Student = { id: string; fullName: string };
type Mark = { studentId: string; markedAt: string; source: AttendanceSource };
type Filter = "all" | "absent" | "present";

const REFRESH_MS = 20_000;
const SOURCE_LABEL: Record<AttendanceSource, string> = {
  self: "self-marked",
  teacher: "marked by teacher",
  admin: "marked by admin",
};

export function TodayRoster({ window: state, students, marks }: { window: WindowState; students: Student[]; marks: Mark[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  // Buttons lock the instant the countdown ends, before the refresh even lands.
  const remaining = useCountdown(state.is_open ? state.seconds_until_close : null);
  const canEdit = state.is_open && remaining !== 0;

  const serverMarks = useMemo(() => new Map(marks.map((m) => [m.studentId, m])), [marks]);
  const [optimisticMarks, applyOptimistic] = useOptimistic(
    serverMarks,
    (current, change: { studentId: string; present: boolean }) => {
      const next = new Map(current);
      if (change.present) {
        next.set(change.studentId, { studentId: change.studentId, markedAt: new Date().toISOString(), source: "teacher" });
      } else {
        next.delete(change.studentId);
      }
      return next;
    },
  );

  // Live roster: poll while the window is open and the tab is visible.
  useEffect(() => {
    if (!state.is_open) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [state.is_open, router]);

  const toggle = (student: Student, present: boolean) => {
    setNotice(null);
    setPendingIds((s) => new Set(s).add(student.id));
    startTransition(async () => {
      applyOptimistic({ studentId: student.id, present });
      const result = present ? await markPresent(student.id) : await undoMark(student.id);
      if (!result.ok) setNotice(`${student.fullName}: ${result.message}`);
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(student.id);
        return next;
      });
    });
  };

  const presentCount = students.filter((s) => optimisticMarks.has(s.id)).length;
  const percentage = students.length ? Math.round((presentCount / students.length) * 100) : 0;

  const needle = query.trim().toLowerCase();
  const visible = students.filter((s) => {
    const present = optimisticMarks.has(s.id);
    if (filter === "present" && !present) return false;
    if (filter === "absent" && present) return false;
    return !needle || s.fullName.toLowerCase().includes(needle);
  });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base text-muted-foreground">{formatLongDate(state.service_date)}</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">
            {presentCount}
            <span className="text-2xl text-muted-foreground"> / {students.length} present</span>
          </p>
          <p className="text-lg font-bold text-muted-foreground tabular-nums">{percentage}%</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusPill key={state.now} window={state} />
          {!state.is_open && (
            <p className="text-base text-muted-foreground">
              Marking opens {formatDayDate(state.opens_at, state.timezone)}, {formatSettingTime(state.window_start)} to{" "}
              {formatSettingTime(state.window_end)}.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Show" className="flex gap-1 rounded-2xl bg-muted p-1">
          {(
            [
              ["all", `All ${students.length}`],
              ["absent", `Absent ${students.length - presentCount}`],
              ["present", `Present ${presentCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "h-11 flex-1 rounded-xl px-3 text-base font-bold whitespace-nowrap tabular-nums",
                filter === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">Filter by name</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name"
            className="h-12 w-full rounded-xl border-2 border-input bg-card pr-3 pl-11 text-base focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      <p aria-live="polite" className={cn("rounded-xl bg-accent p-3 text-base font-bold text-accent-foreground", !notice && "sr-only")}>
        {notice}
      </p>

      {students.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">
          No students in this class yet. Students appear here when they add themselves on {DAY_NAMES[state.service_dow]}.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">Nobody matches.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {visible.map((s) => {
            const mark = optimisticMarks.get(s.id);
            const pending = pendingIds.has(s.id);
            return (
              <li
                key={s.id}
                className={cn(
                  "flex min-h-18 items-center justify-between gap-3 rounded-2xl border-2 bg-card px-4 py-2.5",
                  mark && "border-success/40 bg-success-soft/60",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      mark ? "bg-success text-success-foreground" : "border-2 border-dashed border-border",
                    )}
                  >
                    {mark && <Check className="size-5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg leading-tight font-bold break-words">{s.fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {mark ? `Present · ${formatTime(mark.markedAt, state.timezone)} · ${SOURCE_LABEL[mark.source]}` : "Absent"}
                    </p>
                  </div>
                </div>
                {mark ? (
                  <button
                    type="button"
                    disabled={!canEdit || pending}
                    onClick={() => toggle(s, false)}
                    className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl border-2 bg-card px-3 text-base font-bold text-muted-foreground active:bg-muted disabled:opacity-40"
                  >
                    <Undo2 className="size-4" aria-hidden />
                    Undo
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit || pending}
                    onClick={() => toggle(s, true)}
                    className="h-12 shrink-0 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-40"
                  >
                    Mark present
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
