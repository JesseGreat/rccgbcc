// Wire format shared by the student API routes and the browser.

import type { RpcErrorCode, WindowState } from "@/lib/db/types";

export type ApiErrorCode = RpcErrorCode | "RATE_LIMITED" | "UNAVAILABLE";

export type ApiError = {
  code: ApiErrorCode;
  detail?: string;
  window?: WindowState;
};

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
