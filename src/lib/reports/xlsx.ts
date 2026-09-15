import "server-only";

import ExcelJS from "exceljs";

import { formatMediumDate, formatShortDate } from "@/lib/attendance/dates";

import { rangeLabel, type ExportMeta } from "./export-meta";
import type { AttendanceMatrix } from "./matrix";

const NAVY = "FF1B3A6B";
const WHITE = "FFFFFFFF";
const GREEN = "FF1D7A46";
const GREEN_SOFT = "FFE5F3EA";
const GREY_SOFT = "FFEEEEF3";
const BORDER = "FFD2D3DC";

const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE } };
const thinBorder: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: BORDER } } };

/**
 * Sheet 1 "Attendance": students × service days, ✓ for present.
 * Sheet 2 "Summary": times present, total Sundays, percentage.
 * Header rows are frozen and styled on both.
 */
export async function buildAttendanceWorkbook(matrix: AttendanceMatrix, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.churchName;
  wb.created = new Date();
  wb.title = `${meta.scopeLabel} attendance ${meta.from} to ${meta.to}`;

  const dayPlural = `${meta.serviceDayName}s`;
  const lead = meta.multiClass ? ["Student", "Class"] : ["Student"];

  // ---------------------------------------------------------------------------
  // Sheet 1: matrix
  // ---------------------------------------------------------------------------
  const ws = wb.addWorksheet("Attendance", {
    pageSetup: { orientation: matrix.dates.length > 10 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: "&LGenerated &D&RPage &P of &N" },
  });

  ws.getCell("A1").value = `${meta.churchName} · ${meta.scopeLabel}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell("A2").value = `Sunday School attendance, ${rangeLabel(meta)} · generated ${formatMediumDate(meta.generatedOn)}`;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF5F6168" } };

  const HEADER_ROW = 3;
  const header = ws.getRow(HEADER_ROW);
  header.values = [...lead, ...matrix.dates.map(formatShortDate), "Present", `Total ${dayPlural}`, "%"];
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getCell(HEADER_ROW, 1).alignment = { vertical: "middle", horizontal: "left" };

  const firstDateCol = lead.length + 1;
  const presentCol = firstDateCol + matrix.dates.length;

  ws.getColumn(1).width = 30;
  if (meta.multiClass) ws.getColumn(2).width = 16;
  for (let i = 0; i < matrix.dates.length; i++) ws.getColumn(firstDateCol + i).width = 7.5;
  ws.getColumn(presentCol).width = 9;
  ws.getColumn(presentCol + 1).width = 14;
  ws.getColumn(presentCol + 2).width = 8;

  matrix.rows.forEach((row, r) => {
    const excelRow = ws.getRow(HEADER_ROW + 1 + r);
    const name = row.isActive ? row.fullName : `${row.fullName} (inactive)`;
    excelRow.values = [
      ...(meta.multiClass ? [name, row.className ?? ""] : [name]),
      ...row.cells.map((c) => (c === "present" ? "✓" : "")),
      row.presentCount,
      row.possibleCount,
      row.percentage === null ? null : row.percentage / 100,
    ];
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

  const totalsRow = ws.getRow(HEADER_ROW + 1 + matrix.rows.length);
  totalsRow.values = [...(meta.multiClass ? ["Present", ""] : ["Present"]), ...matrix.totals];
  totalsRow.font = { bold: true };
  totalsRow.eachCell((cell, col) => {
    cell.border = { top: { style: "thin", color: { argb: NAVY } } };
    if (col >= firstDateCol) cell.alignment = { horizontal: "center" };
  });

  ws.views = [{ state: "frozen", xSplit: lead.length, ySplit: HEADER_ROW, topLeftCell: `${ws.getColumn(lead.length + 1).letter}${HEADER_ROW + 1}` }];
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: lead.length } };

  // ---------------------------------------------------------------------------
  // Sheet 2: summary
  // ---------------------------------------------------------------------------
  const summary = wb.addWorksheet("Summary", {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summary.columns = [
    { header: "Name", key: "name", width: 32 },
    ...(meta.multiClass ? [{ header: "Class", key: "className", width: 18 }] : []),
    { header: "Times present", key: "present", width: 15 },
    { header: `Total ${dayPlural}`, key: "possible", width: 16 },
    { header: "Percentage", key: "percentage", width: 13, style: { numFmt: "0%" } },
  ];
  summary.getRow(1).height = 22;
  summary.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle" };
  });
  for (const row of matrix.rows) {
    summary.addRow({
      name: row.isActive ? row.fullName : `${row.fullName} (inactive)`,
      className: row.className ?? "",
      present: row.presentCount,
      possible: row.possibleCount,
      percentage: row.percentage === null ? null : row.percentage / 100,
    });
  }
  summary.views = [{ state: "frozen", ySplit: 1 }];
  summary.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: summary.columnCount } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
