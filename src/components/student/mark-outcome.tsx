"use client";

import { Clock, UserSearch, UsersRound, WifiOff } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { formatDayDate, formatSettingTime, formatTime } from "@/lib/attendance/format";

import type { MarkOutcome } from "./use-mark-attendance";

const AUTO_RETURN_MS = 4000;

/**
 * Full-screen result of a mark attempt. Nothing here is styled as an error:
 * the most common person seeing a rejection is a parent with several children.
 */
export function MarkOutcomeScreen({
  outcome,
  timeZone,
  onDone,
  onRetry,
  onBack,
}: {
  outcome: Exclude<MarkOutcome, { kind: "idle" }>;
  timeZone: string;
  /** Finished: go back to the start. */
  onDone: () => void;
  /** Try the same mark again. */
  onRetry: () => void;
  /** Return to where the student was (e.g. search). */
  onBack: () => void;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const confirmed = outcome.kind === "marked";
  useEffect(() => {
    if (!confirmed) return;
    const t = window.setTimeout(() => onDoneRef.current(), AUTO_RETURN_MS);
    return () => window.clearTimeout(t);
  }, [confirmed]);

  if (outcome.kind === "saving" || outcome.kind === "marked") {
    const saving = outcome.kind === "saving";
    return (
      <Screen tone="success" onClose={saving ? undefined : onDone}>
        <SuccessCheck />
        <p className="mt-8 text-3xl font-bold leading-tight">{outcome.target.fullName}</p>
        <p className="mt-2 text-lg text-muted-foreground" aria-live="polite">
          {saving ? "Saving…" : `Marked present at ${formatTime(outcome.markedAt, timeZone)}`}
        </p>
        <p className="mt-6 text-2xl font-bold text-success">
          {saving ? " " : outcome.already ? "You're in class today! 🙌" : "You're all set 🎉"}
        </p>
        {!saving && (
          <button type="button" onClick={onDone} className="mt-10 h-14 w-full max-w-xs rounded-2xl border-2 bg-card text-lg font-bold">
            Done
          </button>
        )}
      </Screen>
    );
  }

  if (outcome.kind === "device_limit") {
    return (
      <Screen>
        <Icon>
          <UsersRound className="size-10" />
        </Icon>
        <h2 className="mt-6 text-2xl font-bold leading-snug text-balance">
          This phone has already marked {outcome.limit} {outcome.limit === 1 ? "person" : "people"} today.
        </h2>
        <p className="mt-3 text-xl text-balance">Please ask your teacher to mark you in.</p>
        <dl className="mt-8 w-full max-w-sm rounded-2xl border-2 bg-card p-5 text-left text-lg">
          <div>
            <dt className="text-base text-muted-foreground">Name</dt>
            <dd className="text-2xl font-bold">{outcome.target.fullName}</dd>
          </div>
          <div className="mt-3">
            <dt className="text-base text-muted-foreground">Class</dt>
            <dd className="text-xl font-bold">{outcome.target.className}</dd>
          </div>
        </dl>
        <PrimaryButton onClick={onDone}>Back to start</PrimaryButton>
      </Screen>
    );
  }

  if (outcome.kind === "closed") {
    const w = outcome.window;
    return (
      <Screen>
        <Icon>
          <Clock className="size-10" />
        </Icon>
        <h2 className="mt-6 text-2xl font-bold">Attendance is closed right now</h2>
        {w && (
          <p className="mt-3 text-lg text-muted-foreground">
            It opens {formatDayDate(w.opens_at, w.timezone)} at {formatSettingTime(w.window_start)}.
          </p>
        )}
        <p className="mt-3 text-lg text-muted-foreground">If you were in class today, your teacher can help.</p>
        <PrimaryButton onClick={onDone}>Back to start</PrimaryButton>
      </Screen>
    );
  }

  if (outcome.kind === "offline") {
    return (
      <Screen>
        <Icon>
          <WifiOff className="size-10" />
        </Icon>
        <h2 className="mt-6 text-2xl font-bold">No connection. Please try again.</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          {outcome.target.fullName} has <strong>not</strong> been marked yet. Check your data or WiFi, then tap Try again.
        </p>
        <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
        <SecondaryButton onClick={onBack}>Go back</SecondaryButton>
      </Screen>
    );
  }

  if (outcome.kind === "not_found") {
    return (
      <Screen>
        <Icon>
          <UserSearch className="size-10" />
        </Icon>
        <h2 className="mt-6 text-2xl font-bold">We couldn&apos;t find that name</h2>
        <p className="mt-3 text-lg text-muted-foreground">It may have been changed by a teacher. Please search again.</p>
        <PrimaryButton onClick={onDone}>Back to start</PrimaryButton>
      </Screen>
    );
  }

  // busy | error
  return (
    <Screen>
      <Icon>
        <Clock className="size-10" />
      </Icon>
      <h2 className="mt-6 text-2xl font-bold">
        {outcome.kind === "busy" ? "Lots of people are marking right now" : "That didn't go through"}
      </h2>
      <p className="mt-3 text-lg text-muted-foreground">
        {outcome.target.fullName} has <strong>not</strong> been marked yet. Please wait a moment and try again.
      </p>
      <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
      <SecondaryButton onClick={onBack}>Go back</SecondaryButton>
    </Screen>
  );
}

function Screen({ children, tone, onClose }: { children: ReactNode; tone?: "success"; onClose?: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={`animate-fade-in safe-px safe-pb safe-pt fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto text-center ${
        tone === "success" ? "bg-success-soft" : "bg-background"
      }`}
    >
      <div className="flex w-full max-w-md flex-col items-center py-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function SuccessCheck() {
  return (
    <div className="animate-pop-in flex size-32 items-center justify-center rounded-full bg-success shadow-lg">
      <svg viewBox="0 0 52 52" className="size-20" aria-hidden>
        <path
          d="M14 27 l8 8 l17 -18"
          fill="none"
          stroke="white"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw-check"
        />
      </svg>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus
      className="mt-10 h-14 w-full max-w-xs rounded-2xl bg-primary text-xl font-bold text-primary-foreground active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 h-14 w-full max-w-xs rounded-2xl text-lg font-bold text-muted-foreground">
      {children}
    </button>
  );
}
