"use client";

import { Check, Lock, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";

import { markSelfPresent, undoSelfMark, updateSelfEntry } from "@/app/dashboard/actions";
import { useCountdown } from "@/components/student/use-countdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDayDate, formatSettingTime, formatTime } from "@/lib/attendance/format";
import type { WindowState } from "@/lib/db/types";
import { staffTitleLabel, TEACHERS_FORM_TITLE } from "@/lib/forms/labels";
import { cn } from "@/lib/utils";

export type SelfEntry = { markedAt: string; topic: string | null; remarks: string | null };

const inputClass =
  "h-12 w-full rounded-xl border-2 border-input bg-card px-3.5 text-base focus:border-primary focus:outline-none disabled:opacity-70";

/**
 * The teacher's own line on the Teachers and Assistant Teachers Form.
 * Open window: mark present (topic and remarks optional), edit, or undo.
 * Closed window: read-only.
 */
export function TeacherSelfMark({
  window: state,
  entry,
  staffTitle,
  name,
}: {
  window: WindowState;
  entry: SelfEntry | null;
  staffTitle: string;
  name: string;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState(entry?.topic ?? "");
  const [remarks, setRemarks] = useState(entry?.remarks ?? "");
  const [optimistic, setOptimistic] = useState<SelfEntry | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const remaining = useCountdown(state.is_open ? state.seconds_until_close : null);
  const open = state.is_open && remaining !== 0;
  const current = optimistic === undefined ? entry : optimistic;
  const dirty = current !== null && ((current.topic ?? "") !== topic.trim() || (current.remarks ?? "") !== remarks.trim());

  const run = (work: () => Promise<{ ok: boolean; message?: string }>, next: SelfEntry | null, success: string) => {
    setOptimistic(next);
    startTransition(async () => {
      const r = await work();
      if (r.ok) toast(success);
      else toast(r.message ?? "That didn't save.", "error");
      setOptimistic(undefined);
    });
  };

  const mark = () =>
    run(
      () => markSelfPresent({ topic, remarks }),
      { markedAt: new Date().toISOString(), topic: topic.trim() || null, remarks: remarks.trim() || null },
      "You're marked present. God bless you!",
    );
  const save = () =>
    run(
      () => updateSelfEntry({ topic, remarks }),
      current && { ...current, topic: topic.trim() || null, remarks: remarks.trim() || null },
      "Saved.",
    );
  const undo = () => run(() => undoSelfMark(), null, "Your mark was removed.");

  return (
    <section
      aria-labelledby="self-mark-heading"
      className={cn(
        "flex flex-col gap-4 rounded-3xl border-2 bg-card p-5 transition-colors duration-300",
        current ? "border-success/40 bg-success-soft/50" : "border-primary/20",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{TEACHERS_FORM_TITLE}</p>
          <h2 id="self-mark-heading" className="mt-1 text-xl font-extrabold">
            {name} <span className="font-semibold text-muted-foreground">· {staffTitleLabel(staffTitle)}</span>
          </h2>
        </div>
        {current ? (
          <span className="flex animate-pop-in items-center gap-2 rounded-full bg-success px-3 py-1.5 text-base font-bold text-success-foreground">
            <Check className="size-5" strokeWidth={3} aria-hidden />
            Present · {formatTime(current.markedAt, state.timezone)}
          </span>
        ) : (
          <span className="rounded-full border-2 border-dashed px-3 py-1.5 text-base font-bold text-muted-foreground">Not marked</span>
        )}
      </div>

      {open ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-bold">
                Topic taught <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
                placeholder="e.g. The Prodigal Son"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-bold">
                Remarks <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={500}
                rows={1}
                placeholder="e.g. Good participation"
                className="min-h-12 text-base"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {current ? (
              <>
                <Button onClick={save} disabled={pending || !dirty} className="h-12 px-5 text-base">
                  {pending ? "Saving…" : "Save changes"}
                </Button>
                <Button variant="outline" onClick={undo} disabled={pending} className="h-12 text-base">
                  <Undo2 aria-hidden /> Undo my mark
                </Button>
              </>
            ) : (
              <Button onClick={mark} disabled={pending} className="h-14 px-6 text-lg active:scale-[0.98]">
                {pending ? "Marking…" : "Mark me present"}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 text-base">
          {current && (current.topic || current.remarks) && (
            <dl className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
              {current.topic && (
                <>
                  <dt className="font-bold">Topic</dt>
                  <dd>{current.topic}</dd>
                </>
              )}
              {current.remarks && (
                <>
                  <dt className="font-bold">Remarks</dt>
                  <dd>{current.remarks}</dd>
                </>
              )}
            </dl>
          )}
          <p className="flex items-start gap-2 text-muted-foreground">
            <Lock className="mt-1 size-4 shrink-0" aria-hidden />
            {current
              ? "Attendance has closed, so this is locked."
              : `You can mark yourself present while attendance is open: ${formatDayDate(state.opens_at, state.timezone)}, ${formatSettingTime(state.window_start)} to ${formatSettingTime(state.window_end)}.`}
          </p>
        </div>
      )}
    </section>
  );
}
