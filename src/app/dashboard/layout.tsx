import type { Metadata } from "next";

import { StaffHeader } from "@/components/dashboard/staff-header";
import { TabNav } from "@/components/dashboard/tab-nav";
import { ToastProvider } from "@/components/ui/toast";
import { requireTeacher } from "@/lib/auth/session";
import { staffTitleLabel } from "@/lib/forms/labels";

export const metadata: Metadata = { title: "Teacher dashboard", robots: { index: false, follow: false } };

// There is deliberately no class switcher: a teacher's dashboard is their class.
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { profile, className } = await requireTeacher();

  return (
    <ToastProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <StaffHeader
          eyebrow={`Sunday School · ${staffTitleLabel(profile.staffTitle)}`}
          title={className}
          person={profile.fullName || profile.email || ""}
        />
        <TabNav
          tabs={[
            { href: "/dashboard", label: "Today", exact: true },
            { href: "/dashboard/history", label: "Attendance register" },
            { href: "/dashboard/students", label: "Registration form" },
            { href: "/dashboard/teaching", label: "My attendance" },
          ]}
        />
        <div className="safe-px safe-pb mx-auto w-full max-w-6xl flex-1 animate-fade-in py-6">{children}</div>
      </div>
    </ToastProvider>
  );
}
