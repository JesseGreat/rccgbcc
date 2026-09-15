import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { exportFilename, type ExportMeta } from "@/lib/reports/export-meta";
import { buildAttendanceMatrix } from "@/lib/reports/matrix";
import { buildAttendancePdf } from "@/lib/reports/pdf";
import { buildAttendanceWorkbook } from "@/lib/reports/xlsx";

const meta: ExportMeta = {
  churchName: "RCCG Bethel Christian Center",
  scopeLabel: "Young Adults",
  multiClass: false,
  from: "2026-06-01",
  to: "2026-09-14",
  generatedOn: "2026-09-14",
  serviceDayName: "Sunday",
};

const matrix = buildAttendanceMatrix({
  from: meta.from,
  to: meta.to,
  today: "2026-09-14",
  serviceDow: 0,
  students: [
    { id: "a", fullName: "Adaeze Nnamdi", isActive: true, createdDate: "2026-01-01" },
    { id: "b", fullName: "Tobi Fashola", isActive: true, createdDate: "2026-07-01" },
  ],
  marks: [
    { studentId: "a", serviceDate: "2026-06-07" },
    { studentId: "a", serviceDate: "2026-09-13" },
    { studentId: "b", serviceDate: "2026-07-05" },
  ],
});

describe("export filenames", () => {
  it("follows RCCG-Bethel-{ClassName}-{start}-to-{end}", () => {
    expect(exportFilename(meta, "xlsx")).toBe("RCCG-Bethel-Young-Adults-2026-06-01-to-2026-09-14.xlsx");
    expect(exportFilename({ ...meta, scopeLabel: "Men & Women (Adults)" }, "pdf")).toBe(
      "RCCG-Bethel-Men-Women-Adults-2026-06-01-to-2026-09-14.pdf",
    );
  });
});

describe("Excel export", () => {
  it("has a frozen, styled matrix sheet and a summary sheet", async () => {
    const wb = new ExcelJS.Workbook();
    const file = await buildAttendanceWorkbook(matrix, meta);
    await wb.xlsx.load(file as unknown as ExcelJS.Buffer);

    const sheet = wb.getWorksheet("Attendance");
    const summary = wb.getWorksheet("Summary");
    expect(sheet).toBeDefined();
    expect(summary).toBeDefined();

    expect(sheet!.views[0]).toMatchObject({ state: "frozen", ySplit: 3, xSplit: 1 });
    expect(sheet!.getCell(3, 1).value).toBe("Student");
    expect(sheet!.getCell(3, 1).font?.bold).toBe(true);
    expect(sheet!.getRow(4).getCell(1).value).toBe("Adaeze Nnamdi");

    expect(summary!.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(summary!.getRow(1).values).toEqual([undefined, "Name", "Times present", "Total Sundays", "Percentage"]);
    const adaeze = summary!.getRow(2);
    expect(adaeze.getCell(2).value).toBe(2);
    expect(adaeze.getCell(3).value).toBe(matrix.rows[0].possibleCount);
    expect(adaeze.getCell(4).numFmt).toBe("0%");
  });
});

describe("PDF export", () => {
  it("produces a landscape PDF for a wide range", () => {
    const pdf = buildAttendancePdf(matrix, meta);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    // A4 landscape MediaBox, since the range has more than 10 Sundays.
    expect(text).toMatch(/\/MediaBox \[0 0 841\.8\d* 595\.2\d*\]/);
    expect(text).toContain("Page 1 of 1");
  });
});
