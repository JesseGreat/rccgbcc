import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";

/** Result of an admin form/server action, rendered by the admin form components. */
export type FormState =
  | { status: "idle" }
  | {
      status: "success";
      message: string;
      /** Shown once for copying (e.g. a new password). Never logged or stored. */
      secret?: string;
    }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const IDLE: FormState = { status: "idle" };

export function ok(message: string, secret?: string): FormState {
  return { status: "success", message, secret };
}

export function fail(message: string, fieldErrors?: Record<string, string>): FormState {
  return { status: "error", message, fieldErrors };
}

/** FormData -> plain object of trimmed strings (files ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value.trim();
  }
  return out;
}

export function fromZodError(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fail("Please check the highlighted fields.", fieldErrors);
}

/** Log unexpected database errors and return a safe, friendly message. */
export function unexpected(context: string, error: PostgrestError | Error | null | undefined): FormState {
  console.error(`[admin] ${context}`, error && "code" in error ? `${error.code} ${error.message}` : error);
  return fail("Something went wrong saving that. Please try again.");
}
