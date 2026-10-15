import "server-only";

import { jsPDF } from "jspdf";
import { autoTable, type CellDef, type CellHookData, type RowInput } from "jspdf-autotable";

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
import type { AttendanceMatrix, MatrixCell } from "./matrix";
import { registerMonths } from "./register";

const NAVY: [number, number, number] = [27, 58, 107];
const NAVY_SOFT: [number, number, number] = [220, 227, 239];
const GREEN: [number, number, number] = [29, 122, 70];
const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [95, 97, 104];
const GREY_SOFT: [number, number, number] = [238, 238, 243];

const TOTAL_PAGES = "{total_pages}";
const MARGIN = 32;
const TABLE_TOP = MARGIN + 54;

type Doc = InstanceType<typeof jsPDF>;

/** Church and class, form title, subtitle: drawn on every page. */
function pageChrome(doc: Doc, meta: ExportMeta, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return (pageNumber: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(`${meta.churchName} · ${meta.scopeLabel}`, MARGIN, MARGIN + 6);
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(title, MARGIN, MARGIN + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, MARGIN, MARGIN + 38);

    doc.setFontSize(8);
    doc.text(`Generated ${formatMediumDate(meta.generatedOn)}`, MARGIN, pageHeight - 16);
    // Left-aligned at a fixed spot: the total is substituted after layout, so right-alignment would drift.
    doc.text(`Page ${pageNumber} of ${TOTAL_PAGES}`, pageWidth - MARGIN - 64, pageHeight - 16);
  };
}

const baseStyles = {
  font: "helvetica" as const,
  fontSize: 8,
  cellPadding: 3,
  textColor: INK,
  lineColor: [210, 211, 220] as [number, number, number],
  lineWidth: 0.4,
  valign: "middle" as const,
};

function finish(doc: Doc): Buffer {
  doc.putTotalPages(TOTAL_PAGES);
  return Buffer.from(doc.output("arraybuffer"));
}

// ===========================================================================
// Sunday School Class Attendance Register
// ===========================================================================

/**
 * Name of member and Sex, then months across with Wk1-Wk5 under each, the
 * percentage and present count at the end. Landscape once the range is wide,
 * A3 for very wide ranges so a whole year still fits across one page.
 */
export function buildAttendancePdf(matrix: AttendanceMatrix, meta: ExportMeta): Buffer {
  const n = matrix.dates.length;
  const format = n > 30 ? "a3" : "a4";
  const doc = new jsPDF({ orientation: n > 10 ? "landscape" : "portrait", unit: "pt", format });
  const usable = doc.internal.pageSize.getWidth() - MARGIN * 2;

  const lead: string[] = meta.multiClass ? ["Name of member", "Class", "Sex"] : ["Name of member", "Sex"];
  const nameWidth = meta.multiClass ? 110 : 130;
  const leadWidth = nameWidth + (meta.multiClass ? 64 : 0) + 24;
  const tailWidth = 34 + 42;
  const dateWidth = n ? Math.max(12, Math.min(19, (usable - leadWidth - tailWidth) / n)) : 19;

  const months = registerMonths(matrix.dates, meta.serviceDow);
  const span2 = (content: string): CellDef => ({ content, rowSpan: 2, styles: { valign: "bottom" } });
  const head: RowInput[] = [
    [
      ...lead.map(span2),
      ...months.map((m): CellDef => ({ content: m.label, colSpan: m.columns.length, styles: { halign: "center" } })),
      span2("%"),
      span2("Present"),
    ],
    months.flatMap((m) => m.columns.map((c): CellDef => ({ content: `${c.label}\n${c.day}` }))),
  ];

  const cellKinds: MatrixCell[][] = matrix.rows.map((r) => r.cells);
  const body = matrix.rows.map((row) => [
    row.isActive ? row.fullName : `${row.fullName} (inactive)`,
    ...(meta.multiClass ? [row.className ?? ""] : []),
    sexShort(row.gender),
    ...row.cells.map(() => ""),
    row.percentage === null ? "-" : `${row.percentage}%`,
    `${row.presentCount}/${row.possibleCount}`,
  ]);
  const foot = [[...lead.map((_, i) => (i === 0 ? "Present" : "")), ...matrix.totals.map(String), "", ""]];

  const firstDateCol = lead.length;
  const lastDateCol = firstDateCol + n - 1;

  const columnStyles: Record<
    number,
    { cellWidth?: number | "auto"; halign?: "left" | "center" | "right"; fontStyle?: "bold"; overflow?: "linebreak" }
  > = {
    0: { cellWidth: nameWidth, fontStyle: "bold", overflow: "linebreak" },
  };
  if (meta.multiClass) columnStyles[1] = { cellWidth: 64 };
  columnStyles[lead.length - 1] = { cellWidth: 24, halign: "center" };
  for (let c = firstDateCol; c <= lastDateCol; c++) columnStyles[c] = { cellWidth: dateWidth, halign: "center" };
  columnStyles[lastDateCol + 1] = { cellWidth: 34, halign: "right", fontStyle: "bold" };
  columnStyles[lastDateCol + 2] = { cellWidth: 42, halign: "right" };

  const chrome = pageChrome(doc, meta, REGISTER_TITLE, rangeLabel(meta));

  autoTable(doc, {
    head,
    body,
    foot,
    startY: TABLE_TOP,
    margin: { top: TABLE_TOP, left: MARGIN, right: MARGIN, bottom: 34 },
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    styles: { ...baseStyles, overflow: "ellipsize" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center" },
    footStyles: { fillColor: [244, 244, 247], textColor: INK, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [248, 248, 251] },
    columnStyles,
    didParseCell: (data: CellHookData) => {
      if (data.section === "head" && data.row.index === 0 && data.column.index === 0) data.cell.styles.halign = "left";
      if (data.section === "head" && data.row.index === 1) {
        // Week labels: never ellipsized, tighter padding, softer fill.
        data.cell.styles.fillColor = NAVY_SOFT;
        data.cell.styles.textColor = NAVY;
        data.cell.styles.cellPadding = { top: 2, bottom: 2, left: 0.5, right: 0.5 };
        data.cell.styles.overflow = "visible";
        data.cell.styles.fontSize = 6;
      }
      if (data.section === "foot" && data.column.index === 0) data.cell.styles.halign = "left";
      if (data.section === "body" && data.column.index >= firstDateCol && data.column.index <= lastDateCol) {
        if (cellKinds[data.row.index]?.[data.column.index - firstDateCol] === "not_yet") {
          data.cell.styles.fillColor = GREY_SOFT;
        }
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== "body" || data.column.index < firstDateCol || data.column.index > lastDateCol) return;
      if (cellKinds[data.row.index]?.[data.column.index - firstDateCol] !== "present") return;
      // A filled green disc with a white tick (Helvetica has no ✓ glyph).
      const cx = data.cell.x + data.cell.width / 2;
      const cy = data.cell.y + data.cell.height / 2;
      const r = Math.min(data.cell.width, 16) / 2 - 2.5; // fixed size, even in taller (wrapped) rows
      doc.setFillColor(...GREEN);
      doc.circle(cx, cy, r, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1.1);
      doc.lines(
        [
          [r * 0.35, r * 0.35],
          [r * 0.6, -r * 0.75],
        ],
        cx - r * 0.45,
        cy,
        [1, 1],
        "S",
      );
    },
    didDrawPage: (data) => chrome(data.pageNumber),
  });

  if (matrix.rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No students in this range.", MARGIN, TABLE_TOP + 40);
  }
  return finish(doc);
}

// ===========================================================================
// Sunday School Students Registration Form
// ===========================================================================

export function buildRegistrationPdf(rows: RegistrationRow[], meta: ExportMeta): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const chrome = pageChrome(
    doc,
    meta,
    REGISTRATION_FORM_TITLE,
    `${rows.length} ${rows.length === 1 ? "student" : "students"}`,
  );

  const head = [
    [
      "S/N",
      "Name of student",
      ...(meta.multiClass ? ["Class"] : []),
      "Age",
      "Sex",
      "Telephone",
      "Entry date",
      "Teacher's remarks",
    ],
  ];
  const body = rows.map((r, i) => [
    String(i + 1),
    r.fullName,
    ...(meta.multiClass ? [r.className] : []),
    ageGroupLabel(r.ageGroup),
    sexLabel(r.gender),
    r.phone ?? "",
    r.entryDate ? formatMediumDate(r.entryDate) : "",
    r.remarks.map((m) => `${formatMediumDate(m.date)}: ${m.remark}`).join("\n"),
  ]);

  const offset = meta.multiClass ? 1 : 0;
  autoTable(doc, {
    head,
    body,
    startY: TABLE_TOP,
    margin: { top: TABLE_TOP, left: MARGIN, right: MARGIN, bottom: 34 },
    theme: "grid",
    showHead: "everyPage",
    styles: { ...baseStyles, fontSize: 8.5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [248, 248, 251] },
    columnStyles: {
      0: { cellWidth: 26, halign: "right" },
      1: { cellWidth: 130, fontStyle: "bold" },
      ...(meta.multiClass ? { 2: { cellWidth: 70 } } : {}),
      [2 + offset]: { cellWidth: 58 },
      [3 + offset]: { cellWidth: 44 },
      [4 + offset]: { cellWidth: 80 },
      [5 + offset]: { cellWidth: 62 },
      [6 + offset]: { cellWidth: "auto" },
    },
    didDrawPage: (data) => chrome(data.pageNumber),
  });

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No students registered yet.", MARGIN, TABLE_TOP + 40);
  }
  return finish(doc);
}

// ===========================================================================
// Sunday School Teachers and Assistant Teachers Form
// ===========================================================================

export function buildTeachersPdf(rows: TeacherFormRow[], meta: ExportMeta, timeZone: string): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const chrome = pageChrome(doc, meta, TEACHERS_FORM_TITLE, rangeLabel(meta));

  const head = [
    ["Date", "Name", "Title", ...(meta.multiClass ? ["Class"] : []), "Attendance", "Topic taught", "Remarks"],
  ];
  const body = rows.map((r) => [
    formatMediumDate(r.date),
    r.name,
    staffTitleLabel(r.title),
    ...(meta.multiClass ? [r.className] : []),
    r.present ? `Present${r.markedAt ? ` ${formatTime(r.markedAt, timeZone)}` : ""}` : "Absent",
    r.topic ?? "",
    r.remarks ?? "",
  ]);
  const statusCol = meta.multiClass ? 4 : 3;

  autoTable(doc, {
    head,
    body,
    startY: TABLE_TOP,
    margin: { top: TABLE_TOP, left: MARGIN, right: MARGIN, bottom: 34 },
    theme: "grid",
    showHead: "everyPage",
    styles: { ...baseStyles, fontSize: 8.5, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [248, 248, 251] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 120, fontStyle: "bold" },
      2: { cellWidth: 86 },
      ...(meta.multiClass ? { 3: { cellWidth: 70 } } : {}),
      [statusCol]: { cellWidth: 74 },
      [statusCol + 1]: { cellWidth: "auto" },
      [statusCol + 2]: { cellWidth: "auto" },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section !== "body" || data.column.index !== statusCol) return;
      const present = rows[data.row.index]?.present;
      data.cell.styles.textColor = present ? GREEN : MUTED;
      if (present) data.cell.styles.fontStyle = "bold";
    },
    didDrawPage: (data) => chrome(data.pageNumber),
  });

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No teachers or entries in this range.", MARGIN, TABLE_TOP + 40);
  }
  return finish(doc);
}
