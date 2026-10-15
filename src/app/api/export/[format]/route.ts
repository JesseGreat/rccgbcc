import type { NextRequest } from "next/server";

import { getStaffSession } from "@/lib/auth/session";
import { DAY_NAMES } from "@/lib/attendance/format";
import { exportFilename, registrationFilename, teachersFilename, type ExportMeta } from "@/lib/reports/export-meta";
import { loadRegistration, loadTeachersForm } from "@/lib/reports/forms";
import { loadAttendanceMatrix, loadSettings, parseRange } from "@/lib/reports/load";
import { buildAttendancePdf, buildRegistrationPdf, buildTeachersPdf } from "@/lib/reports/pdf";
import { buildAttendanceWorkbook, buildRegistrationWorkbook, buildTeachersWorkbook } from "@/lib/reports/xlsx";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TYPE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

function problem(status: number, message: string) {
  return Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

// GET /api/export/xlsx?form=register|registration|teachers&from=YYYY-MM-DD&to=YYYY-MM-DD[&classId=uuid]
// GET /api/export/pdf?...
//   register      Sunday School Class Attendance Register (default)
//   registration  Sunday School Students Registration Form (no date range)
//   teachers      Sunday School Teachers and Assistant Teachers Form (super admin only)
// Teachers always get their own class. Super admins get ?classId, or every class when it's omitted.
// All reads use the signed-in user's session, so RLS bounds what can be exported.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[format]">) {
  const { format } = await ctx.params;
  if (format !== "xlsx" && format !== "pdf") return problem(404, "Unknown export format.");

  const session = await getStaffSession();
  if (!session) return problem(401, "Please sign in again.");
  const { supabase, profile } = session;

  const params = request.nextUrl.searchParams;
  const formParam = params.get("form") ?? "register";
  if (formParam !== "register" && formParam !== "registration" && formParam !== "teachers") {
    return problem(404, "Unknown form.");
  }
  const form = formParam;
  if (form === "teachers" && profile.role !== "super_admin") {
    return problem(403, "Only the superintendent can download the teachers' form.");
  }
  const requestedClass = params.get("classId");

  let classIds: string[] | "all";
  let scopeLabel: string;
  if (profile.role === "teacher") {
    if (!profile.classId || !profile.className) return problem(403, "Your account isn't linked to a class.");
    if (requestedClass && requestedClass !== profile.classId) return problem(403, "You can only export your own class.");
    classIds = [profile.classId];
    scopeLabel = profile.className;
  } else if (requestedClass) {
    if (!UUID_RE.test(requestedClass)) return problem(400, "Invalid class.");
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", requestedClass).maybeSingle();
    if (!cls) return problem(404, "Class not found.");
    classIds = [cls.id];
    scopeLabel = cls.name;
  } else {
    classIds = "all";
    scopeLabel = "All Classes";
  }

  const { data: today, error: dateError } = await supabase.rpc("current_service_date");
  if (dateError || !today) return problem(503, "Couldn't reach the database. Try again.");

  const range = parseRange({ from: params.get("from"), to: params.get("to") }, today);

  try {
    const settings = await loadSettings(supabase);
    const meta: ExportMeta = {
      churchName: settings.church_name,
      scopeLabel,
      multiClass: classIds === "all",
      from: range.from,
      to: range.to,
      generatedOn: today,
      serviceDayName: DAY_NAMES[settings.service_dow],
      serviceDow: settings.service_dow,
    };

    let file: Buffer;
    let filename: string;
    let rowCount: number;
    if (form === "registration") {
      const rows = await loadRegistration(supabase, { classIds });
      file = format === "xlsx" ? await buildRegistrationWorkbook(rows, meta) : buildRegistrationPdf(rows, meta);
      filename = registrationFilename(meta, format);
      rowCount = rows.length;
    } else if (form === "teachers") {
      const { rows } = await loadTeachersForm(supabase, { classIds, range, today, serviceDow: settings.service_dow });
      file =
        format === "xlsx" ? await buildTeachersWorkbook(rows, meta, settings.timezone) : buildTeachersPdf(rows, meta, settings.timezone);
      filename = teachersFilename(meta, format);
      rowCount = rows.length;
    } else {
      const { matrix } = await loadAttendanceMatrix(supabase, { classIds, range, today });
      file = format === "xlsx" ? await buildAttendanceWorkbook(matrix, meta) : buildAttendancePdf(matrix, meta);
      filename = exportFilename(meta, format);
      rowCount = matrix.rows.length;
    }

    // Exports carry personal data; keep a record of who took one. Never block the download on it.
    void getSupabaseAdmin()
      .from("audit_log")
      .insert({
        actor_id: profile.id,
        action: `export.${format}`,
        entity: form === "teachers" ? "teacher_attendance" : form === "registration" ? "students" : "attendance",
        details: { form, scope: scopeLabel, class_ids: classIds, from: range.from, to: range.to, rows: rowCount },
      })
      .then(({ error }) => error && console.error("[export] audit insert failed", error.message));

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[export] failed", error);
    return problem(500, "The export couldn't be created. Please try again.");
  }
}
