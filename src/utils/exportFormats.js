/**
 * exportFormats.js — PDF → Image, PDF → Word (DOCX), PDF → Excel (XLSX)
 *
 * All functions accept a pdf.js PDFDocumentProxy (pdfDoc) and the raw bytes/name
 * where needed, and trigger browser downloads.
 */

import { downloadFile } from './pdfManipulation.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const binStr = atob(b64);
  const arr    = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
  return arr;
}

// ── PDF → Images ─────────────────────────────────────────────────────────────

/**
 * Render each PDF page to canvas and download as JPEG/PNG (ZIP if > 1 page).
 *
 * @param {PDFDocumentProxy} pdfDoc   — loaded pdf.js document
 * @param {string}           baseName — filename without extension
 * @param {string}           format   — 'jpeg' | 'png'
 * @param {number}           dpi      — 72, 150, or 300
 * @param {Function}         onProgress(current, total)
 */
export async function pdfToImages(pdfDoc, baseName, format = 'jpeg', dpi = 150, onProgress) {
  const scale   = dpi / 72;
  const total   = pdfDoc.numPages;
  const images  = [];

  for (let i = 1; i <= total; i++) {
    const page   = await pdfDoc.getPage(i);
    const vp     = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx    = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality  = format === 'png' ? undefined : 0.92;
    const dataURL  = canvas.toDataURL(mimeType, quality);
    const bytes    = b64ToUint8(dataURL.split(',')[1]);
    images.push({ bytes, ext: format === 'png' ? 'png' : 'jpg' });
    if (onProgress) onProgress(i, total);
  }

  if (images.length === 1) {
    downloadFile(images[0].bytes, `${baseName}.${images[0].ext}`,
      format === 'png' ? 'image/png' : 'image/jpeg');
  } else {
    const JSZip = (await import('jszip')).default;
    const zip   = new JSZip();
    images.forEach(({ bytes, ext }, idx) => {
      const n = String(idx + 1).padStart(3, '0');
      zip.file(`${baseName}_page${n}.${ext}`, bytes);
    });
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    downloadFile(zipBytes, `${baseName}_images.zip`, 'application/zip');
  }
}

// ── PDF → Word (DOCX) ─────────────────────────────────────────────────────────

/**
 * Extract text from all pages via pdf.js and generate a .docx file.
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {string}           baseName
 * @param {Function}         onProgress(current, total)
 */
export async function pdfToDocx(pdfDoc, baseName, onProgress) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx');

  const total      = pdfDoc.numPages;
  const allParas   = [];

  for (let i = 1; i <= total; i++) {
    const page        = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    if (onProgress) onProgress(i, total);

    // Group text items by approximate Y position into lines
    const lineMap = new Map();
    textContent.items.forEach((item) => {
      if (!item.str.trim()) return;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    });

    // Sort lines by Y descending (PDF y-axis is bottom-up)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const lines    = sortedYs.map((y) =>
      lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4])
               .map((item) => item.str).join(' ')
    );

    if (i > 1) {
      allParas.push(
        new Paragraph({
          text:    `— Page ${i} —`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        })
      );
    }

    lines.forEach((line) => {
      if (line.trim()) {
        allParas.push(
          new Paragraph({ children: [new TextRun(line.trim())] })
        );
      }
    });
  }

  const doc = new Document({
    sections: [{ children: allParas }],
  });

  const buf = await Packer.toBuffer(doc);
  downloadFile(new Uint8Array(buf), `${baseName}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

// ── PDF → Excel (XLSX) ────────────────────────────────────────────────────────

/**
 * Extract text from all pages and map to spreadsheet rows.
 * Items near the same Y → same row; X positions map to approximate columns.
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {string}           baseName
 * @param {Function}         onProgress(current, total)
 */
export async function pdfToXlsx(pdfDoc, baseName, onProgress) {
  const XLSX  = await import('xlsx');
  const total = pdfDoc.numPages;
  const wb    = XLSX.utils.book_new();

  for (let i = 1; i <= total; i++) {
    const page        = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const vp          = page.getViewport({ scale: 1 });
    if (onProgress) onProgress(i, total);

    // Group items into rows by Y (tolerance ±3pt) then columns by X
    const rows = [];
    textContent.items.forEach((item) => {
      if (!item.str.trim()) return;
      const y = item.transform[5];
      const x = item.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 6);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x, text: item.str });
    });

    // Sort rows top-to-bottom (y descending), cells left-to-right
    rows.sort((a, b) => b.y - a.y);
    const sheetData = rows.map((row) => {
      row.cells.sort((a, b) => a.x - b.x);
      return row.cells.map((c) => c.text);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const sheetName = `Page ${i}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const xlsBuf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadFile(new Uint8Array(xlsBuf), `${baseName}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
