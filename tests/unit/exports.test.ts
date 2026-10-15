import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { exportFilename, registrationFilename, teachersFilename, type ExportMeta } from "@/lib/reports/export-meta";
import type { RegistrationRow, TeacherFormRow } from "@/lib/reports/forms";
import { buildAttendanceMatrix } from "@/lib/reports/matrix";
import { buildAttendancePdf, buildRegistrationPdf, buildTeachersPdf } from "@/lib/reports/pdf";
import { buildAttendanceWorkbook, buildRegistrationWorkbook, buildTeachersWorkbook } from "@/lib/reports/xlsx";

const meta: ExportMeta = {
  churchName: "RCCG Bethel Christian Center",
  scopeLabel: "Young Adults",
  multiClass: false,
  from: "2026-06-01",
  to: "2026-09-14",
  generatedOn: "2026-09-14",
  serviceDayName: "Sunday",
  serviceDow: 0,
};

const matrix = buildAttendanceMatrix({
  from: meta.from,
  to: meta.to,
  today: "2026-09-14",
  serviceDow: 0,
  students: [
    { id: "a", fullName: "Adaeze Nnamdi", isActive: true, createdDate: "2026-01-01", gender: "female" },
    { id: "b", fullName: "Tobi Fashola", isActive: true, createdDate: "2026-07-01", gender: "male" },
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

  it("names the registration and teachers' forms", () => {
    expect(registrationFilename(meta, "xlsx")).toBe("RCCG-Bethel-Young-Adults-Registration-Form.xlsx");
    expect(teachersFilename(meta, "pdf")).toBe("RCCG-Bethel-Young-Adults-Teachers-Form-2026-06-01-to-2026-09-14.pdf");
  });
});

describe("Excel export", () => {
  it("lays the register out as months across with weeks under, plus a summary sheet", async () => {
    const wb = new ExcelJS.Workbook();
    const file = await buildAttendanceWorkbook(matrix, meta);
    await wb.xlsx.load(file as unknown as ExcelJS.Buffer);

    const sheet = wb.getWorksheet("Register");
    const summary = wb.getWorksheet("Summary");
    expect(sheet).toBeDefined();
    expect(summary).toBeDefined();

    expect(sheet!.getCell("A2").value).toBe("Sunday School Class Attendance Register");
    expect(sheet!.views[0]).toMatchObject({ state: "frozen", ySplit: 5, xSplit: 2 });
    expect(sheet!.getCell(4, 1).value).toBe("Name of member");
    expect(sheet!.getCell(4, 1).font?.bold).toBe(true);
    expect(sheet!.getCell(4, 2).value).toBe("Sex");
    // First Sunday in range is 7 June 2026: June spans Wk1-Wk4.
    expect(sheet!.getCell(4, 3).value).toBe("June 2026");
    expect(sheet!.getCell(5, 3).value).toBe("Wk1\n7");
    expect(sheet!.getCell(5, 6).value).toBe("Wk4\n28");
    expect(sheet!.getCell(4, 7).value).toBe("July 2026");
    expect(sheet!.getRow(6).getCell(1).value).toBe("Adaeze Nnamdi");
    expect(sheet!.getRow(6).getCell(2).value).toBe("F");
    expect(sheet!.getRow(6).getCell(3).value).toBe("✓");

    expect(summary!.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(summary!.getRow(1).values).toEqual([undefined, "Name", "Sex", "Times present", "Total Sundays", "Percentage"]);
    const adaeze = summary!.getRow(2);
    expect(adaeze.getCell(3).value).toBe(2);
    expect(adaeze.getCell(4).value).toBe(matrix.rows[0].possibleCount);
    expect(adaeze.getCell(5).numFmt).toBe("0%");
  });

  it("builds the registration form with every remark dated", async () => {
    const rows: RegistrationRow[] = [
      {
        id: "a",
        fullName: "Adaeze Nnamdi",
        className: "Young Adults",
        ageGroup: "young_adult",
        gender: "female",
        phone: "0803 123 4567",
        entryDate: "2026-01-11",
        remarks: [
          { date: "2026-09-06", remark: "Very attentive" },
          { date: "2026-09-13", remark: "Led the prayer" },
        ],
      },
    ];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildRegistrationWorkbook(rows, meta)) as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("Registration")!;
    expect(sheet.getCell("A2").value).toBe("Sunday School Students Registration Form");
    expect(sheet.getRow(4).values).toEqual([
      undefined,
      "S/N",
      "Name of student",
      "Age",
      "Sex",
      "Telephone number",
      "Entry date",
      "Teacher's remarks",
    ]);
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      1,
      "Adaeze Nnamdi",
      "Young Adult",
      "Female",
      "0803 123 4567",
      "11 Jan 2026",
      "6 Sep 2026: Very attentive\n13 Sep 2026: Led the prayer",
    ]);
  });

  it("builds the teachers' form with present and absent rows", async () => {
    const rows: TeacherFormRow[] = [
      {
        date: "2026-09-13",
        profileId: "t1",
        name: "Bisi Ade",
        title: "teacher",
        className: "Young Adults",
        present: true,
        markedAt: "2026-09-13T07:05:00Z",
        topic: "The Prodigal Son",
        remarks: null,
      },
      {
        date: "2026-09-13",
        profileId: "t2",
        name: "Kunle Ojo",
        title: "assistant_teacher",
        className: "Young Adults",
        present: false,
        markedAt: null,
        topic: null,
        remarks: null,
      },
    ];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTeachersWorkbook(rows, meta, "Africa/Lagos")) as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("Teachers")!;
    expect(sheet.getCell("A2").value).toBe("Sunday School Teachers and Assistant Teachers Form");
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      "13 Sep 2026",
      "Bisi Ade",
      "Teacher",
      "Present",
      "8:05 AM",
      "The Prodigal Son",
      "",
    ]);
    expect(sheet.getRow(6).getCell(3).value).toBe("Assistant Teacher");
    expect(sheet.getRow(6).getCell(4).value).toBe("Absent");

    const pdf = buildTeachersPdf(rows, meta, "Africa/Lagos").toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    const reg = buildRegistrationPdf([], meta).toString("latin1");
    expect(reg).toContain("Page 1 of 1");
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
