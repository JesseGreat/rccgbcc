import Link from "next/link";

export default function NotFound() {
  return (
    <main className="safe-px safe-pt safe-pb mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-lg text-muted-foreground">The class may have been renamed or removed.</p>
      <Link
        href="/"
        className="mt-8 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground"
      >
        See all classes
      </Link>
    </main>
  );
}
