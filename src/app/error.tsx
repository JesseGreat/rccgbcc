"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="safe-px safe-pt safe-pb mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        This is usually a brief connection problem. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary text-xl font-bold text-primary-foreground"
      >
        <RotateCcw className="size-5" aria-hidden />
        Try again
      </button>
      <Link href="/" className="mt-3 flex min-h-12 items-center text-lg font-bold text-muted-foreground underline underline-offset-4">
        Back to the start
      </Link>
      {error.digest && <p className="mt-6 text-sm text-muted-foreground">Reference: {error.digest}</p>}
    </main>
  );
}
