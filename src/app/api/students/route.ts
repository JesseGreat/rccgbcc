import { addStudent } from "@/lib/attendance/rpc";
import { isAgeGroup, isSex } from "@/lib/forms/labels";
import { apiError, hashDeviceId, isUuid, ok, rateLimited, readJson, rpcError } from "@/lib/http/api";
import { checkRateLimit } from "@/lib/http/rate-limit";

// POST /api/students  { classId, fullName, phone, gender, ageGroup, deviceId, force? }
// The Students Registration Form. Creates the student and marks them present
// in one step, unless the database finds a likely duplicate (returns status
// "possible_duplicate" without inserting).
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || !isUuid(body.classId)) return apiError({ code: "CLASS_NOT_FOUND" });

  const { fullName, phone, gender, ageGroup, force } = body;
  if (typeof fullName !== "string" || fullName.length > 200) {
    return apiError({ code: "INVALID_INPUT", detail: "full_name" });
  }
  if (typeof phone !== "string" || !phone.trim() || phone.length > 40) {
    return apiError({ code: "INVALID_INPUT", detail: "phone" });
  }
  if (!isSex(gender)) return apiError({ code: "INVALID_INPUT", detail: "gender" });
  if (!isAgeGroup(ageGroup)) return apiError({ code: "INVALID_INPUT", detail: "age_group" });
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
    phone,
    gender,
    ageGroup,
    deviceHash,
    force: force === true,
  });
  return result.ok ? ok(result.data) : rpcError(result.error);
}
