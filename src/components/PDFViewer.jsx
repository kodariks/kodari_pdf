import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Point to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PDFViewer({
  pdfData,
  currentPage,
  scale,
  searchQuery,
  darkMode,
  onDocumentLoad,
  onPageChange,
}) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const textLayerRef = useRef(null);
  const pdfRef       = useRef(null);
  const renderTaskRef = useRef(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [isRendering, setIsRendering] = useState(false);

  // ── Load PDF document ──
  useEffect(() => {
    if (!pdfData) return;

    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });

    loadingTask.promise.then((pdf) => {
      if (cancelled) return;
      pdfRef.current = pdf;
      onDocumentLoad(pdf.numPages);
      setRenderError(null);
    }).catch((err) => {
      if (!cancelled) setRenderError('Failed to load PDF: ' + err.message);
    });

    return () => {
      cancelled = true;
      loadingTask.destroy?.();
    };
  }, [pdfData]);

  // ── Compute fit-to-width scale when container resizes ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setFitWidth(container.clientWidth - 40);
    });
    ro.observe(container);
    setFitWidth(container.clientWidth - 40);
    return () => ro.disconnect();
  }, []);

  // ── Render page ──
  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!pdf || !canvas || currentPage < 1 || currentPage > pdf.numPages) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setIsRendering(true);
    setRenderError(null);

    try {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });

      // Determine effective scale
      let effectiveScale = scale;
      if (scale === 0 && fitWidth > 0) {
        effectiveScale = fitWidth / viewport.width;
      }

      const scaledViewport = page.getViewport({ scale: effectiveScale });

      const ctx = canvas.getContext('2d');
      const devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width  = Math.floor(scaledViewport.width  * devicePixelRatio);
      canvas.height = Math.floor(scaledViewport.height * devicePixelRatio);
      canvas.style.width  = `${scaledViewport.width}px`;
      canvas.style.height = `${scaledViewport.height}px`;

      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const renderContext = {
        canvasContext: ctx,
        viewport: scaledViewport,
        background: darkMode ? 'transparent' : 'white',
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;

      // ── Text layer for search/selection ──
      if (textLayer) {
        textLayer.innerHTML = '';
        textLayer.style.width  = `${scaledViewport.width}px`;
        textLayer.style.height = `${scaledViewport.height}px`;

        const textContent = await page.getTextContent();
        const textItems = textContent.items;

        textItems.forEach((item) => {
          if (!item.str) return;
          const tx = pdfjsLib.Util.transform(scaledViewport.transform, item.transform);
          const span = document.createElement('span');
          span.textContent = item.str;
          span.style.cssText = `
            position: absolute;
            left: ${tx[4]}px;
            top: ${tx[5]}px;
            font-size: ${Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])}px;
            font-family: sans-serif;
            transform-origin: 0% 0%;
            white-space: pre;
            color: transparent;
            cursor: text;
            user-select: text;
          `;
          textLayer.appendChild(span);
        });

        // Highlight search query
        if (searchQuery && searchQuery.length > 1) {
          highlightSearch(textLayer, searchQuery);
        }
      }

      setIsRendering(false);
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        setRenderError('Render error: ' + err.message);
        setIsRendering(false);
      }
    }
  }, [currentPage, scale, fitWidth, darkMode, searchQuery]);

  useEffect(() => {
    if (pdfRef.current) renderPage();
  }, [renderPage]);

  function highlightSearch(container, query) {
    const spans = container.querySelectorAll('span');
    const lq = query.toLowerCase();
    spans.forEach((span) => {
      if (span.textContent.toLowerCase().includes(lq)) {
        span.style.color = 'rgba(255,220,0,0.6)';
        span.style.backgroundColor = 'rgba(255,220,0,0.3)';
      }
    });
  }

  // ── Scroll-based page tracking ──
  function handleScroll() {
    // Single page view — no scroll paging needed here.
    // Multi-page scroll could be added in future.
  }

  return (
    <div
      className={`pdf-viewer ${darkMode ? 'dark' : 'light'}`}
      ref={containerRef}
      onScroll={handleScroll}
    >
      {isRendering && <div className="render-spinner" />}
      {renderError && <div className="render-error">{renderError}</div>}

      <div className="page-wrapper">
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="text-layer" />
      </div>
    </div>
  );
}
