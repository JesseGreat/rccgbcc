"use client";

import { Share, Smartphone, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "bcc.installHintDismissed";

function platformSnapshot(): "standalone" | "ios" | "other" {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "standalone";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

function dismissedSnapshot(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

/**
 * A quiet "Install this app" offer at the foot of the landing page.
 * Android/Chrome: the browser's own install prompt. iPhone: short instructions.
 * Hidden once installed or dismissed.
 */
export function InstallHint() {
  const platform = useSyncExternalStore(noopSubscribe, platformSnapshot, () => "standalone" as const);
  const storedDismissed = useSyncExternalStore(noopSubscribe, dismissedSnapshot, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === "standalone" || storedDismissed || dismissed) return null;
  if (platform !== "ios" && !promptEvent) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <aside className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      <Smartphone className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Keep this on your phone</p>
        {platform === "ios" ? (
          showIosSteps ? (
            <p className="mt-1 text-base text-muted-foreground">
              Tap <Share className="inline size-4 align-[-2px]" aria-label="Share" /> at the bottom of Safari, then{" "}
              <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setShowIosSteps(true)}
              className="mt-1 min-h-12 text-base font-bold text-primary underline underline-offset-4"
            >
              Show me how
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (!promptEvent) return;
              await promptEvent.prompt();
              await promptEvent.userChoice;
              setPromptEvent(null);
            }}
            className="mt-2 h-12 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground"
          >
            Install app
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="No thanks"
        className="-mt-1 -mr-1 flex size-12 shrink-0 items-center justify-center rounded-full text-muted-foreground"
      >
        <X className="size-5" aria-hidden />
      </button>
    </aside>
  );
}
