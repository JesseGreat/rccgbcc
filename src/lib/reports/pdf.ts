import "server-only";

import { jsPDF } from "jspdf";
import { autoTable, type CellHookData } from "jspdf-autotable";

import { formatMediumDate } from "@/lib/attendance/dates";

import { rangeLabel, type ExportMeta } from "./export-meta";
import type { AttendanceMatrix, MatrixCell } from "./matrix";

const NAVY: [number, number, number] = [27, 58, 107];
const GREEN: [number, number, number] = [29, 122, 70];
const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [95, 97, 104];
const GREY_SOFT: [number, number, number] = [238, 238, 243];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOTAL_PAGES = "{total_pages}";

/**
 * Church and class in the header, the same matrix as the web view, page
 * numbers in the footer. Landscape once the range is wide; very wide ranges
 * continue onto extra pages with the student column repeated.
 */
export function buildAttendancePdf(matrix: AttendanceMatrix, meta: ExportMeta): Buffer {
  const landscape = matrix.dates.length > 10;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  const lead = meta.multiClass ? ["Student", "Class"] : ["Student"];
  const head = [
    [
      ...lead,
      ...matrix.dates.map((d) => {
        const [, m, day] = d.split("-");
        return `${Number(day)}\n${MONTHS[Number(m) - 1]}`;
      }),
      "%",
      "Present",
    ],
  ];

  const cellKinds: MatrixCell[][] = matrix.rows.map((r) => r.cells);
  const body = matrix.rows.map((row) => [
    row.isActive ? row.fullName : `${row.fullName} (inactive)`,
    ...(meta.multiClass ? [row.className ?? ""] : []),
    ...row.cells.map(() => ""),
    row.percentage === null ? "-" : `${row.percentage}%`,
    `${row.presentCount}/${row.possibleCount}`,
  ]);
  const foot = [[...(meta.multiClass ? ["Present", ""] : ["Present"]), ...matrix.totals.map(String), "", ""]];

  const firstDateCol = lead.length;
  const lastDateCol = firstDateCol + matrix.dates.length - 1;

  const columnStyles: Record<
    number,
    { cellWidth?: number | "auto"; halign?: "left" | "center" | "right"; fontStyle?: "bold"; overflow?: "linebreak" }
  > = {
    0: { cellWidth: meta.multiClass ? 110 : 130, fontStyle: "bold", overflow: "linebreak" },
  };
  if (meta.multiClass) columnStyles[1] = { cellWidth: 64 };
  for (let c = firstDateCol; c <= lastDateCol; c++) columnStyles[c] = { cellWidth: 19, halign: "center" };
  columnStyles[lastDateCol + 1] = { cellWidth: 34, halign: "right", fontStyle: "bold" };
  columnStyles[lastDateCol + 2] = { cellWidth: 42, halign: "right" };

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(meta.churchName, margin, margin + 6);
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(`${meta.scopeLabel} · Sunday School attendance`, margin, margin + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(rangeLabel(meta), margin, margin + 38);
  };

  const drawFooter = (pageNumber: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${formatMediumDate(meta.generatedOn)}`, margin, pageHeight - 16);
    // Left-aligned at a fixed spot: the total is substituted after layout, so right-alignment would drift.
    doc.text(`Page ${pageNumber} of ${TOTAL_PAGES}`, pageWidth - margin - 64, pageHeight - 16);
  };

  autoTable(doc, {
    head,
    body,
    foot,
    startY: margin + 50,
    margin: { top: margin + 50, left: margin, right: margin, bottom: 34 },
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: meta.multiClass ? [0, 1] : 0,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3,
      textColor: INK,
      lineColor: [210, 211, 220],
      lineWidth: 0.4,
      valign: "middle",
      overflow: "ellipsize",
    },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "center" },
    footStyles: { fillColor: [244, 244, 247], textColor: INK, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [248, 248, 251] },
    columnStyles,
    didParseCell: (data: CellHookData) => {
      if (data.section === "head" && data.column.index < firstDateCol) data.cell.styles.halign = "left";
      if (data.section === "head" && data.column.index >= firstDateCol && data.column.index <= lastDateCol) {
        // "13 / Sep" must never be ellipsized: tighter padding, and let it overflow if needed.
        data.cell.styles.cellPadding = { top: 3, bottom: 3, left: 0.5, right: 0.5 };
        data.cell.styles.overflow = "visible";
      }
      if (data.section === "foot" && data.column.index < firstDateCol) data.cell.styles.halign = "left";
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
    didDrawPage: (data) => {
      drawHeader();
      drawFooter(data.pageNumber);
    },
  });

  if (matrix.rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No students in this range.", margin, margin + 90);
  }

  doc.putTotalPages(TOTAL_PAGES);
  return Buffer.from(doc.output("arraybuffer"));
}
