import { CloudOff } from "lucide-react";

export function ServiceUnavailable() {
  return (
    <main className="safe-px safe-pt safe-pb mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
      <div aria-hidden className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
        <CloudOff className="size-10" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">We can&apos;t reach attendance right now</h1>
      <p className="mt-3 text-lg text-muted-foreground">Please check your connection and try again in a moment.</p>
      {/* A full reload, not client navigation, so it works even if the app shell is stale. */}
      <a
        href=""
        className="mt-8 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground"
      >
        Try again
      </a>
    </main>
  );
}
