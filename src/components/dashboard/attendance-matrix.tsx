import { Check } from "lucide-react";

import { formatShortDate } from "@/lib/attendance/dates";
import type { AttendanceMatrix } from "@/lib/reports/matrix";
import { cn } from "@/lib/utils";

/** Students down the side, service days across the top. Server-rendered, no JS. */
export function AttendanceMatrixTable({ matrix, showClass = false }: { matrix: AttendanceMatrix; showClass?: boolean }) {
  if (matrix.rows.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No students in this range.</p>;
  }
  if (matrix.dates.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">
        No service days in this range yet.
      </p>
    );
  }

  const stickyName = "sticky left-0 z-10 bg-card";

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-max min-w-full border-separate border-spacing-0 text-base">
        <caption className="sr-only">
          Attendance from {formatShortDate(matrix.from)} to {formatShortDate(matrix.to)}
        </caption>
        <thead>
          <tr className="text-left text-sm text-muted-foreground">
            <th scope="col" className={cn(stickyName, "min-w-40 border-b px-3 py-3 font-bold")}>
              Student
            </th>
            <th scope="col" className="border-b px-2 py-3 text-right font-bold">
              %
            </th>
            {matrix.dates.map((d) => (
              <th key={d} scope="col" className="border-b px-1 py-3 text-center font-bold whitespace-nowrap">
                {formatShortDate(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.studentId} className="even:[&>*]:bg-muted/40">
              <th scope="row" className={cn(stickyName, "max-w-56 border-b px-3 py-2 text-left font-bold")}>
                <span className="block truncate">{row.fullName}</span>
                {(showClass || !row.isActive) && (
                  <span className="block truncate text-sm font-normal text-muted-foreground">
                    {[showClass ? row.className : null, row.isActive ? null : "inactive"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </th>
              <td className="border-b px-2 py-2 text-right font-bold tabular-nums">
                {row.percentage === null ? "-" : `${row.percentage}%`}
                <span className="block text-xs font-normal text-muted-foreground">
                  {row.presentCount}/{row.possibleCount}
                </span>
              </td>
              {row.cells.map((cell, i) => (
                <td key={matrix.dates[i]} className="border-b px-1 py-2 text-center">
                  {cell === "present" ? (
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-success text-success-foreground">
                      <Check className="size-4" strokeWidth={3} aria-label="Present" />
                    </span>
                  ) : cell === "absent" ? (
                    <span className="text-muted-foreground/60" aria-label="Absent">
                      ·
                    </span>
                  ) : (
                    <span className="sr-only">Not yet joined</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-sm">
            <th scope="row" className={cn(stickyName, "px-3 py-3 text-left font-bold text-muted-foreground")}>
              Present
            </th>
            <td />
            {matrix.totals.map((t, i) => (
              <td key={matrix.dates[i]} className="px-1 py-3 text-center font-bold tabular-nums">
                {t}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
