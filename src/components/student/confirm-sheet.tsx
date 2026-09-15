"use client";

import { useEffect, useRef } from "react";

/** The single confirmation step: "Mark <name> present?" */
export function ConfirmSheet({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={onCancel}
        className="animate-fade-in absolute inset-0 bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="animate-sheet-up safe-px safe-pb relative w-full max-w-lg rounded-t-3xl bg-card pt-3 shadow-2xl"
      >
        <div aria-hidden className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-border" />
        <h2 id="confirm-title" className="text-center text-2xl leading-snug">
          Mark <strong className="font-bold">{name}</strong> present?
        </h2>
        <div className="mt-6 flex flex-col gap-2 pb-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="h-14 w-full rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            Yes, mark me present
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-14 w-full rounded-2xl text-lg font-bold text-muted-foreground active:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
