"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DAY_NAMES, formatCountdown, windowPhase } from "@/lib/attendance/format";
import type { WindowState } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { useCountdown } from "./use-countdown";

/**
 * Live window status. When a countdown reaches zero, or the phone wakes up,
 * the page re-fetches the real state from the server.
 * Render with `key={window.now}` so a refresh restarts the countdown.
 */
export function StatusPill({ window: state, className }: { window: WindowState; className?: string }) {
  const router = useRouter();
  const phase = windowPhase(state);

  const seconds =
    phase === "open" ? state.seconds_until_close : phase === "opens-today" ? state.seconds_until_open : null;
  const remaining = useCountdown(seconds, () => router.refresh());

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  const label =
    phase === "open" ? (
      <>Open, closes in {formatCountdown(remaining ?? 0)}</>
    ) : phase === "opens-today" ? (
      <>Opens in {formatCountdown(remaining ?? 0)}</>
    ) : (
      <>
        Closed<span className="font-normal">. See you next {DAY_NAMES[state.service_dow]}</span>
      </>
    );

  return (
    <p
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-full px-5 py-2 font-bold tabular-nums",
        phase === "closed" ? "text-base" : "text-lg",
        phase === "open"
          ? "bg-success text-success-foreground animate-soft-pulse"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2.5 shrink-0 rounded-full", phase === "open" ? "bg-success-foreground" : "bg-muted-foreground/60")}
      />
      <span>{label}</span>
    </p>
  );
}
