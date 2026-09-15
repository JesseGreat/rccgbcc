import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

import "./globals.css";

// The church website's typeface (rccgbcc.org).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for metadata URLs (manifest, icons, share links).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Sunday School Attendance · RCCG Bethel Christian Center",
    template: "%s · RCCG Bethel Sunday School",
  },
  description: "Mark yourself present at RCCG Bethel Christian Center Sunday School.",
  applicationName: "Bethel Sunday School",
  appleWebApp: { capable: true, title: "Bethel SS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0d0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
