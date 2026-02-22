/**
 * exportAnnotatedPDF — bake all in-memory annotations into a PDF using pdf-lib.
 *
 * Annotation types handled:
 *   highlight       → colored semi-transparent rect
 *   drawing         → polyline stroke
 *   note            → colored rect + "N" text label
 *   text-box        → drawText at position
 *   image-overlay   → embedPng/Jpg + drawImage
 *   (signature is stored as image-overlay, handled identically)
 */

import { downloadBytes } from './pdfManipulation.js';

/**
 * @param {Uint8Array}  pdfBytes
 * @param {string}      pdfName
 * @param {Array}       annotations  — flat array of all page annotations
 */
let rgb; // module-level reference set at export time

export async function exportAnnotatedPDF(pdfBytes, pdfName, annotations) {
  const pdfLib = await import('pdf-lib');
  const { PDFDocument, StandardFonts } = pdfLib;
  rgb = pdfLib.rgb;

  const doc  = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const totalPages = doc.getPageCount();

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum  = pageIdx + 1;
    const page     = doc.getPage(pageIdx);
    const { width: pageW, height: pageH } = page.getSize();

    const pageAnns = annotations.filter((a) => a.page === pageNum);
    if (!pageAnns.length) continue;

    for (const ann of pageAnns) {
      try {
        switch (ann.type) {
          case 'highlight':
            await renderHighlight(page, ann, pageH);
            break;
          case 'drawing':
            renderDrawing(page, ann, pageH, pageW);
            break;
          case 'note':
            renderNote(page, ann, font, pageH);
            break;
          case 'text-box':
            renderTextBox(page, ann, font, pageH);
            break;
          case 'image-overlay':
            await renderImageOverlay(page, ann, doc, pageH);
            break;
          case 'underline':
            renderUnderline(page, ann, pageH);
            break;
          case 'strikethrough':
            renderStrikethrough(page, ann, pageH);
            break;
          case 'shape-rect':
          case 'shape-circle':
          case 'shape-line':
          case 'shape-arrow':
            renderShape(page, ann, pageH);
            break;
          case 'stamp':
            renderStamp(page, ann, font, pageH);
            break;
          case 'redact':
            renderRedaction(page, ann, pageH);
            break;
          default:
            break;
        }
      } catch (e) {
        console.warn(`exportPDF: failed to render annotation type=${ann.type}`, e);
      }
    }
  }

  const result = await doc.save();
  const base   = (pdfName || 'document').replace(/\.pdf$/i, '');
  downloadBytes(result, `${base}_annotated.pdf`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse #rrggbb or #rgb hex string → pdf-lib rgb() */
function hexToRgb(hex) {
  if (!hex) return { r: 0, g: 0, b: 0 };
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16) / 255,
      g: parseInt(h[1] + h[1], 16) / 255,
      b: parseInt(h[2] + h[2], 16) / 255,
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** PDF coordinates are bottom-left origin; our annotations store PDF coords directly. */
function pdfY(annPdfY, _pageH) {
  // Our coord system uses pdf-lib bottom-left, same as annotation storage
  return annPdfY;
}

async function renderHighlight(page, ann, pageH) {
  const c = hexToRgb(ann.color);
  for (const rect of (ann.rects || [])) {
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      color: rgb(c.r, c.g, c.b),
      opacity: 0.35,
    });
  }
}

function renderDrawing(page, ann, pageH, pageW) {
  const points = ann.points || [];
  if (points.length < 2) return;
  const c = hexToRgb(ann.color);
  const sw = ann.strokeWidth || 2;
  for (let i = 0; i < points.length - 1; i++) {
    page.drawLine({
      start: { x: points[i].x,     y: points[i].y     },
      end:   { x: points[i + 1].x, y: points[i + 1].y },
      thickness: sw,
      color: rgb(c.r, c.g, c.b),
    });
  }
}

function renderNote(page, ann, font, pageH) {
  const c  = hexToRgb(ann.color || '#FFEA00');
  const sz = 16;
  page.drawRectangle({
    x: ann.x - sz / 2, y: ann.y - sz / 2,
    width: sz, height: sz,
    color: rgb(c.r, c.g, c.b),
    opacity: 0.85,
    borderColor: rgb(0, 0, 0),
    borderOpacity: 0.2,
    borderWidth: 0.5,
  });
  page.drawText('N', {
    x: ann.x - 4, y: ann.y - 5,
    size: 10, font,
    color: rgb(0, 0, 0),
    opacity: 0.6,
  });
  // Render note content if any
  if (ann.content) {
    const lines = ann.content.split('\n').slice(0, 5);
    let lineY = ann.y + sz;
    page.drawRectangle({
      x: ann.x, y: lineY - 4,
      width: 140, height: lines.length * 12 + 8,
      color: rgb(c.r, c.g, c.b),
      opacity: 0.8,
    });
    lines.forEach((line) => {
      if (!line.trim()) { lineY -= 12; return; }
      page.drawText(line.slice(0, 30), {
        x: ann.x + 4, y: lineY,
        size: 9, font,
        color: rgb(0, 0, 0),
      });
      lineY -= 12;
    });
  }
}

function renderTextBox(page, ann, font, pageH) {
  if (!ann.text || !ann.text.trim()) return;
  const c    = hexToRgb(ann.color || '#000000');
  const size = Math.max(6, ann.fontSize || 14);
  const lines = ann.text.split('\n');
  let currentY = ann.y;
  // pdf-lib draws text with y at baseline (bottom of text)
  // We want to draw from the top-left of the text box
  // Since PDF origin is bottom-left, we need to start from the top
  // ann.y is the top-left corner in PDF coords (y increases upward)
  currentY = ann.y;
  lines.forEach((line) => {
    if (line !== undefined) {
      page.drawText(line || ' ', {
        x: ann.x,
        y: currentY,
        size,
        font,
        color: rgb(c.r, c.g, c.b),
      });
    }
    currentY -= size * 1.4;
  });
}

function renderUnderline(page, ann, pageH) {
  const c = hexToRgb(ann.color);
  for (const rect of (ann.rects || [])) {
    page.drawLine({
      start: { x: rect.x, y: rect.y },
      end:   { x: rect.x + rect.w, y: rect.y },
      thickness: 1.5,
      color: rgb(c.r, c.g, c.b),
    });
  }
}

function renderStrikethrough(page, ann, pageH) {
  const c = hexToRgb(ann.color);
  for (const rect of (ann.rects || [])) {
    const midY = rect.y + rect.h / 2;
    page.drawLine({
      start: { x: rect.x, y: midY },
      end:   { x: rect.x + rect.w, y: midY },
      thickness: 1.5,
      color: rgb(c.r, c.g, c.b),
    });
  }
}

function renderShape(page, ann, pageH) {
  const c = hexToRgb(ann.color);
  const sw = ann.strokeWidth || 2;

  if (ann.type === 'shape-rect') {
    const x = Math.min(ann.x1, ann.x2);
    const y = Math.min(ann.y1, ann.y2);
    const w = Math.abs(ann.x2 - ann.x1);
    const h = Math.abs(ann.y2 - ann.y1);
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(c.r, c.g, c.b), borderWidth: sw, color: undefined });
  } else if (ann.type === 'shape-circle') {
    const cx = (ann.x1 + ann.x2) / 2;
    const cy = (ann.y1 + ann.y2) / 2;
    const rx = Math.abs(ann.x2 - ann.x1) / 2;
    const ry = Math.abs(ann.y2 - ann.y1) / 2;
    page.drawEllipse({ x: cx, y: cy, xScale: rx, yScale: ry, borderColor: rgb(c.r, c.g, c.b), borderWidth: sw, color: undefined });
  } else if (ann.type === 'shape-line' || ann.type === 'shape-arrow') {
    page.drawLine({
      start: { x: ann.x1, y: ann.y1 },
      end:   { x: ann.x2, y: ann.y2 },
      thickness: sw,
      color: rgb(c.r, c.g, c.b),
    });
    if (ann.type === 'shape-arrow') {
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = 10;
      const ax1 = ann.x2 - headLen * Math.cos(angle - Math.PI / 6);
      const ay1 = ann.y2 - headLen * Math.sin(angle - Math.PI / 6);
      const ax2 = ann.x2 - headLen * Math.cos(angle + Math.PI / 6);
      const ay2 = ann.y2 - headLen * Math.sin(angle + Math.PI / 6);
      page.drawLine({ start: { x: ann.x2, y: ann.y2 }, end: { x: ax1, y: ay1 }, thickness: sw, color: rgb(c.r, c.g, c.b) });
      page.drawLine({ start: { x: ann.x2, y: ann.y2 }, end: { x: ax2, y: ay2 }, thickness: sw, color: rgb(c.r, c.g, c.b) });
    }
  }
}

function renderStamp(page, ann, font, pageH) {
  const c = hexToRgb(ann.color || '#FF1744');
  const size = 18;
  const text = ann.stampText || 'APPROVED';
  const textWidth = font.widthOfTextAtSize(text, size);
  const pad = 6;
  page.drawRectangle({
    x: ann.x - pad, y: ann.y - size - pad,
    width: textWidth + pad * 2, height: size + pad * 2,
    borderColor: rgb(c.r, c.g, c.b), borderWidth: 2, color: undefined,
  });
  page.drawText(text, {
    x: ann.x, y: ann.y - size + 2,
    size, font,
    color: rgb(c.r, c.g, c.b),
  });
}

function renderRedaction(page, ann, pageH) {
  page.drawRectangle({
    x: ann.x, y: ann.y,
    width: ann.w, height: ann.h,
    color: rgb(0, 0, 0),
  });
}

async function renderImageOverlay(page, ann, doc, pageH) {
  if (!ann.dataURL) return;

  // Decode dataURL to bytes
  const base64 = ann.dataURL.split(',')[1];
  if (!base64) return;
  const binStr = atob(base64);
  const bytes  = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  const mime = ann.dataURL.split(';')[0].split(':')[1] || '';
  let embedded;
  if (mime === 'image/png') {
    embedded = await doc.embedPng(bytes);
  } else {
    embedded = await doc.embedJpg(bytes);
  }

  // ann.x, ann.y = top-left corner; ann.w, ann.h = size in PDF points
  // pdf-lib drawImage: x,y = bottom-left of image
  page.drawImage(embedded, {
    x: ann.x,
    y: ann.y - ann.h,
    width: ann.w,
    height: ann.h,
  });
}
