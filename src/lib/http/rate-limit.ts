import "server-only";

import type { RateLimitResult } from "@/lib/db/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RateLimitBucket = "search" | "mark" | "add";

// Generous: a church WiFi or carrier NAT can put a whole hall behind one IP.
const DEFAULT_MAX: Record<RateLimitBucket, number> = { search: 600, mark: 200, add: 60 };
const ENV_MAX: Record<RateLimitBucket, string> = {
  search: "RATE_LIMIT_SEARCH_MAX",
  mark: "RATE_LIMIT_MARK_MAX",
  add: "RATE_LIMIT_ADD_MAX",
};

/**
 * Best client IP we can get. On Vercel `x-forwarded-for` is set by the edge
 * and its first entry is the real client address.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed-window per-IP limit backed by Postgres (in-memory counters don't
 * survive serverless). Fails open: a counter outage must not stop a hall full
 * of people marking attendance, and the database still enforces every real rule.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  request: Request,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const max = positiveInt(process.env[ENV_MAX[bucket]], DEFAULT_MAX[bucket]);
  const windowSeconds = positiveInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60);
  const key = `${bucket}:${getClientIp(request)}`;

  const { data, error } = await getSupabaseAdmin().rpc("hit_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] counter unavailable, allowing request", error.message);
    return { allowed: true };
  }

  const result = data as unknown as RateLimitResult;
  if (result.allowed) return { allowed: true };
  const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(result.reset_at) - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
