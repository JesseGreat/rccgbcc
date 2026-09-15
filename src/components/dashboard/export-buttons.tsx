import { FileSpreadsheet, FileText } from "lucide-react";

import type { DateRange } from "@/lib/reports/load";

/** Plain download links for the range on screen. `classId` scopes admin exports. */
export function ExportButtons({ range, classId }: { range: DateRange; classId?: string }) {
  const query = new URLSearchParams({ from: range.from, to: range.to, ...(classId ? { classId } : {}) }).toString();
  const base = "flex h-12 items-center gap-2 rounded-xl border-2 bg-card px-4 text-base font-bold active:bg-muted";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/export/xlsx?${query}`} download className={base}>
        <FileSpreadsheet className="size-5 text-success" aria-hidden />
        Download Excel
      </a>
      <a href={`/api/export/pdf?${query}`} download className={base}>
        <FileText className="size-5 text-primary" aria-hidden />
        Download PDF
      </a>
    </div>
  );
}
