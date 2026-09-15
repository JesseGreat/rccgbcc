import type { NextRequest } from "next/server";

import { searchStudents } from "@/lib/attendance/rpc";
import { apiError, isUuid, ok, rateLimited, rpcError } from "@/lib/http/api";
import { checkRateLimit } from "@/lib/http/rate-limit";

// GET /api/classes/:classId/students?q=chidi
// At most 10 matches; fewer than 2 characters returns an empty list.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/classes/[classId]/students">) {
  const { classId } = await ctx.params;
  if (!isUuid(classId)) return apiError({ code: "CLASS_NOT_FOUND" });

  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);

  const limit = await checkRateLimit("search", request);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const result = await searchStudents(classId, query);
  return result.ok ? ok(result.data) : rpcError(result.error);
}
