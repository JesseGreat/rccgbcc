// Typed payloads for the jsonb-returning RPCs and the error codes they raise.
// Keep in sync with supabase/migrations/0003_attendance_window.sql and 0006_student_rpc.sql.

import type { Tables } from "@/lib/supabase/database.types";

export type ClassRow = Tables<"classes">;
export type StudentRow = Tables<"students">;
export type AttendanceRow = Tables<"attendance">;
export type ProfileRow = Tables<"profiles">;
export type AppSettingsRow = Tables<"app_settings">;
export type AuditLogRow = Tables<"audit_log">;
export type StudentFlagRow = Tables<"student_flags">;

export type Role = ProfileRow["role"];
export type AttendanceSource = AttendanceRow["source"];

/** attendance_window_state() */
export type WindowState = {
  is_open: boolean;
  now: string;
  service_date: string;
  timezone: string;
  service_dow: number;
  window_start: string; // "HH:MM"
  window_end: string; // "HH:MM"
  opens_at: string;
  closes_at: string;
  seconds_until_open: number;
  seconds_until_close: number | null;
};

/** get_classes() */
export type PublicClass = { id: string; name: string; description: string | null };
export type GetClassesResult = {
  church_name: string;
  window: WindowState;
  classes: PublicClass[];
};

/** search_students() */
export type StudentSearchResult = {
  id: string;
  full_name: string;
  already_marked_today: boolean;
};

type MarkedPayload = {
  student_id: string;
  full_name: string;
  class_id: string;
  class_name: string;
  service_date: string;
  marked_at: string;
};

export type DeviceLimitReached = {
  status: "device_limit_reached";
  limit: number;
  student_id: string | null;
  full_name: string;
  class_id: string;
  class_name: string;
};

/** mark_attendance() */
export type MarkAttendanceResult =
  | ({ status: "marked" } & MarkedPayload)
  | ({ status: "already_marked" } & MarkedPayload)
  | DeviceLimitReached;

export type DuplicateMatch = StudentSearchResult & { score: number };

/** add_student() */
export type AddStudentResult =
  | ({ status: "created" } & MarkedPayload)
  | { status: "possible_duplicate"; exact_match: boolean; matches: DuplicateMatch[] }
  | DeviceLimitReached;

/** merge_students() */
export type MergeStudentsResult = {
  status: "merged";
  kept_id: string;
  removed_id: string;
  attendance_moved: number;
  attendance_dropped_as_duplicate_days: number;
};

/** hit_rate_limit() */
export type RateLimitResult = {
  allowed: boolean;
  hits: number;
  limit: number;
  reset_at: string;
};

/** SQLSTATEs raised by the student RPCs. */
export const RPC_ERROR_CODES = {
  AW001: "WINDOW_CLOSED",
  AW002: "CLASS_NOT_FOUND",
  AW003: "STUDENT_NOT_FOUND",
  AW004: "INVALID_INPUT",
  AW005: "NAME_UNAVAILABLE",
} as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[keyof typeof RPC_ERROR_CODES];
