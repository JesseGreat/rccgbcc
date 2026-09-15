"use client";

import { useActionState } from "react";

import { updateSettings } from "@/app/sundayschool/_actions/settings";
import { Button } from "@/components/ui/button";
import { IDLE, type FormState } from "@/lib/admin/form";
import { DAY_NAMES } from "@/lib/attendance/format";

import { FormMessage, SelectField, TextField } from "./forms";

export type SettingsValues = {
  church_name: string;
  service_dow: number;
  window_start: string;
  window_end: string;
  timezone: string;
  max_marks_per_device: number;
};

export function SettingsForm({ values, timezones }: { values: SettingsValues; timezones: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSettings, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5 rounded-2xl border bg-card p-5">
      <TextField name="churchName" label="Church name" required maxLength={120} defaultValue={values.church_name} error={errors.churchName} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-bold">Attendance window</legend>
        <SelectField
          name="serviceDow"
          label="Service day"
          defaultValue={String(values.service_dow)}
          error={errors.serviceDow}
          options={DAY_NAMES.map((d, i) => ({ value: String(i), label: d }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="windowStart" label="Opens at" type="time" required defaultValue={values.window_start.slice(0, 5)} error={errors.windowStart} />
          <TextField
            name="windowEnd"
            label="Closes at"
            type="time"
            required
            defaultValue={values.window_end.slice(0, 5)}
            error={errors.windowEnd}
            hint="Marking is blocked from this minute."
          />
        </div>
        <SelectField
          name="timezone"
          label="Timezone"
          defaultValue={values.timezone}
          error={errors.timezone}
          options={timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
        />
      </fieldset>

      <TextField
        name="maxMarksPerDevice"
        label="People one phone can mark per day"
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        required
        defaultValue={values.max_marks_per_device}
        error={errors.maxMarksPerDevice}
        hint="Stops one phone marking a whole class. Parents with several children may need a higher number; teachers can always mark people in."
      />

      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
