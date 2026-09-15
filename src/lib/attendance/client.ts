// Browser-side helpers for the student flow: device id, the remembered
// "returning user", and a fetch wrapper that turns network failure into a
// first-class OFFLINE result instead of an exception.

import type { ApiError, ApiResponse } from "@/lib/attendance/api-types";

// ---------------------------------------------------------------------------
// Device id: random, per browser. The server hashes it before storing.
// ---------------------------------------------------------------------------
const DEVICE_KEY = "bcc.deviceId";
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
let memoryDeviceId: string | undefined;

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && DEVICE_ID_RE.test(existing)) return existing;
    const id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage blocked (some private modes): keep one id for this page load.
    memoryDeviceId ??= randomId();
    return memoryDeviceId;
  }
}

function randomId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes); // available on plain http too, unlike crypto.subtle
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Returning user shortcut
// ---------------------------------------------------------------------------
export type LastStudent = {
  classId: string;
  className: string;
  studentId: string;
  fullName: string;
  /** Service date ("YYYY-MM-DD") this phone last saw them marked present. */
  markedOn?: string;
  /** When that mark was made (ISO timestamp). */
  markedAt?: string;
};

const LAST_KEY = "bcc.lastStudent";
const listeners = new Set<() => void>();

export function subscribeLastStudent(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

/** Raw string snapshot (stable identity for useSyncExternalStore). */
export function readLastStudentRaw(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function parseLastStudent(raw: string | null): LastStudent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastStudent>;
    if (v && typeof v.classId === "string" && typeof v.studentId === "string" && typeof v.fullName === "string") {
      return {
        classId: v.classId,
        studentId: v.studentId,
        fullName: v.fullName,
        className: v.className ?? "",
        ...(typeof v.markedOn === "string" ? { markedOn: v.markedOn } : {}),
        ...(typeof v.markedAt === "string" ? { markedAt: v.markedAt } : {}),
      };
    }
  } catch {
    // corrupted value; treat as absent
  }
  return null;
}

export function saveLastStudent(value: LastStudent): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable; the shortcut just won't appear
  }
  listeners.forEach((l) => l());
}

export function clearLastStudent(): void {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
export type ClientError = ApiError | { code: "OFFLINE" };
export type ClientResult<T> = { ok: true; data: T } | { ok: false; error: ClientError };

const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  url: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<ClientResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, error: { code: "OFFLINE" } };
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal =
    init.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, timeout]) : (init.signal ?? timeout);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    // A caller-initiated abort propagates; a timeout or network failure is "offline".
    if (init.signal?.aborted) throw error;
    return { ok: false, error: { code: "OFFLINE" } };
  }

  try {
    const body = (await response.json()) as ApiResponse<T>;
    if (body && typeof body.ok === "boolean") return body;
  } catch {
    // non-JSON (e.g. a proxy error page)
  }
  return { ok: false, error: { code: "UNAVAILABLE" } };
}
