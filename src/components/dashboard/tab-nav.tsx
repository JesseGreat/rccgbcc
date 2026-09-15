"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type TabItem = { href: string; label: string; exact?: boolean };

export function TabNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="safe-px sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 items-center border-b-4 px-4 text-lg font-bold whitespace-nowrap",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
