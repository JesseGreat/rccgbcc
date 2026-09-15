import { markAttendance } from "@/lib/attendance/rpc";
import { apiError, hashDeviceId, isUuid, ok, rateLimited, readJson, rpcError } from "@/lib/http/api";
import { checkRateLimit } from "@/lib/http/rate-limit";

// POST /api/attendance  { studentId, deviceId }
// Returns { status: "marked" | "already_marked" | "device_limit_reached", ... }.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || !isUuid(body.studentId)) return apiError({ code: "INVALID_INPUT", detail: "studentId" });

  const deviceHash = hashDeviceId(body.deviceId);
  if (!deviceHash) return apiError({ code: "INVALID_INPUT", detail: "deviceId" });

  const limit = await checkRateLimit("mark", request);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const result = await markAttendance(body.studentId, deviceHash);
  return result.ok ? ok(result.data) : rpcError(result.error);
}
