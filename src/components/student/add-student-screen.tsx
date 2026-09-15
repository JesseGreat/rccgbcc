"use client";

import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";

import { apiFetch, getDeviceId, saveLastStudent } from "@/lib/attendance/client";
import type { AddStudentResult, DuplicateMatch } from "@/lib/db/types";

import { MarkOutcomeScreen } from "./mark-outcome";
import { useMarkAttendance, type MarkOutcome, type MarkTarget } from "./use-mark-attendance";

type AddInput = { fullName: string; phone: string; force: boolean };
type FieldError = { field: "full_name" | "phone" | "form"; message: string };

type State =
  | { kind: "form"; error?: FieldError }
  | { kind: "submitting"; input: AddInput }
  | { kind: "duplicate"; input: AddInput; matches: DuplicateMatch[]; exact: boolean }
  | { kind: "outcome"; input: AddInput; outcome: Exclude<MarkOutcome, { kind: "idle" }> };

const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,22}[0-9]$/;
const NAME_MESSAGE = "Please enter your full name (first and last name).";
const PHONE_MESSAGE = "Check the phone number. Use digits only, like 0803 123 4567.";

function validate(fullName: string, phone: string): FieldError | null {
  const letters = fullName.replace(/[^\p{L}\p{N}]/gu, "");
  if (letters.length < 2 || fullName.trim().length > 100) return { field: "full_name", message: NAME_MESSAGE };
  if (phone.trim() && !PHONE_RE.test(phone.trim())) return { field: "phone", message: PHONE_MESSAGE };
  return null;
}

export function AddStudentScreen({
  classId,
  className,
  timeZone,
  initialName,
}: {
  classId: string;
  className: string;
  timeZone: string;
  initialName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ kind: "form" });
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const markMatch = useMarkAttendance();

  const goHome = useCallback(() => router.push("/"), [router]);
  const backToForm = useCallback(() => setState({ kind: "form" }), []);

  const submit = useCallback(
    async (input: AddInput) => {
      setState({ kind: "submitting", input });
      const target: MarkTarget = { studentId: "", fullName: input.fullName.trim(), classId, className };

      const res = await apiFetch<AddStudentResult>("/api/students", {
        method: "POST",
        body: JSON.stringify({
          classId,
          fullName: input.fullName,
          phone: input.phone.trim() || null,
          deviceId: getDeviceId(),
          force: input.force,
        }),
      });

      if (res.ok) {
        const d = res.data;
        if (d.status === "possible_duplicate") {
          setState({ kind: "duplicate", input, matches: d.matches, exact: d.exact_match });
        } else if (d.status === "device_limit_reached") {
          setState({ kind: "outcome", input, outcome: { kind: "device_limit", target, limit: d.limit } });
        } else {
          const created: MarkTarget = {
            studentId: d.student_id,
            fullName: d.full_name,
            classId: d.class_id,
            className: d.class_name,
          };
          saveLastStudent({ ...created, markedOn: d.service_date, markedAt: d.marked_at });
          setState({
            kind: "outcome",
            input,
            outcome: { kind: "marked", target: created, markedAt: d.marked_at, already: false },
          });
        }
        return;
      }

      const e = res.error;
      switch (e.code) {
        case "INVALID_INPUT":
          setState({
            kind: "form",
            error:
              e.detail === "phone"
                ? { field: "phone", message: PHONE_MESSAGE }
                : { field: "full_name", message: NAME_MESSAGE },
          });
          break;
        case "NAME_UNAVAILABLE":
          setState({
            kind: "form",
            error: {
              field: "full_name",
              message: "That name belongs to an old record in this class. Please ask your teacher to mark you in.",
            },
          });
          break;
        case "WINDOW_CLOSED":
          setState({ kind: "outcome", input, outcome: { kind: "closed", target, window: e.window } });
          break;
        case "CLASS_NOT_FOUND":
          setState({ kind: "outcome", input, outcome: { kind: "not_found", target } });
          break;
        case "OFFLINE":
          setState({ kind: "outcome", input, outcome: { kind: "offline", target } });
          break;
        case "RATE_LIMITED":
          setState({ kind: "outcome", input, outcome: { kind: "busy", target } });
          break;
        default:
          setState({ kind: "outcome", input, outcome: { kind: "error", target } });
      }
    },
    [classId, className],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const error = validate(fullName, phone);
    if (error) {
      setState({ kind: "form", error });
      (error.field === "phone" ? phoneRef : nameRef).current?.focus();
      return;
    }
    void submit({ fullName, phone, force: false });
  };

  // A match was tapped: mark that existing student instead of creating anyone.
  if (markMatch.outcome.kind !== "idle") {
    const outcome = markMatch.outcome;
    return (
      <MarkOutcomeScreen
        outcome={outcome}
        timeZone={timeZone}
        onDone={goHome}
        onRetry={() => void markMatch.mark(outcome.target)}
        onBack={markMatch.reset}
      />
    );
  }

  if (state.kind === "outcome") {
    return (
      <MarkOutcomeScreen
        outcome={state.outcome}
        timeZone={timeZone}
        onDone={goHome}
        onRetry={() => void submit(state.input)}
        onBack={backToForm}
      />
    );
  }

  if (state.kind === "duplicate") {
    const single = state.matches.length === 1;
    const registeredName = state.matches[0]?.full_name ?? state.input.fullName.trim();
    return (
      <>
        <Header title="Is this you?" subtitle={className} onBack={backToForm} />
        <main className="safe-px safe-pb mx-auto w-full max-w-lg flex-1 pt-5 pb-10">
          <p className="text-lg">
            {state.exact
              ? `This name is already in ${className}.`
              : `We found ${single ? "a similar name" : "similar names"} in ${className}.`}{" "}
            {single ? "If it's you, tap it" : "If one is you, tap it"} to mark yourself present.
          </p>
          <ul className="mt-5 flex flex-col gap-2">
            {state.matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => void markMatch.mark({ studentId: m.id, fullName: m.full_name, classId, className })}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left shadow-sm active:border-primary active:bg-accent"
                >
                  <span>
                    <span className="block text-xl font-bold leading-tight">{m.full_name}</span>
                    <span className="mt-0.5 block text-base text-primary">Yes, this is me</span>
                  </span>
                  {m.already_marked_today && (
                    <span className="flex shrink-0 items-center gap-1.5 text-base font-bold text-success">
                      <span className="flex size-7 items-center justify-center rounded-full bg-success text-success-foreground">
                        <Check className="size-4.5" strokeWidth={3} aria-hidden />
                      </span>
                      In class
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {state.exact ? (
            <div className="mt-8 rounded-2xl bg-muted p-5">
              <p className="text-lg">
                <strong>&ldquo;{registeredName}&rdquo;</strong> is already registered in {className}. If that isn&apos;t you,
                add your middle name so we can tell you apart.
              </p>
              <button
                type="button"
                onClick={() => {
                  backToForm();
                  requestAnimationFrame(() => nameRef.current?.focus());
                }}
                className="mt-4 h-14 w-full rounded-2xl border-2 border-primary bg-card text-lg font-bold text-primary"
              >
                Change my name
              </button>
            </div>
          ) : (
            <div className="mt-8 border-t pt-6">
              <p className="mb-3 text-center text-lg text-muted-foreground">None of these?</p>
              <button
                type="button"
                onClick={() => void submit({ ...state.input, force: true })}
                className="h-14 w-full rounded-2xl border-2 border-primary bg-card px-4 text-lg font-bold text-primary active:bg-accent"
              >
                No, add me as new
              </button>
            </div>
          )}
        </main>
      </>
    );
  }

  const submitting = state.kind === "submitting";
  const error = state.kind === "form" ? state.error : undefined;

  return (
    <>
      <Header title="Add your name" subtitle={className} backHref={`/class/${classId}`} />
      <main className="safe-px safe-pb mx-auto w-full max-w-lg flex-1 pt-5 pb-10">
        <p className="text-lg text-muted-foreground">You&apos;ll be marked present straight away.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-6">
          <Field
            id="full-name"
            label="Full name"
            hint="First and last name, as your teacher knows you."
            error={error?.field === "full_name" ? error.message : undefined}
          >
            <input
              ref={nameRef}
              id="full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-invalid={error?.field === "full_name" || undefined}
              aria-describedby="full-name-hint full-name-error"
              className={inputClass}
              style={{ fontSize: "18px" }}
            />
          </Field>

          <Field
            id="phone"
            label={
              <>
                Phone number <span className="font-normal text-muted-foreground">(optional)</span>
              </>
            }
            error={error?.field === "phone" ? error.message : undefined}
          >
            <input
              ref={phoneRef}
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              maxLength={30}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={error?.field === "phone" || undefined}
              aria-describedby="phone-error"
              placeholder="0803 123 4567"
              className={inputClass}
              style={{ fontSize: "18px" }}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="h-14 w-full rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm active:scale-[0.98] disabled:opacity-70"
          >
            {submitting ? "Adding…" : "Add me and mark present"}
          </button>
        </form>
      </main>
    </>
  );
}

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-input bg-card px-4 text-lg text-foreground shadow-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none aria-invalid:border-primary";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-lg font-bold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mb-2 text-base text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 flex items-start gap-2 text-base font-bold text-primary">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function Header({
  title,
  subtitle,
  backHref,
  onBack,
}: {
  title: string;
  subtitle: string;
  backHref?: string;
  onBack?: () => void;
}) {
  const icon = <ArrowLeft className="size-7" aria-hidden />;
  const backClass = "-ml-2 flex size-12 shrink-0 items-center justify-center rounded-full active:bg-muted";
  return (
    <header className="safe-pt safe-px sticky top-0 z-30 border-b bg-background/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex max-w-lg items-center gap-2">
        {backHref ? (
          <Link href={backHref} aria-label="Back to search" className={backClass}>
            {icon}
          </Link>
        ) : (
          <button type="button" onClick={onBack} aria-label="Back" className={backClass}>
            {icon}
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-tight font-bold">{title}</h1>
          <p className="truncate text-base text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}
