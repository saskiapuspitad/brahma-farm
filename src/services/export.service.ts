import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export interface ExportMeta {
  title: string;
  subtitle?: string;
  farmName?: string;
  period?: string;
  generatedBy?: string;
  generatedAt?: string;
}

/** Bangun file Excel (.xlsx) dari baris datar. Header = kunci objek pertama. */
export async function toExcelBuffer(rows: Record<string, unknown>[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BrahmaFarm";
  const ws = wb.addWorksheet(meta.title.slice(0, 30) || "Laporan");

  // Header identitas
  ws.mergeCells(1, 1, 1, Math.max(1, rows[0] ? Object.keys(rows[0]).length : 1));
  ws.getCell(1, 1).value = meta.title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  const infoLine = [meta.farmName, meta.period, meta.generatedBy ? `Oleh: ${meta.generatedBy}` : null, meta.generatedAt ? `Dibuat: ${meta.generatedAt}` : null]
    .filter(Boolean).join(" · ");
  ws.getCell(2, 1).value = infoLine;
  ws.getCell(2, 1).font = { size: 9, color: { argb: "FF666666" } };

  if (rows.length === 0) {
    ws.getCell(4, 1).value = "Tidak ada data.";
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const headers = Object.keys(rows[0]);
  const headerRowIndex = 4;
  const headerRow = ws.getRow(headerRowIndex);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF268049" } };
    cell.alignment = { horizontal: "center" };
  });
  headerRow.commit();

  rows.forEach((r, idx) => {
    const row = ws.getRow(headerRowIndex + 1 + idx);
    headers.forEach((h, i) => {
      const v = r[h];
      row.getCell(i + 1).value = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean));
    });
    row.commit();
  });

  // Auto width sederhana
  headers.forEach((h, i) => {
    let max = h.length;
    for (const r of rows) {
      const v = r[h];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    ws.getColumn(i + 1).width = Math.min(40, Math.max(10, max + 2));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Bangun file PDF dari baris datar (tabel sederhana, orientasi landscape). */
export function toPdfBuffer(rows: Record<string, unknown>[], meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(16).fillColor("#1f6b3d").text(meta.title, { continued: false });
    const info = [meta.farmName, meta.period, meta.generatedBy ? `Oleh: ${meta.generatedBy}` : null, meta.generatedAt ? `Dibuat: ${meta.generatedAt}` : null]
      .filter(Boolean).join("  ·  ");
    if (info) doc.moveDown(0.2).fontSize(9).fillColor("#666").text(info);
    doc.moveDown(0.5);

    if (rows.length === 0) {
      doc.fontSize(11).fillColor("#000").text("Tidak ada data untuk filter ini.");
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / headers.length;
    const startX = doc.page.margins.left;
    let y = doc.y;

    const drawHeader = () => {
      doc.fontSize(8).fillColor("#fff");
      doc.rect(startX, y, pageWidth, 16).fill("#268049");
      doc.fillColor("#fff");
      headers.forEach((h, i) => {
        doc.text(String(h), startX + i * colWidth + 2, y + 4, { width: colWidth - 4, height: 12, ellipsis: true });
      });
      y += 16;
    };
    drawHeader();

    doc.fontSize(8).fillColor("#000");
    for (const r of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
        doc.fontSize(8).fillColor("#000");
      }
      headers.forEach((h, i) => {
        const v = r[h];
        const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        doc.fillColor("#000").text(s, startX + i * colWidth + 2, y + 3, { width: colWidth - 4, height: 11, ellipsis: true });
      });
      y += 14;
      doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor("#eee").stroke();
    }

    doc.end();
  });
}
