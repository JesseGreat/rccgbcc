import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The church's hero look from rccgbcc.org: black fading into royal blue, with
 * the white BCC logo. The logo's lettering is white, so it only ever sits on this band.
 */
export function BrandBanner({ children, className, logoClassName }: { children?: ReactNode; className?: string; logoClassName?: string }) {
  return (
    <div className={cn("brand-hero safe-px safe-pt rounded-b-[2rem] pb-7 text-white", className)}>
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center pt-5 text-center">
        <Image
          src="/brand/bcc-logo.png"
          alt="RCCG Bethel Christian Centre"
          width={800}
          height={292}
          priority
          className={cn("h-auto w-56 max-w-[70%]", logoClassName)}
        />
        {children}
      </div>
    </div>
  );
}
