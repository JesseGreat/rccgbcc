"use client";

import { Check, Flag, Loader2, MessageSquarePlus, Pencil, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { FlagStudentButton } from "@/components/dashboard/flag-student-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatMediumDate } from "@/lib/attendance/dates";
import { saveRemark, setEntryDate } from "@/lib/forms/actions";
import { ageGroupLabel, sexLabel } from "@/lib/forms/labels";
import type { RegistrationRow } from "@/lib/reports/forms";
import { cn } from "@/lib/utils";

type RemarkTarget = { student: RegistrationRow; date: string; text: string; isNew: boolean };

/**
 * The Sunday School Students Registration Form on screen. Students fill in
 * name, age, sex and phone themselves; the teacher sets the entry date and
 * writes remarks here, at any time.
 */
export function RegistrationTable({
  rows,
  today,
  latestServiceDate,
  showClass = false,
  flags,
}: {
  rows: RegistrationRow[];
  today: string;
  /** Default date for a new remark: the most recent service day. */
  latestServiceDate: string;
  showClass?: boolean;
  /** Teacher view: open flag reason by student id. Omit to hide flagging. */
  flags?: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [remarkTarget, setRemarkTarget] = useState<RemarkTarget | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((r) => r.fullName.toLowerCase().includes(needle)) : rows;

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-lg text-muted-foreground">
        No students yet. Students appear here when they register on the app.
      </p>
    );
  }

  const sticky = "sticky left-0 z-10 bg-card";
  const th = "border-b px-3 py-3 text-left text-sm font-bold whitespace-nowrap";

  return (
    <>
      <label className="relative block sm:w-80">
        <span className="sr-only">Filter by name</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name"
          className="h-12 w-full rounded-xl border-2 border-input bg-card pr-3 pl-11 text-base focus:border-primary focus:outline-none"
        />
      </label>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-base">
          <thead>
            <tr>
              <th scope="col" className={cn(th, "w-12 text-right")}>
                S/N
              </th>
              <th scope="col" className={cn(th, sticky, "min-w-48")}>
                Name of student
              </th>
              {showClass && (
                <th scope="col" className={th}>
                  Class
                </th>
              )}
              <th scope="col" className={th}>
                Age
              </th>
              <th scope="col" className={th}>
                Sex
              </th>
              <th scope="col" className={th}>
                Telephone
              </th>
              <th scope="col" className={th}>
                Entry date
              </th>
              <th scope="col" className={cn(th, "min-w-72")}>
                Teacher&apos;s remarks
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.id}
                className="animate-rise-in align-top even:[&>*]:bg-muted/40"
                style={{ "--i": i } as React.CSSProperties}
              >
                <td className="border-b px-3 py-3 text-right text-muted-foreground tabular-nums">{rows.indexOf(r) + 1}</td>
                <th scope="row" className={cn(sticky, "max-w-60 border-b px-3 py-3 text-left font-bold")}>
                  <span className="block break-words">{r.fullName}</span>
                  {flags &&
                    (flags[r.id] ? (
                      <span className="mt-1 flex items-start gap-1 text-sm font-bold text-primary">
                        <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Flagged: {flags[r.id]}
                      </span>
                    ) : (
                      <span className="mt-1 block">
                        <FlagStudentButton studentId={r.id} studentName={r.fullName} />
                      </span>
                    ))}
                </th>
                {showClass && <td className="border-b px-3 py-3 whitespace-nowrap">{r.className}</td>}
                <td className="border-b px-3 py-3 whitespace-nowrap">{ageGroupLabel(r.ageGroup) || "-"}</td>
                <td className="border-b px-3 py-3 whitespace-nowrap">{sexLabel(r.gender) || "-"}</td>
                <td className="border-b px-3 py-3 whitespace-nowrap tabular-nums">
                  {r.phone ? (
                    <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="underline-offset-4 hover:underline">
                      {r.phone}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="border-b px-3 py-2">
                  <EntryDateCell student={r} today={today} />
                </td>
                <td className="border-b px-3 py-2">
                  <ul className="flex flex-col gap-1.5">
                    {r.remarks.map((m) => (
                      <li key={m.date}>
                        <button
                          type="button"
                          onClick={() => setRemarkTarget({ student: r, date: m.date, text: m.remark, isNew: false })}
                          className="group flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent"
                        >
                          <span className="shrink-0 text-sm font-bold whitespace-nowrap text-primary">{formatMediumDate(m.date)}</span>
                          <span className="flex-1 text-sm break-words">{m.remark}</span>
                          <Pencil className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setRemarkTarget({ student: r, date: latestServiceDate, text: "", isNew: true })}
                    className="mt-1 flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-primary transition-colors hover:bg-accent"
                  >
                    <MessageSquarePlus className="size-4" aria-hidden /> Add remark
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={showClass ? 8 : 7} className="p-6 text-center text-lg text-muted-foreground">
                  Nobody matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {remarkTarget && (
        <RemarkDialog key={`${remarkTarget.student.id}|${remarkTarget.date}`} target={remarkTarget} today={today} onClose={() => setRemarkTarget(null)} />
      )}
    </>
  );
}

/** A date box that saves itself as soon as it changes. */
function EntryDateCell({ student, today }: { student: RegistrationRow; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(student.entryDate ?? "");
  const [saved, setSaved] = useState(student.entryDate ?? "");
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const commit = (next: string) => {
    if (next === saved) return;
    startTransition(async () => {
      const r = await setEntryDate(student.id, next || null);
      if (r.ok) {
        setSaved(next);
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 1500);
        toast(`${student.fullName}: ${r.message.toLowerCase()}`);
        router.refresh();
      } else {
        setValue(saved);
        toast(r.message, "error");
      }
    });
  };

  return (
    <span className="flex items-center gap-2">
      <input
        type="date"
        value={value}
        max={today}
        aria-label={`Entry date for ${student.fullName}`}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          // Typing a date fires a change per part; save once it settles.
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(next), 700);
        }}
        className={cn(
          "h-10 rounded-lg border-2 bg-card px-2 text-base transition-colors focus:border-primary focus:outline-none",
          value ? "border-input" : "border-dashed border-primary/40 text-muted-foreground",
        )}
      />
      {pending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
      ) : (
        justSaved && <Check className="size-5 animate-pop-in text-success" strokeWidth={3} aria-label="Saved" />
      )}
    </span>
  );
}

function RemarkDialog({ target, today, onClose }: { target: RemarkTarget; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(target.date);
  const [text, setText] = useState(target.text);
  const [pending, startTransition] = useTransition();
  const existing = target.student.remarks.find((m) => m.date === date);

  const save = (value: string) => {
    startTransition(async () => {
      const r = await saveRemark(target.student.id, date, value);
      if (r.ok) {
        toast(`${target.student.fullName}: ${r.message.toLowerCase()}`);
        onClose();
        router.refresh();
      } else {
        toast(r.message, "error");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{target.isNew ? "Add a remark" : "Edit remark"}</DialogTitle>
          <DialogDescription className="text-base">{target.student.fullName}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-bold">Sunday</span>
          <input
            type="date"
            value={date}
            max={today}
            disabled={!target.isNew}
            onChange={(e) => {
              setDate(e.target.value);
              const found = target.student.remarks.find((m) => m.date === e.target.value);
              if (found) setText(found.remark);
            }}
            className="h-12 rounded-xl border-2 border-input bg-card px-3 text-base focus:border-primary focus:outline-none disabled:opacity-70"
          />
          {target.isNew && existing && (
            <span className="text-sm text-muted-foreground">There&apos;s already a remark for this Sunday. Saving replaces it.</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-bold">Remark</span>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
            placeholder="e.g. Very attentive; asked about baptism class"
            className="text-base"
          />
          <span className="text-right text-xs text-muted-foreground tabular-nums">{text.length}/500</span>
        </label>

        <div className="flex flex-wrap justify-between gap-2">
          {!target.isNew ? (
            <Button variant="ghost" className="text-primary" disabled={pending} onClick={() => save("")}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save(text)} disabled={pending || !text.trim() || !date}>
              {pending ? "Saving…" : "Save remark"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
