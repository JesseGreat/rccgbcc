import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { WindowState } from "@/lib/db/types";

import { StatusPill } from "./status-pill";
import { WindowNotice } from "./window-notice";

/** Shown instead of a class's search/add screens outside the window: explain, don't dead-end. */
export function ClassClosed({ className, window }: { className: string; window: WindowState }) {
  return (
    <main className="safe-px safe-pt safe-pb mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 pt-6">
      <Link href="/" className="-ml-2 flex min-h-12 items-center gap-2 self-start rounded-full pr-4 text-lg font-bold">
        <ArrowLeft className="size-7" aria-hidden />
        All classes
      </Link>
      <div className="text-center">
        <h1 className="text-3xl font-bold">{className}</h1>
        <StatusPill key={window.now} window={window} className="mt-4" />
      </div>
      <WindowNotice window={window} />
    </main>
  );
}
