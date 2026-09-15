import { LogOut } from "lucide-react";
import Image from "next/image";

import { signOut } from "@/lib/auth/actions";

/** Top bar for staff areas, in the church's black-to-blue brand band. */
export function StaffHeader({ eyebrow, title, person }: { eyebrow: string; title: string; person: string }) {
  return (
    <header className="brand-hero-flat safe-pt safe-px text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/brand/bcc-logo.png"
            alt="RCCG Bethel Christian Centre"
            width={800}
            height={292}
            priority
            className="h-11 w-auto shrink-0 max-sm:hidden"
          />
          <div className="min-w-0 sm:border-l sm:border-white/20 sm:pl-3">
            <p className="truncate text-sm font-semibold tracking-wide text-white/75 uppercase">{eyebrow}</p>
            <h1 className="truncate text-2xl leading-tight font-extrabold">{title}</h1>
            <p className="truncate text-base text-white/80">{person}</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-12 shrink-0 items-center gap-2 rounded-full border-2 border-white/40 px-4 text-base font-bold text-white hover:bg-white/10 active:bg-white/20"
          >
            <LogOut className="size-5" aria-hidden />
            <span className="max-[380px]:sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
