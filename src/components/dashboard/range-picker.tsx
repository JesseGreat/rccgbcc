import Link from "next/link";

import { addDays } from "@/lib/attendance/dates";
import type { DateRange } from "@/lib/reports/load";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Last 4 weeks", days: 27 },
  { label: "12 weeks", days: 83 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 364 },
];

/** Plain GET form: works without JavaScript and keeps the range in the URL. */
export function RangePicker({
  basePath,
  range,
  today,
  params = {},
  children,
}: {
  basePath: string;
  range: DateRange;
  today: string;
  /** Extra query params to keep (e.g. classId). */
  params?: Record<string, string>;
  /** Extra form controls rendered before the dates (e.g. a class select). */
  children?: React.ReactNode;
}) {
  const keep = Object.entries(params).filter(([, v]) => v);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
        {children}
        {!children && keep.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">From</span>
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            max={today}
            className="h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">To</span>
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            max={today}
            className="h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none"
          />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground">
          Show
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const from = addDays(today, -p.days);
          const active = range.from === from && range.to === today;
          return (
            <Link
              key={p.label}
              href={`${basePath}?${new URLSearchParams([...keep, ["from", from], ["to", today]]).toString()}`}
              className={cn(
                "flex h-10 items-center rounded-full border-2 px-4 text-sm font-bold",
                active ? "border-primary bg-accent text-primary" : "text-muted-foreground",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
