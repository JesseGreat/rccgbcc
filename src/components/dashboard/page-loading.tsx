export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span
        aria-hidden
        className="size-10 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none"
      />
      <p role="status" className="text-lg font-bold text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
