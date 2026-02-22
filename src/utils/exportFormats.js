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

    // Group text items by approximate Y position into lines (tolerance ±3pt)
    const lineMap = new Map();
    textContent.items.forEach((item) => {
      if (!item.str.trim()) return;
      const y = Math.round(item.transform[5]);
      // Find an existing line within tolerance
      let matched = false;
      for (const [key] of lineMap) {
        if (Math.abs(key - y) <= 3) {
          lineMap.get(key).push(item);
          matched = true;
          break;
        }
      }
      if (!matched) lineMap.set(y, [item]);
    });

    // Sort lines by Y descending (PDF y-axis is bottom-up)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    // Build enriched line objects with font size info for heading detection
    const enrichedLines = sortedYs.map((y) => {
      const items = lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      const text  = items.map((item) => item.str).join(' ').trim();
      // Compute dominant font size for this line (use max item height)
      const fontSize = Math.max(...items.map((item) => Math.abs(item.transform[3]) || item.height || 12));
      return { y, text, fontSize, items };
    });

    // Determine the body font size as the most frequent size (mode)
    const sizeCounts = {};
    enrichedLines.forEach(({ fontSize }) => {
      const rounded = Math.round(fontSize);
      sizeCounts[rounded] = (sizeCounts[rounded] || 0) + 1;
    });
    let bodyFontSize = 12;
    let maxCount     = 0;
    for (const [size, count] of Object.entries(sizeCounts)) {
      if (count > maxCount) { maxCount = count; bodyFontSize = Number(size); }
    }

    // Compute median line gap for paragraph break detection
    const lineGaps = [];
    for (let j = 1; j < enrichedLines.length; j++) {
      const gap = Math.abs(enrichedLines[j - 1].y - enrichedLines[j].y);
      if (gap > 0) lineGaps.push(gap);
    }
    lineGaps.sort((a, b) => a - b);
    const medianGap = lineGaps.length > 0
      ? lineGaps[Math.floor(lineGaps.length / 2)]
      : bodyFontSize * 1.2;
    // A gap > 1.5x the median line gap signals a paragraph break
    const paraBreakThreshold = medianGap * 1.5;

    if (i > 1) {
      allParas.push(
        new Paragraph({
          text:    `— Page ${i} —`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        })
      );
    }

    // Build paragraphs: group consecutive lines, split on large gaps
    let currentGroup = [];

    const flushGroup = () => {
      if (currentGroup.length === 0) return;
      const combined = currentGroup.map((l) => l.text).join(' ').trim();
      if (!combined) { currentGroup = []; return; }

      // Check if the group is a heading (single line with notably larger font)
      const isSingleLine = currentGroup.length === 1;
      const groupFontSize = Math.max(...currentGroup.map((l) => l.fontSize));
      const isHeading = isSingleLine && groupFontSize > bodyFontSize * 1.2;

      if (isHeading) {
        // Map font size ratio to heading level
        const ratio = groupFontSize / bodyFontSize;
        let headingLevel;
        if (ratio >= 1.8)      headingLevel = HeadingLevel.HEADING_1;
        else if (ratio >= 1.4) headingLevel = HeadingLevel.HEADING_2;
        else                   headingLevel = HeadingLevel.HEADING_3;

        allParas.push(
          new Paragraph({
            text:    combined,
            heading: headingLevel,
            spacing: { before: 240, after: 120 },
          })
        );
      } else {
        allParas.push(
          new Paragraph({
            children: [new TextRun(combined)],
            spacing:  { after: 120 },
          })
        );
      }
      currentGroup = [];
    };

    for (let j = 0; j < enrichedLines.length; j++) {
      const line = enrichedLines[j];
      if (!line.text) continue;

      if (j > 0 && currentGroup.length > 0) {
        const gap = Math.abs(enrichedLines[j - 1].y - line.y);
        // Font size change also triggers a paragraph break
        const prevFontSize = enrichedLines[j - 1].fontSize;
        const sizeChanged  = Math.abs(prevFontSize - line.fontSize) > 2;
        if (gap > paraBreakThreshold || sizeChanged) {
          flushGroup();
        }
      }
      currentGroup.push(line);
    }
    flushGroup();
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
/**
 * Cluster an array of numeric values into groups using a minimum-gap approach.
 * Returns sorted array of cluster centers.
 */
function clusterPositions(values, minGap) {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > minGap) {
      clusters.push([sorted[i]]);
    } else {
      clusters[clusters.length - 1].push(sorted[i]);
    }
  }
  // Return cluster center (mean) for each cluster
  return clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
}

export async function pdfToXlsx(pdfDoc, baseName, onProgress) {
  const XLSX  = await import('xlsx');
  const total = pdfDoc.numPages;
  const wb    = XLSX.utils.book_new();

  for (let i = 1; i <= total; i++) {
    const page        = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const vp          = page.getViewport({ scale: 1 });
    if (onProgress) onProgress(i, total);

    // Collect all text items with position and width info
    const items = [];
    textContent.items.forEach((item) => {
      if (!item.str.trim()) return;
      const x     = item.transform[4];
      const y     = item.transform[5];
      const w     = item.width || item.str.length * 5; // fallback width estimate
      items.push({ x, y, w, text: item.str });
    });

    if (items.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(wb, ws, `Page ${i}`.slice(0, 31));
      continue;
    }

    // Group items into rows by Y (tolerance ±3pt)
    const rows = [];
    items.forEach((item) => {
      let row = rows.find((r) => Math.abs(r.y - item.y) < 6);
      if (!row) { row = { y: item.y, cells: [] }; rows.push(row); }
      row.cells.push(item);
    });
    rows.sort((a, b) => b.y - a.y);

    // Cluster X positions to detect consistent columns
    // Use a gap of 15pt as minimum separation between columns
    const allXPositions = items.map((it) => it.x);
    const colCenters    = clusterPositions(allXPositions, 15);
    const numCols       = colCenters.length;

    // Compute the average cell width at each column position for merged-cell detection
    const colWidths = colCenters.map(() => []);
    items.forEach((item) => {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < numCols; c++) {
        const d = Math.abs(item.x - colCenters[c]);
        if (d < bestDist) { bestDist = d; bestCol = c; }
      }
      colWidths[bestCol].push(item.w);
    });
    const avgColWidth = colWidths.map((ws) =>
      ws.length > 0 ? ws.reduce((s, v) => s + v, 0) / ws.length : 50
    );

    // Build sheet data with proper column placement
    const sheetData = [];
    const merges    = [];

    rows.forEach((row, rowIdx) => {
      const rowArr = new Array(numCols).fill('');
      row.cells.sort((a, b) => a.x - b.x);

      row.cells.forEach((cell) => {
        // Find the closest column center
        let bestCol  = 0;
        let bestDist = Infinity;
        for (let c = 0; c < numCols; c++) {
          const d = Math.abs(cell.x - colCenters[c]);
          if (d < bestDist) { bestDist = d; bestCol = c; }
        }

        // Check if this cell spans multiple columns (merged cell detection)
        // A cell is "wide" if its width exceeds 1.8x the average for that column
        // and extends into the next column's territory
        let spanEnd = bestCol;
        if (cell.w > avgColWidth[bestCol] * 1.8 && bestCol < numCols - 1) {
          const cellRight = cell.x + cell.w;
          for (let c = bestCol + 1; c < numCols; c++) {
            if (cellRight > colCenters[c] - 10) {
              spanEnd = c;
            } else {
              break;
            }
          }
        }

        if (rowArr[bestCol]) {
          // Append to existing content in the same column
          rowArr[bestCol] += ' ' + cell.text;
        } else {
          rowArr[bestCol] = cell.text;
        }

        // Record merge if spanning multiple columns
        if (spanEnd > bestCol) {
          merges.push({
            s: { r: rowIdx, c: bestCol },
            e: { r: rowIdx, c: spanEnd },
          });
        }
      });

      sheetData.push(rowArr);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Apply detected merges
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }

    const sheetName = `Page ${i}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const xlsBuf  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadFile(new Uint8Array(xlsBuf), `${baseName}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
