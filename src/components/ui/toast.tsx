"use client";

import { Check, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone; leaving: boolean };
type ToastFn = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ToastFn>(() => {});

const VISIBLE_MS = 3500;
const LEAVE_MS = 200;

/** Small "Saved" / "That didn't save" messages at the bottom of staff screens. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const toast = useCallback<ToastFn>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, message, tone, leaving: false }]);
      window.setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="safe-pb pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-base font-bold shadow-lg transition-all duration-200",
              t.tone === "success" ? "bg-foreground text-background" : "bg-primary text-primary-foreground",
              t.leaving ? "translate-y-2 opacity-0" : "animate-toast-in",
            )}
          >
            {t.tone === "success" ? (
              <Check className="mt-0.5 size-5 shrink-0 text-success-soft" strokeWidth={3} aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 rounded-full p-1 opacity-70 hover:opacity-100">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
