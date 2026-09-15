import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/settings-form";
import { StatusPill } from "@/components/student/status-pill";
import { requireSuperAdmin } from "@/lib/auth/session";
import type { WindowState } from "@/lib/db/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase } = await requireSuperAdmin();
  const [{ data: settings, error }, { data: windowData }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("church_name, service_dow, window_start, window_end, timezone, max_marks_per_device")
      .eq("id", 1)
      .single(),
    supabase.rpc("attendance_window_state"),
  ]);
  if (error || !settings) throw error ?? new Error("Settings missing");
  const window = windowData as unknown as WindowState | null;

  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(settings.timezone)) timezones.unshift(settings.timezone);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-base text-muted-foreground">Changes apply immediately for everyone. Every change is audited.</p>
        </div>
        {window && <StatusPill key={window.now} window={window} />}
      </div>
      <SettingsForm values={settings} timezones={timezones} />
    </div>
  );
}
