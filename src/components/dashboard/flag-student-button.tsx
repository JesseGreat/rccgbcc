"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";

import { flagStudent } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const QUICK_REASONS = ["Duplicate of another name", "Name is misspelt", "Not in this class", "Doesn't attend any more"];

export function FlagStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await flagStudent(studentId, reason);
      if (result.ok) {
        setOpen(false);
        setReason("");
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="shrink-0 self-start sm:self-auto">
            <Flag aria-hidden />
            Flag
          </Button>
        }
      />
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Flag {studentName}</DialogTitle>
          <DialogDescription className="text-base">
            The superintendent will see this and fix the record. Attendance isn&apos;t changed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="min-h-10 rounded-full border-2 px-3 text-sm font-bold text-muted-foreground aria-pressed:border-primary aria-pressed:text-primary"
              aria-pressed={reason === r}
            >
              {r}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-base font-bold">What&apos;s wrong?</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Same person as “Chidi Okafor”"
            className="text-base"
          />
        </label>

        {error && (
          <p role="alert" className="text-base font-bold text-primary">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? "Sending…" : "Send flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
