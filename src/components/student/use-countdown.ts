"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Seconds remaining from a server-provided count. Purely cosmetic: the
 * server decides whether the window is open. Remount (via `key`) to restart.
 * `onElapsed` fires once when the count reaches zero.
 */
export function useCountdown(seconds: number | null, onElapsed?: () => void): number | null {
  const [elapsed, setElapsed] = useState(0);
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  });

  useEffect(() => {
    if (seconds == null) return;
    const start = Date.now();
    let fired = false;

    const tick = () => {
      const e = (Date.now() - start) / 1000;
      setElapsed(e);
      if (!fired && e >= seconds) {
        fired = true;
        onElapsedRef.current?.();
      }
    };

    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [seconds]);

  return seconds == null ? null : Math.max(0, Math.ceil(seconds - elapsed));
}
