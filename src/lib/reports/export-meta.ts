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
};

/** RCCG-Bethel-{ClassName}-{startDate}-to-{endDate}.{ext} */
export function exportFilename(meta: Pick<ExportMeta, "scopeLabel" | "from" | "to">, ext: "xlsx" | "pdf"): string {
  const slug =
    meta.scopeLabel
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Class";
  return `RCCG-Bethel-${slug}-${meta.from}-to-${meta.to}.${ext}`;
}

export function rangeLabel(meta: Pick<ExportMeta, "from" | "to">): string {
  return `${formatMediumDate(meta.from)} to ${formatMediumDate(meta.to)}`;
}
