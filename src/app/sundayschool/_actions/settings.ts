"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { fail, formValues, fromZodError, ok, unexpected, type FormState } from "@/lib/admin/form";
import { requireSuperAdmin } from "@/lib/auth/session";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const settingsSchema = z
  .object({
    churchName: z.string().min(1, "Enter the church name.").max(120),
    serviceDow: z.coerce.number().int().min(0).max(6),
    windowStart: z.string().regex(TIME, "Use a time like 08:00."),
    windowEnd: z.string().regex(TIME, "Use a time like 08:40."),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone."),
    maxMarksPerDevice: z.coerce.number().int("Whole numbers only.").min(1, "At least 1.").max(50, "At most 50."),
  })
  .refine((v) => v.windowEnd > v.windowStart, { path: ["windowEnd"], message: "Must be after the start time." });

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperAdmin();
  const parsed = settingsSchema.safeParse(formValues(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const d = parsed.data;

  const { error } = await supabase
    .from("app_settings")
    .update({
      church_name: d.churchName,
      service_dow: d.serviceDow,
      window_start: d.windowStart,
      window_end: d.windowEnd,
      timezone: d.timezone,
      max_marks_per_device: d.maxMarksPerDevice,
    })
    .eq("id", 1);
  if (error?.code === "22023") return fail("That timezone isn't recognised.", { timezone: "Choose a valid timezone." });
  if (error?.code === "23514") return fail("Please check the values.", { windowEnd: "Must be after the start time." });
  if (error) return unexpected("updateSettings", error);
  refresh();
  return ok("Settings saved. They apply immediately.");
}
