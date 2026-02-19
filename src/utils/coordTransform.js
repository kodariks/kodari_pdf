/**
 * Coordinate conversion utilities for PDF ↔ viewport space.
 *
 * PDF coordinates: origin bottom-left, 72 DPI, unscaled.
 * Viewport coordinates: origin top-left, scaled by zoom/rotation.
 *
 * The viewport.transform is a 6-element matrix [a, b, c, d, e, f]
 * that maps PDF coords → viewport coords:
 *   vx = a * px + c * py + e
 *   vy = b * px + d * py + f
 */

/** Convert a point from PDF space to viewport space. */
export function pdfToViewport(pdfX, pdfY, viewport) {
  const [a, b, c, d, e, f] = viewport.transform;
  return {
    x: a * pdfX + c * pdfY + e,
    y: b * pdfX + d * pdfY + f,
  };
}

/** Convert a point from viewport space to PDF space. */
export function viewportToPdf(vpX, vpY, viewport) {
  const [a, b, c, d, e, f] = viewport.transform;
  const det = a * d - b * c;
  return {
    x: (d * (vpX - e) - c * (vpY - f)) / det,
    y: (-b * (vpX - e) + a * (vpY - f)) / det,
  };
}

/**
 * Convert a rect from PDF space to viewport space.
 * PDF rects have origin at bottom-left; viewport rects at top-left.
 */
export function rectPdfToViewport(rect, viewport) {
  // Transform the four corners and find the bounding box
  const p1 = pdfToViewport(rect.x, rect.y, viewport);
  const p2 = pdfToViewport(rect.x + rect.w, rect.y, viewport);
  const p3 = pdfToViewport(rect.x, rect.y + rect.h, viewport);
  const p4 = pdfToViewport(rect.x + rect.w, rect.y + rect.h, viewport);

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

/**
 * Convert a rect from viewport space to PDF space.
 */
export function viewportToPdfRect(rect, viewport) {
  const p1 = viewportToPdf(rect.x, rect.y, viewport);
  const p2 = viewportToPdf(rect.x + rect.w, rect.y, viewport);
  const p3 = viewportToPdf(rect.x, rect.y + rect.h, viewport);
  const p4 = viewportToPdf(rect.x + rect.w, rect.y + rect.h, viewport);

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}
