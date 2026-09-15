"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { mergeStudents } from "@/app/sundayschool/_actions/students";
import { cn } from "@/lib/utils";

import { ConfirmButton } from "./forms";

export type MergeCandidate = {
  id: string;
  fullName: string;
  className: string;
  phone: string | null;
  isActive: boolean;
  addedOn: string;
  addedBy: string;
  attendanceCount: number;
  firstDate: string | null;
  lastDate: string | null;
};

export function MergePanel({ a, b }: { a: MergeCandidate; b: MergeCandidate }) {
  const router = useRouter();
  // Default to keeping the record with more history.
  const [keepId, setKeepId] = useState(b.attendanceCount > a.attendanceCount ? b.id : a.id);
  const keep = keepId === a.id ? a : b;
  const remove = keepId === a.id ? b : a;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 text-lg font-bold">Which record should stay?</legend>
        {[a, b].map((c, i) => {
          const selected = c.id === keepId;
          return (
            <label
              key={c.id}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-2xl border-2 bg-card p-4",
                selected ? "border-primary ring-4 ring-primary/15" : "border-border",
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="keep"
                  value={c.id}
                  checked={selected}
                  onChange={() => setKeepId(c.id)}
                  className="size-5 accent-[var(--primary)]"
                />
                <span className="text-sm font-bold text-muted-foreground">Record {i === 0 ? "A" : "B"}</span>
                <span className={cn("ml-auto text-sm font-bold", selected ? "text-primary" : "text-muted-foreground")}>
                  {selected ? "Keep" : "Merge into the other"}
                </span>
              </span>
              <span className="text-xl font-bold">{c.fullName}</span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
                <dt className="text-muted-foreground">Class</dt>
                <dd>{c.className}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{c.phone ?? "None"}</dd>
                <dt className="text-muted-foreground">Attended</dt>
                <dd>
                  {c.attendanceCount} {c.attendanceCount === 1 ? "time" : "times"}
                  {c.firstDate && ` (${c.firstDate} to ${c.lastDate})`}
                </dd>
                <dt className="text-muted-foreground">Added</dt>
                <dd>
                  {c.addedOn} {c.addedBy}
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{c.isActive ? "Active" : "Deactivated"}</dd>
              </dl>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base">
          <strong>{remove.fullName}</strong> ({remove.className}) will be removed. Their attendance moves to{" "}
          <strong>{keep.fullName}</strong> ({keep.className}); days both were marked count once.
        </p>
        <ConfirmButton
          variant="default"
          label="Merge records"
          title="Merge these records?"
          description={`${remove.fullName} will be deleted after moving their attendance to ${keep.fullName}. This can't be undone, but it is recorded in the audit log.`}
          confirmLabel="Yes, merge"
          action={async () => {
            const fd = new FormData();
            fd.set("keepId", keep.id);
            fd.set("removeId", remove.id);
            const result = await mergeStudents({ status: "idle" }, fd);
            if (result.status === "success") {
              router.push(`/sundayschool/students?q=${encodeURIComponent(keep.fullName)}&notice=${encodeURIComponent(result.message)}`);
            }
            return result;
          }}
        />
      </div>
    </div>
  );
}
