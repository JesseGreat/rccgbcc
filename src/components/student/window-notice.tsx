import { Clock } from "lucide-react";

import { DAY_NAMES, formatDayDate, formatSettingTime, windowPhase } from "@/lib/attendance/format";
import type { WindowState } from "@/lib/db/types";

/** Explains when attendance opens. Rendered only while the window is closed. */
export function WindowNotice({ window: state }: { window: WindowState }) {
  const phase = windowPhase(state);
  if (phase === "open") return null;

  const start = formatSettingTime(state.window_start);
  const end = formatSettingTime(state.window_end);
  const day = DAY_NAMES[state.service_dow];

  return (
    <div className="flex gap-3 rounded-2xl border bg-card p-4 text-left">
      <Clock aria-hidden className="mt-0.5 size-6 shrink-0 text-primary" />
      <div className="space-y-1">
        {phase === "opens-today" ? (
          <>
            <p className="font-bold">Attendance opens at {start}.</p>
            <p className="text-muted-foreground">The classes below will unlock on their own. No need to refresh.</p>
          </>
        ) : (
          <>
            <p className="font-bold">
              Attendance is open on {day}s, {start} to {end}.
            </p>
            <p className="text-muted-foreground">
              Next: {formatDayDate(state.opens_at, state.timezone)} at {start}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
