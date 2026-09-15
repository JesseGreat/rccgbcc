import { connection } from "next/server";

import { BrandBanner } from "@/components/brand/brand-banner";
import { InstallHint } from "@/components/pwa/install-hint";
import { ClassGrid } from "@/components/student/class-grid";
import { ReturningUserCard } from "@/components/student/returning-user-card";
import { ServiceUnavailable } from "@/components/student/service-unavailable";
import { StatusPill } from "@/components/student/status-pill";
import { WindowNotice } from "@/components/student/window-notice";
import { getClasses } from "@/lib/attendance/rpc";

export default async function LandingPage() {
  await connection();
  const result = await getClasses();
  if (!result.ok) return <ServiceUnavailable />;

  const { church_name: churchName, window, classes } = result.data;

  return (
    <>
      <BrandBanner>
        <p className="sr-only">{churchName}</p>
        <h1 className="mt-5 text-[2rem] leading-tight font-extrabold tracking-tight">Sunday School Attendance</h1>
        <StatusPill key={window.now} window={window} className="mt-5" />
      </BrandBanner>

      <main className="safe-px safe-pb mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 pt-6">
        {window.is_open && <ReturningUserCard activeClassIds={classes.map((c) => c.id)} timeZone={window.timezone} serviceDate={window.service_date} />}

        <WindowNotice window={window} />

        <section aria-labelledby="classes-heading" className="flex flex-col gap-3">
          <h2 id="classes-heading" className="px-1 text-xl font-extrabold">
            {window.is_open ? "Choose your class" : "Classes"}
          </h2>
          <ClassGrid classes={classes} isOpen={window.is_open} />
        </section>

        <InstallHint />
      </main>
    </>
  );
}
