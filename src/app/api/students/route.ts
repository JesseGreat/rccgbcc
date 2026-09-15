import { addStudent } from "@/lib/attendance/rpc";
import { apiError, hashDeviceId, isUuid, ok, rateLimited, readJson, rpcError } from "@/lib/http/api";
import { checkRateLimit } from "@/lib/http/rate-limit";

// POST /api/students  { classId, fullName, phone?, deviceId, force? }
// Creates the student and marks them present in one step, unless the database
// finds a likely duplicate (returns status "possible_duplicate" without inserting).
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || !isUuid(body.classId)) return apiError({ code: "CLASS_NOT_FOUND" });

  const { fullName, phone, force } = body;
  if (typeof fullName !== "string" || fullName.length > 200) {
    return apiError({ code: "INVALID_INPUT", detail: "full_name" });
  }
  if (phone != null && (typeof phone !== "string" || phone.length > 40)) {
    return apiError({ code: "INVALID_INPUT", detail: "phone" });
  }
  if (force != null && typeof force !== "boolean") {
    return apiError({ code: "INVALID_INPUT", detail: "force" });
  }

  const deviceHash = hashDeviceId(body.deviceId);
  if (!deviceHash) return apiError({ code: "INVALID_INPUT", detail: "deviceId" });

  const limit = await checkRateLimit("add", request);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const result = await addStudent({
    classId: body.classId,
    fullName,
    phone: typeof phone === "string" && phone.trim() ? phone : null,
    deviceHash,
    force: force === true,
  });
  return result.ok ? ok(result.data) : rpcError(result.error);
}
