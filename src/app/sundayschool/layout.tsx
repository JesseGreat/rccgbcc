import type { Metadata } from "next";

import { StaffHeader } from "@/components/dashboard/staff-header";
import { TabNav } from "@/components/dashboard/tab-nav";
import { requireSuperAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Superintendent", template: "%s · Superintendent" },
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({ children }: LayoutProps<"/sundayschool">) {
  const { profile } = await requireSuperAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StaffHeader
        eyebrow="Sunday School · Superintendent"
        title="Admin dashboard"
        person={profile.fullName || profile.email || ""}
      />
      <TabNav
        tabs={[
          { href: "/sundayschool", label: "Overview", exact: true },
          { href: "/sundayschool/classes", label: "Classes" },
          { href: "/sundayschool/teachers", label: "Teachers" },
          { href: "/sundayschool/students", label: "Students" },
          { href: "/sundayschool/corrections", label: "Corrections" },
          { href: "/sundayschool/export", label: "Export" },
          { href: "/sundayschool/settings", label: "Settings" },
          { href: "/sundayschool/audit", label: "Audit log" },
        ]}
      />
      <div className="safe-px safe-pb mx-auto w-full max-w-6xl flex-1 py-6">{children}</div>
    </div>
  );
}
