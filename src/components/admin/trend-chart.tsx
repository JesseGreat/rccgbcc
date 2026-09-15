"use client";

import { useState } from "react";

import { formatMediumDate, formatShortDate } from "@/lib/attendance/dates";

/**
 * Weekly attendance columns. One series, so no legend: the heading names it.
 * Marks follow the chart spec: ≤24px columns with a 4px rounded top, hairline
 * solid grid, labels only on the latest and the peak, tooltip per column on
 * hover/focus, and a table view underneath.
 * Series colour #2c5190 is the navy step that passes the palette checks
 * (the brand navy #1b3a6b is too dark for a data mark).
 */
const SERIES = "#2c5190";
const PLOT_HEIGHT = 180;

type Point = { date: string; present: number };

function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 4, step: 1 };
  const rough = value / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return { max: Math.ceil(value / step) * step, step };
}

export function TrendChart({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(0, ...points.map((p) => p.present));
  const { max, step } = niceMax(peak);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const peakIndex = points.findIndex((p) => p.present === peak);
  const lastIndex = points.length - 1;

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative" style={{ height: PLOT_HEIGHT + 28 }}>
        {/* Gridlines + y ticks */}
        <div className="absolute inset-x-0 top-0" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 flex items-center" style={{ bottom: `${(t / max) * 100}%` }}>
              <span className="w-8 shrink-0 -translate-y-px pr-2 text-right text-xs text-muted-foreground tabular-nums">{t}</span>
              <span className={t === 0 ? "h-px flex-1 bg-[#c3c4cc]" : "h-px flex-1 bg-[#e6e7ee]"} />
            </div>
          ))}
        </div>

        {/* Columns */}
        <div className="absolute top-0 right-0 left-8 flex" style={{ height: PLOT_HEIGHT + 28 }}>
          {points.map((p, i) => {
            const heightPct = max ? (p.present / max) * 100 : 0;
            const labelled = i === lastIndex || (i === peakIndex && peak > 0);
            return (
              <button
                key={p.date}
                type="button"
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                aria-label={`${formatMediumDate(p.date)}: ${p.present} present`}
              >
                <span className="relative w-full" style={{ height: PLOT_HEIGHT }}>
                  <span
                    className="absolute bottom-0 left-1/2 w-[min(24px,60%)] -translate-x-1/2 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                    style={{ height: `${heightPct}%`, background: SERIES }}
                  />
                  {labelled && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-xs font-bold text-foreground tabular-nums"
                      style={{ bottom: `calc(${heightPct}% + 4px)` }}
                    >
                      {p.present}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-1.5 truncate text-[11px] text-muted-foreground ${(lastIndex - i) % 2 === 1 ? "max-sm:invisible" : ""}`}
                >
                  {formatShortDate(p.date)}
                </span>
                {active === i && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute z-10 flex -translate-y-full flex-col items-center rounded-lg border bg-card px-2.5 py-1.5 whitespace-nowrap shadow-md"
                    style={{ bottom: `calc(${(heightPct / 100) * PLOT_HEIGHT}px + 36px)` }}
                  >
                    <span className="text-base font-bold tabular-nums">{p.present}</span>
                    <span className="text-xs text-muted-foreground">{formatMediumDate(p.date)}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-bold text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-1 font-bold">Date</th>
              <th className="py-1 text-right font-bold">Present</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-b last:border-0">
                <td className="py-1">{formatMediumDate(p.date)}</td>
                <td className="py-1 text-right tabular-nums">{p.present}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
