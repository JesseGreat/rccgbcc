import type { Metadata } from "next";

import { StaffHeader } from "@/components/dashboard/staff-header";
import { TabNav } from "@/components/dashboard/tab-nav";
import { requireTeacher } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Teacher dashboard", robots: { index: false, follow: false } };

// There is deliberately no class switcher: a teacher's dashboard is their class.
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { profile, className } = await requireTeacher();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StaffHeader eyebrow="Sunday School · Teacher" title={className} person={profile.fullName || profile.email || ""} />
      <TabNav
        tabs={[
          { href: "/dashboard", label: "Today", exact: true },
          { href: "/dashboard/history", label: "History" },
          { href: "/dashboard/students", label: "Students" },
        ]}
      />
      <div className="safe-px safe-pb mx-auto w-full max-w-6xl flex-1 py-6">{children}</div>
    </div>
  );
}
