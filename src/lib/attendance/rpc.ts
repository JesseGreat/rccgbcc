import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  RPC_ERROR_CODES,
  type AddStudentResult,
  type GetClassesResult,
  type MarkAttendanceResult,
  type RpcErrorCode,
  type StudentSearchResult,
  type WindowState,
} from "@/lib/db/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Typed wrappers around the student-facing Postgres functions. The database
 * enforces every rule (window, device cap, duplicates); these only translate
 * results and errors into shapes the app can switch on.
 */

export type RpcFailureCode = RpcErrorCode | "UNAVAILABLE";

export type RpcFailure = {
  code: RpcFailureCode;
  detail?: string;
  /** Present when code is WINDOW_CLOSED. */
  window?: WindowState;
};

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcFailure };

export async function getClasses(): Promise<RpcResult<GetClassesResult>> {
  const { data, error } = await getSupabaseAdmin().rpc("get_classes");
  if (error) return fail(error, "get_classes");
  return { ok: true, data: data as unknown as GetClassesResult };
}

export async function searchStudents(
  classId: string,
  query: string,
): Promise<RpcResult<StudentSearchResult[]>> {
  const { data, error } = await getSupabaseAdmin().rpc("search_students", {
    p_class_id: classId,
    p_query: query,
  });
  if (error) return fail(error, "search_students");
  return { ok: true, data: data ?? [] };
}

export async function markAttendance(
  studentId: string,
  deviceHash: string,
): Promise<RpcResult<MarkAttendanceResult>> {
  const { data, error } = await getSupabaseAdmin().rpc("mark_attendance", {
    p_student_id: studentId,
    p_device_hash: deviceHash,
  });
  if (error) return fail(error, "mark_attendance");
  return { ok: true, data: data as unknown as MarkAttendanceResult };
}

export async function addStudent(input: {
  classId: string;
  fullName: string;
  phone: string | null;
  deviceHash: string;
  force: boolean;
}): Promise<RpcResult<AddStudentResult>> {
  const { data, error } = await getSupabaseAdmin().rpc("add_student", {
    p_class_id: input.classId,
    p_full_name: input.fullName,
    p_phone: input.phone ?? undefined,
    p_device_hash: input.deviceHash,
    p_force: input.force,
  });
  if (error) return fail(error, "add_student");
  return { ok: true, data: data as unknown as AddStudentResult };
}

function fail(error: PostgrestError, fn: string): { ok: false; error: RpcFailure } {
  const code = error.code as keyof typeof RPC_ERROR_CODES;
  if (code in RPC_ERROR_CODES) {
    const failure: RpcFailure = { code: RPC_ERROR_CODES[code], detail: error.details || undefined };
    if (code === "AW001" && error.details) {
      try {
        failure.window = JSON.parse(error.details) as WindowState;
        failure.detail = undefined;
      } catch {
        // detail wasn't JSON; leave it as text
      }
    }
    return { ok: false, error: failure };
  }
  // Malformed uuid and similar input errors from Postgres itself.
  if (error.code === "22P02") {
    return { ok: false, error: { code: "INVALID_INPUT", detail: "id" } };
  }
  console.error(`[rpc] ${fn} failed`, { code: error.code, message: error.message, details: error.details });
  return { ok: false, error: { code: "UNAVAILABLE" } };
}
