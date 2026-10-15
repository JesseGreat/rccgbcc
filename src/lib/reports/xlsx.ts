import "server-only";

import ExcelJS from "exceljs";

import { formatMediumDate } from "@/lib/attendance/dates";
import { formatTime } from "@/lib/attendance/format";
import {
  ageGroupLabel,
  REGISTER_TITLE,
  REGISTRATION_FORM_TITLE,
  sexLabel,
  sexShort,
  staffTitleLabel,
  TEACHERS_FORM_TITLE,
} from "@/lib/forms/labels";

import { rangeLabel, type ExportMeta } from "./export-meta";
import type { RegistrationRow, TeacherFormRow } from "./forms";
import type { AttendanceMatrix } from "./matrix";
import { registerMonths } from "./register";

const NAVY = "FF1B3A6B";
const NAVY_SOFT = "FFDCE3EF";
const WHITE = "FFFFFFFF";
const GREEN = "FF1D7A46";
const GREEN_SOFT = "FFE5F3EA";
const GREY_SOFT = "FFEEEEF3";
const MUTED = "FF5F6168";
const BORDER = "FFD2D3DC";

const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const subHeaderFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE } };
const thinBorder: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: BORDER } } };

/** Rows 1-2: church/class and form title. Returns nothing; headers start at row 4. */
function titleRows(ws: ExcelJS.Worksheet, meta: ExportMeta, title: string, subtitle: string) {
  ws.getCell("A1").value = `${meta.churchName} · ${meta.scopeLabel}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell("A2").value = title;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `${subtitle} · generated ${formatMediumDate(meta.generatedOn)}`;
  ws.getCell("A3").font = { size: 10, color: { argb: MUTED } };
}

function styleHeader(row: ExcelJS.Row, fill = headerFill, font = headerFont) {
  row.eachCell((cell) => {
    cell.fill = fill;
    cell.font = font;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ===========================================================================
// Sunday School Class Attendance Register
// ===========================================================================

/**
 * Sheet 1 "Register": Name of member, Sex, then months across with Wk1-Wk5
 * under each, ✓ for present. Sheet 2 "Summary": times present, total
 * Sundays, percentage. Header rows are frozen and styled on both.
 */
export async function buildAttendanceWorkbook(matrix: AttendanceMatrix, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.churchName;
  wb.created = new Date();
  wb.title = `${meta.scopeLabel} ${REGISTER_TITLE} ${meta.from} to ${meta.to}`;

  const dayPlural = `${meta.serviceDayName}s`;
  const lead = meta.multiClass ? ["Name of member", "Class", "Sex"] : ["Name of member", "Sex"];
  const months = registerMonths(matrix.dates, meta.serviceDow);

  const ws = wb.addWorksheet("Register", {
    pageSetup: { orientation: matrix.dates.length > 10 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&LGenerated &D&RPage &P of &N" },
  });
  titleRows(ws, meta, REGISTER_TITLE, rangeLabel(meta));

  const MONTH_ROW = 4;
  const WEEK_ROW = 5;
  const firstDateCol = lead.length + 1;
  const presentCol = firstDateCol + matrix.dates.length;
  const tail = ["Present", `Total ${dayPlural}`, "%"];

  // Two header rows: lead and tail cells span both; each month spans its weeks.
  const monthRow = ws.getRow(MONTH_ROW);
  const weekRow = ws.getRow(WEEK_ROW);
  lead.forEach((label, i) => {
    monthRow.getCell(i + 1).value = label;
    ws.mergeCells(MONTH_ROW, i + 1, WEEK_ROW, i + 1);
  });
  let col = firstDateCol;
  for (const m of months) {
    monthRow.getCell(col).value = m.label;
    if (m.columns.length > 1) ws.mergeCells(MONTH_ROW, col, MONTH_ROW, col + m.columns.length - 1);
    for (const c of m.columns) {
      weekRow.getCell(col).value = `${c.label}\n${c.day}`;
      col++;
    }
  }
  tail.forEach((label, i) => {
    monthRow.getCell(presentCol + i).value = label;
    ws.mergeCells(MONTH_ROW, presentCol + i, WEEK_ROW, presentCol + i);
  });
  monthRow.height = 20;
  weekRow.height = 28;
  styleHeader(monthRow);
  styleHeader(weekRow, subHeaderFill, { bold: true, color: { argb: NAVY } });
  ws.getCell(MONTH_ROW, 1).alignment = { vertical: "middle", horizontal: "left" };

  ws.getColumn(1).width = 30;
  if (meta.multiClass) ws.getColumn(2).width = 16;
  ws.getColumn(lead.length).width = 6;
  for (let i = 0; i < matrix.dates.length; i++) ws.getColumn(firstDateCol + i).width = 6.5;
  ws.getColumn(presentCol).width = 9;
  ws.getColumn(presentCol + 1).width = 14;
  ws.getColumn(presentCol + 2).width = 8;

  matrix.rows.forEach((row, r) => {
    const excelRow = ws.getRow(WEEK_ROW + 1 + r);
    const name = row.isActive ? row.fullName : `${row.fullName} (inactive)`;
    excelRow.values = [
      ...(meta.multiClass ? [name, row.className ?? "", sexShort(row.gender)] : [name, sexShort(row.gender)]),
      ...row.cells.map((c) => (c === "present" ? "✓" : "")),
      row.presentCount,
      row.possibleCount,
      row.percentage === null ? null : row.percentage / 100,
    ];
    excelRow.getCell(lead.length).alignment = { horizontal: "center" };
    row.cells.forEach((c, i) => {
      const cell = excelRow.getCell(firstDateCol + i);
      cell.alignment = { horizontal: "center" };
      if (c === "present") {
        cell.font = { bold: true, color: { argb: GREEN } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SOFT } };
      } else if (c === "not_yet") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY_SOFT } };
      }
    });
    excelRow.getCell(presentCol + 2).numFmt = "0%";
    excelRow.eachCell({ includeEmpty: true }, (cell) => (cell.border = thinBorder));
  });

  const totalsRow = ws.getRow(WEEK_ROW + 1 + matrix.rows.length);
  totalsRow.values = [...lead.map((_, i) => (i === 0 ? "Present" : "")), ...matrix.totals];
  totalsRow.font = { bold: true };
  totalsRow.eachCell((cell, c) => {
    cell.border = { top: { style: "thin", color: { argb: NAVY } } };
    if (c >= firstDateCol) cell.alignment = { horizontal: "center" };
  });

  ws.views = [
    {
      state: "frozen",
      xSplit: lead.length,
      ySplit: WEEK_ROW,
      topLeftCell: `${ws.getColumn(lead.length + 1).letter}${WEEK_ROW + 1}`,
    },
  ];

  // Summary sheet.
  const summary = wb.addWorksheet("Summary", {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [
    { header: "Name", key: "name", width: 32 },
    ...(meta.multiClass ? [{ header: "Class", key: "className", width: 18 }] : []),
    { header: "Sex", key: "sex", width: 8 },
    { header: "Times present", key: "present", width: 15 },
    { header: `Total ${dayPlural}`, key: "possible", width: 16 },
    { header: "Percentage", key: "percentage", width: 13, style: { numFmt: "0%" } },
  ];
  summary.getRow(1).height = 22;
  styleHeader(summary.getRow(1));
  for (const row of matrix.rows) {
    summary.addRow({
      name: row.isActive ? row.fullName : `${row.fullName} (inactive)`,
      className: row.className ?? "",
      sex: sexShort(row.gender),
      present: row.presentCount,
      possible: row.possibleCount,
      percentage: row.percentage === null ? null : row.percentage / 100,
    });
  }
  summary.views = [{ state: "frozen", ySplit: 1 }];
  summary.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: summary.columnCount } };

  return toBuffer(wb);
}

// ===========================================================================
// Sunday School Students Registration Form
// ===========================================================================

export function remarksText(remarks: { date: string; remark: string }[]): string {
  return remarks.map((m) => `${formatMediumDate(m.date)}: ${m.remark}`).join("\n");
}

export async function buildRegistrationWorkbook(rows: RegistrationRow[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.churchName;
  wb.created = new Date();
  wb.title = `${meta.scopeLabel} ${REGISTRATION_FORM_TITLE}`;

  const ws = wb.addWorksheet("Registration", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&LGenerated &D&RPage &P of &N" },
  });
  titleRows(ws, meta, REGISTRATION_FORM_TITLE, `${rows.length} ${rows.length === 1 ? "student" : "students"}`);

  const HEADER_ROW = 4;
  const headers = [
    "S/N",
    "Name of student",
    ...(meta.multiClass ? ["Class"] : []),
    "Age",
    "Sex",
    "Telephone number",
    "Entry date",
    "Teacher's remarks",
  ];
  const widths = [6, 30, ...(meta.multiClass ? [16] : []), 13, 9, 18, 14, 60];
  const header = ws.getRow(HEADER_ROW);
  header.values = headers;
  header.height = 22;
  styleHeader(header);
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  rows.forEach((r, i) => {
    const excelRow = ws.getRow(HEADER_ROW + 1 + i);
    excelRow.values = [
      i + 1,
      r.fullName,
      ...(meta.multiClass ? [r.className] : []),
      ageGroupLabel(r.ageGroup),
      sexLabel(r.gender),
      r.phone ?? "",
      r.entryDate ? formatMediumDate(r.entryDate) : "",
      remarksText(r.remarks),
    ];
    excelRow.alignment = { vertical: "top", wrapText: true };
    excelRow.getCell(1).alignment = { vertical: "top", horizontal: "right" };
    excelRow.eachCell({ includeEmpty: true }, (cell) => (cell.border = thinBorder));
  });

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: HEADER_ROW }];
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };
  return toBuffer(wb);
}

// ===========================================================================
// Sunday School Teachers and Assistant Teachers Form
// ===========================================================================

export async function buildTeachersWorkbook(rows: TeacherFormRow[], meta: ExportMeta, timeZone: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.churchName;
  wb.created = new Date();
  wb.title = `${meta.scopeLabel} ${TEACHERS_FORM_TITLE} ${meta.from} to ${meta.to}`;

  const ws = wb.addWorksheet("Teachers", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&LGenerated &D&RPage &P of &N" },
  });
  titleRows(ws, meta, TEACHERS_FORM_TITLE, rangeLabel(meta));

  const HEADER_ROW = 4;
  const headers = ["Date", "Name", "Title", ...(meta.multiClass ? ["Class"] : []), "Attendance", "Time", "Topic taught", "Remarks"];
  const widths = [14, 28, 18, ...(meta.multiClass ? [16] : []), 12, 10, 36, 44];
  const header = ws.getRow(HEADER_ROW);
  header.values = headers;
  header.height = 22;
  styleHeader(header);
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const statusCol = meta.multiClass ? 5 : 4;

  rows.forEach((r, i) => {
    const excelRow = ws.getRow(HEADER_ROW + 1 + i);
    excelRow.values = [
      formatMediumDate(r.date),
      r.name,
      staffTitleLabel(r.title),
      ...(meta.multiClass ? [r.className] : []),
      r.present ? "Present" : "Absent",
      r.markedAt ? formatTime(r.markedAt, timeZone) : "",
      r.topic ?? "",
      r.remarks ?? "",
    ];
    excelRow.alignment = { vertical: "top", wrapText: true };
    const status = excelRow.getCell(statusCol);
    status.font = r.present ? { bold: true, color: { argb: GREEN } } : { color: { argb: MUTED } };
    if (r.present) status.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SOFT } };
    excelRow.eachCell({ includeEmpty: true }, (cell) => (cell.border = thinBorder));
  });

  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };
  return toBuffer(wb);
}
