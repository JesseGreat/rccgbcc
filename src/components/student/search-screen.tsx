"use client";

import { ArrowLeft, Check, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, type ClientError } from "@/lib/attendance/client";
import type { StudentSearchResult, WindowState } from "@/lib/db/types";

import { ConfirmSheet } from "./confirm-sheet";
import { MarkOutcomeScreen } from "./mark-outcome";
import { useMarkAttendance, type MarkTarget } from "./use-mark-attendance";

const DEBOUNCE_MS = 250;

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string; results: StudentSearchResult[] | null }
  | { status: "done"; query: string; results: StudentSearchResult[] }
  | { status: "failed"; query: string; error: ClientError };

function searchable(query: string): boolean {
  return query.replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
}

export function SearchScreen({
  classId,
  className,
  timeZone,
}: {
  classId: string;
  className: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<MarkTarget | null>(null);
  const [closedWindow, setClosedWindow] = useState<WindowState | null>(null);
  const { outcome, mark, reset } = useMarkAttendance();

  const trimmed = query.trim();
  const canSearch = searchable(trimmed);

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearch((prev) => ({
        status: "loading",
        query: trimmed,
        results: prev.status === "done" || prev.status === "loading" ? prev.results : null,
      }));
      try {
        const res = await apiFetch<StudentSearchResult[]>(
          `/api/classes/${classId}/students?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (res.ok) {
          setSearch({ status: "done", query: trimmed, results: res.data });
        } else if (res.error.code === "WINDOW_CLOSED") {
          setClosedWindow(res.error.window ?? null);
        } else {
          setSearch({ status: "failed", query: trimmed, error: res.error });
        }
      } catch {
        // aborted by a newer keystroke
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, trimmed, classId]);

  const goHome = useCallback(() => router.push("/"), [router]);
  const cancelConfirm = useCallback(() => setSelected(null), []);

  if (closedWindow) {
    return (
      <MarkOutcomeScreen
        outcome={{ kind: "closed", window: closedWindow, target: { studentId: "", fullName: "", classId, className } }}
        timeZone={timeZone}
        onDone={goHome}
        onRetry={goHome}
        onBack={goHome}
      />
    );
  }

  const results = canSearch && search.status !== "idle" && search.status !== "failed" ? search.results : null;
  const addHref = `/class/${classId}/add${trimmed ? `?name=${encodeURIComponent(trimmed)}` : ""}`;

  return (
    <>
      <header className="safe-pt safe-px sticky top-0 z-30 border-b bg-background/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Link
            href="/"
            aria-label="Back to classes"
            className="-ml-2 flex size-12 shrink-0 items-center justify-center rounded-full active:bg-muted"
          >
            <ArrowLeft className="size-7" aria-hidden />
          </Link>
          <h1 className="truncate text-2xl font-bold">{className}</h1>
        </div>
      </header>

      <main className="safe-px mx-auto w-full max-w-lg flex-1 pt-5 pb-36">
        <label htmlFor="student-search" className="mb-2 block text-lg font-bold">
          Start typing your name
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id="student-search"
            type="text"
            inputMode="text"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Chidi Okafor"
            className="h-14 w-full rounded-2xl border-2 border-input bg-card pr-14 pl-4 text-lg text-foreground shadow-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
            style={{ fontSize: "18px" }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-1 flex size-12 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <X className="size-6" aria-hidden />
            </button>
          )}
        </div>

        <div className="mt-4" aria-live="polite">
          {!canSearch ? (
            <p className="px-1 text-muted-foreground">Type at least 2 letters of your first or last name.</p>
          ) : search.status === "failed" ? (
            <p className="rounded-2xl bg-muted p-4 text-lg">
              {search.error.code === "OFFLINE"
                ? "No connection. Check your data or WiFi. We'll search again as you type."
                : "Search isn't working right now. Please try again in a moment."}
            </p>
          ) : results === null ? (
            <p className="px-1 text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-1 text-lg">
              No names match <strong>&ldquo;{trimmed}&rdquo;</strong>. Check the spelling, or add your name below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const target = { studentId: s.id, fullName: s.full_name, classId, className };
                      // Already in class: nothing to confirm, just celebrate (the server can't double-mark).
                      if (s.already_marked_today) void mark(target);
                      else setSelected(target);
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left shadow-sm active:border-primary active:bg-accent"
                  >
                    <span className="text-xl font-bold leading-tight">{s.full_name}</span>
                    {s.already_marked_today && (
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
          )}
        </div>
      </main>

      <div className="safe-px safe-pb fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <Link
          href={addHref}
          prefetch={false}
          className="mx-auto flex h-14 w-full max-w-lg items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-card text-lg font-bold text-primary active:bg-accent"
        >
          <UserPlus className="size-6" aria-hidden />
          Can&apos;t find your name? Add it
        </Link>
      </div>

      {selected && outcome.kind === "idle" && (
        <ConfirmSheet
          name={selected.fullName}
          onCancel={cancelConfirm}
          onConfirm={() => {
            const target = selected;
            setSelected(null);
            void mark(target);
          }}
        />
      )}

      {outcome.kind !== "idle" && (
        <MarkOutcomeScreen
          outcome={outcome}
          timeZone={timeZone}
          onDone={goHome}
          onRetry={() => void mark(outcome.target)}
          onBack={reset}
        />
      )}
    </>
  );
}
