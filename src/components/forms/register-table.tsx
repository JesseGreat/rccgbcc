"use client";

import { Check, Lock, MessageSquareText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markPresent, undoMark } from "@/app/dashboard/actions";
import { setAttendance } from "@/app/sundayschool/_actions/attendance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatLongDate } from "@/lib/attendance/dates";
import { saveRemark } from "@/lib/forms/actions";
import { sexShort } from "@/lib/forms/labels";
import type { MatrixCell, MatrixRow } from "@/lib/reports/matrix";
import type { RegisterMonth } from "@/lib/reports/register";
import { cn } from "@/lib/utils";

/**
 * Who may tick and untick cells:
 *   teacher  only `openDate` (today, while the window is open)
 *   admin    any date up to today (audited corrections)
 *   none     read-only ticks
 * Remarks can be written on any cell up to today in every mode except none.
 */
export type RegisterEditMode = { kind: "teacher"; openDate: string | null } | { kind: "admin" } | { kind: "none" };

type Selected = { row: MatrixRow; date: string; index: number };

export function RegisterTable({
  months,
  dates,
  rows,
  remarks,
  today,
  mode,
  showClass = false,
}: {
  months: RegisterMonth[];
  dates: string[];
  rows: MatrixRow[];
  /** Remark text keyed "studentId|date". */
  remarks: Record<string, string>;
  today: string;
  mode: RegisterEditMode;
  showClass?: boolean;
}) {
  // Local edits shown instantly, before the server refresh lands.
  const [cellOverrides, setCellOverrides] = useState<Record<string, MatrixCell>>({});
  const [remarkOverrides, setRemarkOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Selected | null>(null);

  const cellOf = (row: MatrixRow, i: number) => cellOverrides[`${row.studentId}|${dates[i]}`] ?? row.cells[i];
  const remarkOf = (studentId: string, date: string) => {
    const key = `${studentId}|${date}`;
    return key in remarkOverrides ? remarkOverrides[key] : (remarks[key] ?? "");
  };

  const totals = dates.map((_, i) => rows.reduce((n, r) => n + (cellOf(r, i) === "present" ? 1 : 0), 0));

  if (rows.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No students in this range.</p>;
  }
  if (dates.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">No service days in this range yet.</p>
    );
  }

  const editable = mode.kind !== "none";
  const sticky = "sticky left-0 z-10 bg-card";

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-base">
          <thead>
            <tr className="text-sm">
              <th rowSpan={2} scope="col" className={cn(sticky, "min-w-44 border-b px-3 py-2 text-left align-bottom font-bold")}>
                Name of member
              </th>
              <th rowSpan={2} scope="col" className="border-b px-2 py-2 text-center align-bottom font-bold">
                Sex
              </th>
              {months.map((m) => (
                <th
                  key={m.key}
                  colSpan={m.columns.length}
                  scope="colgroup"
                  className="border-b border-l bg-muted/60 px-2 py-1.5 text-center font-extrabold whitespace-nowrap"
                >
                  {m.label}
                </th>
              ))}
              <th rowSpan={2} scope="col" className="border-b border-l px-2 py-2 text-right align-bottom font-bold">
                %
              </th>
            </tr>
            <tr className="text-xs text-muted-foreground">
              {months.flatMap((m) =>
                m.columns.map((c, ci) => (
                  <th
                    key={c.date}
                    scope="col"
                    className={cn(
                      "border-b px-1 py-1.5 text-center font-bold whitespace-nowrap",
                      ci === 0 && "border-l",
                      mode.kind === "teacher" && c.date === mode.openDate && "bg-success-soft text-success",
                    )}
                  >
                    {c.label}
                    <span className="block font-normal">{c.day}</span>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.studentId} className="animate-rise-in even:[&>*]:bg-muted/40" style={{ "--i": ri } as React.CSSProperties}>
                <th scope="row" className={cn(sticky, "max-w-56 border-b px-3 py-1.5 text-left font-bold")}>
                  <span className="block truncate">{row.fullName}</span>
                  {(showClass || !row.isActive) && (
                    <span className="block truncate text-sm font-normal text-muted-foreground">
                      {[showClass ? row.className : null, row.isActive ? null : "inactive"].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </th>
                <td className="border-b px-2 py-1.5 text-center font-bold text-muted-foreground">{sexShort(row.gender) || "-"}</td>
                {dates.map((d, i) => {
                  const cell = cellOf(row, i);
                  const hasRemark = Boolean(remarkOf(row.studentId, d));
                  const content =
                    cell === "present" ? (
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-success text-success-foreground">
                        <Check className="size-4" strokeWidth={3} aria-hidden />
                      </span>
                    ) : cell === "absent" ? (
                      <span className="inline-flex size-7 items-center justify-center text-muted-foreground/60">·</span>
                    ) : (
                      <span className="inline-flex size-7" />
                    );
                  const label = `${row.fullName}, ${formatLongDate(d)}: ${cell === "present" ? "present" : cell === "absent" ? "absent" : "not yet joined"}${hasRemark ? ", has a remark" : ""}`;
                  return (
                    <td key={d} className="border-b p-0.5 text-center">
                      {editable && d <= today ? (
                        <button
                          type="button"
                          aria-label={label}
                          onClick={() => setSelected({ row, date: d, index: i })}
                          className="relative inline-flex size-10 items-center justify-center rounded-xl transition-all duration-150 hover:bg-accent hover:ring-2 hover:ring-primary/30 active:scale-90"
                        >
                          {content}
                          {hasRemark && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-primary" />}
                        </button>
                      ) : (
                        <span aria-label={label} className="relative inline-flex size-10 items-center justify-center">
                          {content}
                          {hasRemark && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-primary" />}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-l px-2 py-1.5 text-right font-bold tabular-nums">
                  {row.percentage === null ? "-" : `${row.percentage}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm">
              <th scope="row" className={cn(sticky, "px-3 py-3 text-left font-bold text-muted-foreground")}>
                Present
              </th>
              <td />
              {totals.map((t, i) => (
                <td key={dates[i]} className="px-1 py-3 text-center font-bold tabular-nums">
                  {t}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Tap a box to add a remark{mode.kind === "admin" ? " or correct attendance" : ""}.</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden /> has a remark
          </span>
          {mode.kind === "teacher" && mode.openDate && (
            <span className="flex items-center gap-1.5 font-bold text-success">Today&apos;s column can be ticked until attendance closes.</span>
          )}
        </p>
      )}

      {selected && (
        <CellDialog
          key={`${selected.row.studentId}|${selected.date}`}
          selected={selected}
          cell={cellOf(selected.row, selected.index)}
          remark={remarkOf(selected.row.studentId, selected.date)}
          mode={mode}
          onClose={() => setSelected(null)}
          onCell={(cell) => setCellOverrides((o) => ({ ...o, [`${selected.row.studentId}|${selected.date}`]: cell }))}
          onRemark={(text) => setRemarkOverrides((o) => ({ ...o, [`${selected.row.studentId}|${selected.date}`]: text }))}
        />
      )}
    </>
  );
}

function CellDialog({
  selected,
  cell,
  remark,
  mode,
  onClose,
  onCell,
  onRemark,
}: {
  selected: Selected;
  cell: MatrixCell;
  remark: string;
  mode: RegisterEditMode;
  onClose: () => void;
  onCell: (cell: MatrixCell) => void;
  onRemark: (text: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(remark);
  const [pending, startTransition] = useTransition();
  const { row, date } = selected;
  const present = cell === "present";

  const canToggle = mode.kind === "admin" || (mode.kind === "teacher" && mode.openDate === date);
  const lockReason =
    mode.kind === "teacher"
      ? mode.openDate === null
        ? "Attendance is closed. Ticks can only be changed while it's open."
        : "Only today's attendance can be changed. Ask the superintendent to correct past Sundays."
      : null;

  const toggle = () => {
    const next = !present;
    const previous = cell;
    onCell(next ? "present" : "absent");
    startTransition(async () => {
      let ok: boolean;
      let message: string;
      if (mode.kind === "admin") {
        const r = await setAttendance({ studentId: row.studentId, classId: row.classId ?? "", date, present: next });
        ok = r.status === "success";
        message = r.status === "idle" ? "" : r.message;
      } else {
        const r = next ? await markPresent(row.studentId) : await undoMark(row.studentId);
        ok = r.ok;
        message = r.ok ? "" : r.message;
      }
      if (ok) {
        toast(next ? `${row.fullName} marked present.` : `${row.fullName} marked absent.`);
        router.refresh();
      } else {
        onCell(previous);
        toast(message || "That didn't save.", "error");
      }
    });
  };

  const save = () => {
    const before = remark;
    onRemark(text.trim());
    startTransition(async () => {
      const r = await saveRemark(row.studentId, date, text);
      if (r.ok) {
        toast(r.message);
        onClose();
        router.refresh();
      } else {
        onRemark(before);
        toast(r.message, "error");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{row.fullName}</DialogTitle>
          <DialogDescription className="text-base">{formatLongDate(date)}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3 rounded-2xl border p-4">
          <p className="flex items-center gap-2 text-lg font-bold">
            {present ? (
              <>
                <span className="flex size-8 animate-pop-in items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="size-5" strokeWidth={3} aria-hidden />
                </span>
                Present
              </>
            ) : (
              <>
                <span className="flex size-8 items-center justify-center rounded-full border-2 border-dashed">
                  <X className="size-4 text-muted-foreground" aria-hidden />
                </span>
                {cell === "not_yet" ? "Not yet joined" : "Absent"}
              </>
            )}
          </p>
          {canToggle ? (
            <Button onClick={toggle} disabled={pending} variant={present ? "outline" : "default"} className="h-12 text-base">
              {present ? "Mark absent" : "Mark present"}
            </Button>
          ) : (
            lockReason && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {lockReason}
              </p>
            )
          )}
        </section>

        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-base font-bold">
            <MessageSquareText className="size-5 text-primary" aria-hidden />
            Teacher&apos;s remark for this Sunday
          </span>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Answered every question in class"
            className="text-base"
          />
          <span className="text-right text-xs text-muted-foreground tabular-nums">{text.length}/500</span>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} disabled={pending || text.trim() === remark.trim()}>
            {pending ? "Saving…" : text.trim() || !remark ? "Save remark" : "Remove remark"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
