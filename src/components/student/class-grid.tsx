import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { PublicClass } from "@/lib/db/types";

export function ClassGrid({ classes, isOpen }: { classes: PublicClass[]; isOpen: boolean }) {
  if (classes.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-5 text-center text-muted-foreground">
        No classes have been set up yet. Please see a teacher.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
      {classes.map((c) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight">{c.name}</span>
              {c.description && <span className="mt-0.5 block text-base text-muted-foreground">{c.description}</span>}
            </span>
            <ChevronRight aria-hidden className="size-6 shrink-0" />
          </>
        );
        const base = "flex min-h-[4.5rem] w-full items-center justify-between gap-3 rounded-2xl border-2 px-5 py-3 text-left";

        return (
          <li key={c.id}>
            {isOpen ? (
              <Link
                href={`/class/${c.id}`}
                prefetch={false}
                className={`${base} border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-primary active:bg-accent focus-visible:border-primary focus-visible:outline-none`}
              >
                {body}
              </Link>
            ) : (
              <div aria-disabled="true" className={`${base} border-dashed bg-transparent text-muted-foreground opacity-70`}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
