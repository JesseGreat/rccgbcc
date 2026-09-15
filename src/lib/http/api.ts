import "server-only";

import { createHash } from "node:crypto";

import type { RpcFailure } from "@/lib/attendance/rpc";
import type { ApiError, ApiErrorCode } from "@/lib/attendance/api-types";

const NO_STORE = { "Cache-Control": "no-store" };

const STATUS: Record<ApiErrorCode, number> = {
  WINDOW_CLOSED: 403,
  CLASS_NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  INVALID_INPUT: 400,
  NAME_UNAVAILABLE: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
};

export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data }, { headers: NO_STORE });
}

export function apiError(error: ApiError, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(
    { ok: false, error },
    { status: STATUS[error.code], headers: { ...NO_STORE, ...extraHeaders } },
  );
}

export function rpcError(failure: RpcFailure): Response {
  return apiError({ code: failure.code, detail: failure.detail, window: failure.window });
}

export function rateLimited(retryAfterSeconds: number): Response {
  return apiError({ code: "RATE_LIMITED" }, { "Retry-After": String(retryAfterSeconds) });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * The browser keeps a random device id in localStorage. We never store it
 * raw: the database only sees a salted SHA-256 of it (base64url, 43 chars).
 */
export function hashDeviceId(deviceId: unknown): string | null {
  if (typeof deviceId !== "string" || !DEVICE_ID_RE.test(deviceId)) return null;
  const salt = process.env.DEVICE_HASH_SALT ?? "rccg-bethel-attendance";
  return createHash("sha256").update(`${salt}:${deviceId}`).digest("base64url");
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
