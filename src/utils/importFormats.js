/**
 * importFormats.js — Word (.docx) → PDF conversion.
 *
 * Strategy: use mammoth.js to convert DOCX → HTML, render into a hidden iframe,
 * then trigger window.print() so the browser's print dialog can save as PDF.
 * This leverages the browser's native print-to-PDF capability without any
 * server-side processing.
 */

/**
 * Convert a .docx ArrayBuffer to an HTML string using mammoth.js.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<string>} HTML string
 */
export async function docxToHtml(arrayBuffer) {
  const mammoth = await import('mammoth');
  const result  = await mammoth.convertToHtml({ arrayBuffer });
  return result.value; // HTML string
}

/**
 * Show the DOCX content in a printable overlay and prompt user to Save as PDF.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string}      fileName
 */
export async function docxToPrintPDF(arrayBuffer, fileName) {
  const html = await docxToHtml(arrayBuffer);

  // Build a minimal printable HTML document
  const printDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${fileName}</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
      color: #000;
    }
    @media print {
      body { margin: 0; padding: 0; }
    }
    h1,h2,h3,h4 { font-weight: bold; margin: 1em 0 0.5em; }
    p { margin: 0 0 0.6em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    td, th { border: 1px solid #ccc; padding: 4px 8px; }
    img { max-width: 100%; }
  </style>
</head>
<body>${html}</body>
</html>`;

  // Open in a new window and print
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    throw new Error('Popup blocked. Please allow popups for this page.');
  }
  win.document.write(printDoc);
  win.document.close();
  // Give the document time to render before printing
  setTimeout(() => {
    win.print();
  }, 800);
}
