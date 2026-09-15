import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandBanner } from "@/components/brand/brand-banner";
import { getStaffSession, homePathFor } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const session = await getStaffSession();
  if (session && !(session.profile.role === "teacher" && !session.profile.classId)) {
    redirect(homePathFor(session.profile.role));
  }

  const next = typeof searchParams.next === "string" ? searchParams.next : "";
  const notice =
    searchParams.error === "no_class"
      ? "Your account isn't linked to a class yet. Please ask the Sunday School superintendent."
      : undefined;

  return (
    <>
      <BrandBanner>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-lg text-white/80">For Sunday School teachers and the superintendent.</p>
      </BrandBanner>

      <main className="safe-px safe-pb mx-auto flex w-full max-w-md flex-1 flex-col py-8">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <LoginForm next={next} notice={notice} />
        </div>

        <p className="mt-6 text-center text-base text-muted-foreground">
          Accounts are created by the superintendent. Forgot your password? Ask them to reset it.
        </p>
      </main>
    </>
  );
}
