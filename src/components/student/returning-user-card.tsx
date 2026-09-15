"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  clearLastStudent,
  parseLastStudent,
  readLastStudentRaw,
  subscribeLastStudent,
} from "@/lib/attendance/client";
import { formatTime } from "@/lib/attendance/format";

import { MarkOutcomeScreen } from "./mark-outcome";
import { useMarkAttendance } from "./use-mark-attendance";

/**
 * "Welcome back, Chidi Okafor. Mark me present" in one tap, for phones that
 * have marked someone before. If this phone already marked them today, it
 * celebrates instead. Only shown while the window is open and the remembered
 * class still exists.
 */
export function ReturningUserCard({
  activeClassIds,
  timeZone,
  serviceDate,
}: {
  activeClassIds: string[];
  timeZone: string;
  /** Today's service date ("YYYY-MM-DD") from the server. */
  serviceDate: string;
}) {
  const router = useRouter();
  const raw = useSyncExternalStore(subscribeLastStudent, readLastStudentRaw, () => null);
  const last = useMemo(() => parseLastStudent(raw), [raw]);
  const { outcome, mark, reset } = useMarkAttendance();

  const finish = useCallback(() => {
    reset();
    router.refresh();
  }, [reset, router]);

  if (outcome.kind !== "idle") {
    return (
      <MarkOutcomeScreen
        outcome={outcome}
        timeZone={timeZone}
        onDone={finish}
        onRetry={() => void mark(outcome.target)}
        onBack={reset}
      />
    );
  }

  if (!last || !activeClassIds.includes(last.classId)) return null;

  const inClassToday = last.markedOn === serviceDate;
  const firstName = last.fullName.split(" ")[0];

  if (inClassToday) {
    return (
      <section
        aria-label="Welcome back"
        className="animate-fade-in rounded-3xl border-2 border-success/30 bg-success-soft p-5 text-center shadow-sm"
      >
        <p className="text-5xl leading-none" aria-hidden>
          🙌
        </p>
        <p className="mt-3 text-2xl leading-tight font-extrabold">You&apos;re in class today!</p>
        <p className="mt-1 text-lg">
          Welcome, <strong>{firstName}</strong>. God bless you.
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          {last.fullName}
          {last.className && ` · ${last.className}`}
          {last.markedAt && ` · marked at ${formatTime(last.markedAt, timeZone)}`}
        </p>
        <div className="mt-2">
          <button
            type="button"
            onClick={clearLastStudent}
            className="min-h-12 px-4 text-base font-bold text-muted-foreground underline underline-offset-4"
          >
            Marking someone else?
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Welcome back" className="rounded-3xl border-2 border-primary/25 bg-card p-5 shadow-sm">
      <p className="text-lg text-muted-foreground">Welcome back,</p>
      <p className="text-2xl font-bold leading-tight">{last.fullName}</p>
      {last.className && <p className="text-base text-muted-foreground">{last.className}</p>}
      <button
        type="button"
        onClick={() => void mark(last)}
        className="mt-4 h-14 w-full rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm active:scale-[0.98]"
      >
        Mark me present
      </button>
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={clearLastStudent}
          className="min-h-12 px-4 text-base font-bold text-muted-foreground underline underline-offset-4"
        >
          Not you?
        </button>
      </div>
    </section>
  );
}
