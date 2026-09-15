/** Instant feedback after tapping a class on a slow connection. No JS, no animation library. */
export default function Loading() {
  return (
    <main className="safe-px safe-pt mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <span
        aria-hidden
        className="size-12 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none"
      />
      <p role="status" className="text-xl font-bold">
        Opening your class…
      </p>
    </main>
  );
}
