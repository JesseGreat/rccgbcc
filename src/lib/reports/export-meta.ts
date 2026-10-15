import { formatMediumDate } from "@/lib/attendance/dates";

export type ExportMeta = {
  churchName: string;
  /** Class name, or "All Classes". */
  scopeLabel: string;
  /** True when rows span several classes (adds a Class column). */
  multiClass: boolean;
  from: string;
  to: string;
  /** Lagos date the export was generated. */
  generatedOn: string;
  /** "Sunday" etc., used for the "Total Sundays" wording. */
  serviceDayName: string;
  /** 0 = Sunday; decides which dates are numbered Wk1-Wk5 on the register. */
  serviceDow: number;
};

function slug(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Class"
  );
}

/** Attendance register: RCCG-Bethel-{ClassName}-{startDate}-to-{endDate}.{ext} */
export function exportFilename(meta: Pick<ExportMeta, "scopeLabel" | "from" | "to">, ext: "xlsx" | "pdf"): string {
  return `RCCG-Bethel-${slug(meta.scopeLabel)}-${meta.from}-to-${meta.to}.${ext}`;
}

/** Registration form: RCCG-Bethel-{ClassName}-Registration-Form.{ext} */
export function registrationFilename(meta: Pick<ExportMeta, "scopeLabel">, ext: "xlsx" | "pdf"): string {
  return `RCCG-Bethel-${slug(meta.scopeLabel)}-Registration-Form.${ext}`;
}

/** Teachers' form: RCCG-Bethel-{ClassName}-Teachers-Form-{startDate}-to-{endDate}.{ext} */
export function teachersFilename(meta: Pick<ExportMeta, "scopeLabel" | "from" | "to">, ext: "xlsx" | "pdf"): string {
  return `RCCG-Bethel-${slug(meta.scopeLabel)}-Teachers-Form-${meta.from}-to-${meta.to}.${ext}`;
}

export function rangeLabel(meta: Pick<ExportMeta, "from" | "to">): string {
  return `${formatMediumDate(meta.from)} to ${formatMediumDate(meta.to)}`;
}
