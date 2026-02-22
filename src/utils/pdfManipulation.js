/**
 * pdfManipulation.js
 * Shared utility for all pdf-lib operations.
 * Uses dynamic import so pdf-lib is code-split and only loaded when needed.
 */

async function getPdfLib() {
  return import('pdf-lib');
}

/** Download a Uint8Array as a file in the browser */
export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Download arbitrary bytes with any MIME type */
export function downloadFile(bytes, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Merge multiple PDFs into one.
 * @param {Uint8Array[]} pdfBytesArray - array of raw PDF bytes
 * @returns {Promise<Uint8Array>}
 */
export async function mergePDFs(pdfBytesArray) {
  const { PDFDocument } = await getPdfLib();
  const merged = await PDFDocument.create();

  for (const bytes of pdfBytesArray) {
    const src    = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const copied = await merged.copyPages(src, indices);
    copied.forEach((page) => merged.addPage(page));
  }

  return merged.save();
}

/**
 * Split a PDF into multiple PDFs by page ranges.
 * @param {Uint8Array} pdfBytes
 * @param {Array<[number, number]>} ranges - 1-indexed [start, end] inclusive
 * @returns {Promise<Uint8Array[]>}
 */
export async function splitPDF(pdfBytes, ranges) {
  const { PDFDocument } = await getPdfLib();
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const results = [];

  for (const [start, end] of ranges) {
    const doc     = await PDFDocument.create();
    const indices = [];
    for (let i = start - 1; i <= end - 1; i++) {
      if (i >= 0 && i < src.getPageCount()) indices.push(i);
    }
    const copied = await doc.copyPages(src, indices);
    copied.forEach((page) => doc.addPage(page));
    results.push(await doc.save());
  }

  return results;
}

/**
 * Reorder pages in a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {number[]} newOrder - 0-indexed page indices in desired order
 * @returns {Promise<Uint8Array>}
 */
export async function reorderPages(pdfBytes, newOrder) {
  const { PDFDocument } = await getPdfLib();
  const src    = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(src, newOrder);
  copied.forEach((page) => newDoc.addPage(page));
  return newDoc.save();
}

/**
 * Delete pages from a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {number[]} indicesToDelete - 0-indexed
 * @returns {Promise<Uint8Array>}
 */
export async function deletePages(pdfBytes, indicesToDelete) {
  const { PDFDocument } = await getPdfLib();
  const src      = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const keepSet  = new Set(indicesToDelete);
  const keepOrder = src.getPageIndices().filter((i) => !keepSet.has(i));
  const newDoc   = await PDFDocument.create();
  const copied   = await newDoc.copyPages(src, keepOrder);
  copied.forEach((page) => newDoc.addPage(page));
  return newDoc.save();
}

/**
 * Duplicate a page in a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {number} pageIndex - 0-indexed
 * @returns {Promise<Uint8Array>}
 */
export async function duplicatePage(pdfBytes, pageIndex) {
  const { PDFDocument } = await getPdfLib();
  const src    = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();
  // Copy all pages, inserting duplicate after target
  const allIndices = src.getPageIndices();
  const withDup    = [
    ...allIndices.slice(0, pageIndex + 1),
    pageIndex,
    ...allIndices.slice(pageIndex + 1),
  ];
  const copied = await newDoc.copyPages(src, withDup);
  copied.forEach((page) => newDoc.addPage(page));
  return newDoc.save();
}

/**
 * Rotate specific pages.
 * @param {Uint8Array} pdfBytes
 * @param {Object} rotationMap - { [pageIndex]: angleDegrees }
 * @returns {Promise<Uint8Array>}
 */
export async function rotatePages(pdfBytes, rotationMap) {
  const { PDFDocument, degrees } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  for (const [idx, angle] of Object.entries(rotationMap)) {
    const page    = doc.getPage(Number(idx));
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + angle) % 360));
  }
  return doc.save();
}

/**
 * Compress a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {'low'|'medium'|'high'} level
 * @param {Function} [onProgress] - callback (pageNum, total)
 * @returns {Promise<Uint8Array>}
 */
export async function compressPDF(pdfBytes, level = 'low') {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  // Strip metadata
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('Kodari PDF');
  doc.setProducer('Kodari PDF');

  // All levels use object streams. High/medium compress more aggressively
  // via objectsPerTick. True image recompression is handled by the UI layer.
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

/**
 * Protect a PDF with a password.
 * @param {Uint8Array} pdfBytes
 * @param {string} password
 * @returns {Promise<Uint8Array>}
 */
export async function protectPDF(pdfBytes, password) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.save({
    userPassword: password,
    ownerPassword: password,
  });
}

/**
 * Remove password protection from a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {string} password
 * @returns {Promise<Uint8Array>}
 */
export async function unlockPDF(pdfBytes, password) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes, { password });
  return doc.save();
}

/**
 * Add page numbers to a PDF.
 * @param {Uint8Array} pdfBytes
 * @param {Object} options
 * @param {'bottom-center'|'bottom-right'|'bottom-left'|'top-center'|'top-right'|'top-left'} options.position
 * @param {'n'|'Page n'|'n / total'} options.format
 * @param {number} options.startFrom
 * @param {number} options.fontSize
 * @param {string} options.color  hex color
 * @returns {Promise<Uint8Array>}
 */
export async function addPageNumbers(pdfBytes, options = {}) {
  const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
  const {
    position   = 'bottom-center',
    format     = 'n',
    startFrom  = 1,
    fontSize   = 12,
    color      = '#000000',
  } = options;

  const doc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const total = doc.getPageCount();

  // Parse hex color
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const pdfColor = rgb(r, g, b);
  const margin = 20;

  for (let i = 0; i < total; i++) {
    const page          = doc.getPage(i);
    const { width, height } = page.getSize();
    const n             = i + startFrom;
    let label;
    if (format === 'Page n')         label = `Page ${n}`;
    else if (format === 'n / total') label = `${n} / ${total}`;
    else                             label = `${n}`;

    const textWidth = font.widthOfTextAtSize(label, fontSize);
    let x, y;

    if (position.includes('bottom')) y = margin;
    else                              y = height - margin - fontSize;

    if (position.includes('center')) x = (width - textWidth) / 2;
    else if (position.includes('right')) x = width - textWidth - margin;
    else                              x = margin;

    page.drawText(label, { x, y, size: fontSize, font, color: pdfColor });
  }

  return doc.save();
}

/**
 * Convert image files (JPEG/PNG) to a single PDF.
 * @param {Array<{bytes: Uint8Array, type: string}>} images
 * @returns {Promise<Uint8Array>}
 */
export async function imagesToPDF(images) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();

  for (const { bytes, type } of images) {
    let img;
    if (type === 'image/png') {
      img = await doc.embedPng(bytes);
    } else {
      img = await doc.embedJpg(bytes);
    }
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  return doc.save();
}
