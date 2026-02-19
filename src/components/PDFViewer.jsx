import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ── Single page component ──────────────────────────────────────────────────
function PageRenderer({ pdf, pageNum, scale, fitWidth, rotation, searchQuery, darkMode, isVisible }) {
  const canvasRef    = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [rendered, setRendered]     = useState(false);

  const renderPage = useCallback(async () => {
    if (!pdf || !isVisible) return;
    const canvas    = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas) return;

    // cancel in-progress render
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
      renderTaskRef.current = null;
    }

    try {
      const page     = await pdf.getPage(pageNum);
      const baseVP   = page.getViewport({ scale: 1, rotation: rotation || 0 });
      let effScale   = scale === 0 && fitWidth > 0 ? fitWidth / baseVP.width : scale;
      if (effScale <= 0) effScale = 1;

      const vp  = page.getViewport({ scale: effScale, rotation: rotation || 0 });
      const dpr = window.devicePixelRatio || 1;

      canvas.width  = Math.floor(vp.width  * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width  = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;

      setDimensions({ w: vp.width, h: vp.height });

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Always paint white paper background (visible in dark mode too)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, vp.width, vp.height);

      const task = page.render({ canvasContext: ctx, viewport: vp });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;

      // ── Text layer ──────────────────────────────────────────────
      if (textLayer) {
        textLayer.innerHTML = '';
        textLayer.style.width  = `${vp.width}px`;
        textLayer.style.height = `${vp.height}px`;

        const textContent = await page.getTextContent();

        textContent.items.forEach((item) => {
          if (!item.str) return;
          const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
          // tx[0]=scaleX, tx[1]=skew, tx[2]=skew, tx[3]=scaleY, tx[4]=x, tx[5]=y
          const angle      = Math.atan2(tx[1], tx[0]);
          const fontSize   = Math.hypot(tx[0], tx[1]);
          const span       = document.createElement('span');
          span.textContent = item.str;

          // Adjust y: tx[5] is the baseline in CSS coords
          span.style.cssText = `
            position:absolute;
            left:${tx[4]}px;
            top:${tx[5] - fontSize}px;
            font-size:${fontSize}px;
            font-family:sans-serif;
            transform-origin:0 0;
            transform:rotate(${angle}rad);
            white-space:pre;
            color:transparent;
            cursor:text;
            user-select:text;
            line-height:1;
          `;
          textLayer.appendChild(span);
        });

        if (searchQuery && searchQuery.length > 1) {
          applySearchHighlights(textLayer, searchQuery);
        }
      }

      setRendered(true);
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Page render error:', err);
      }
    }
  }, [pdf, pageNum, scale, fitWidth, rotation, searchQuery, darkMode, isVisible]);

  useEffect(() => { renderPage(); }, [renderPage]);

  return (
    <div
      className="page-wrapper"
      style={{ width: dimensions.w || 'auto', height: dimensions.h || 200 }}
      data-page={pageNum}
    >
      {!rendered && <div className="page-placeholder" />}
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="text-layer" />
    </div>
  );
}

function applySearchHighlights(container, query) {
  const spans = container.querySelectorAll('span');
  const lq = query.toLowerCase();
  spans.forEach((span) => {
    if (span.textContent.toLowerCase().includes(lq)) {
      span.style.color           = 'rgba(0,0,0,0.01)';
      span.style.backgroundColor = 'rgba(255,210,0,0.45)';
      span.style.borderRadius    = '2px';
    } else {
      span.style.backgroundColor = '';
    }
  });
}

// ── Main viewer ───────────────────────────────────────────────────────────
export default function PDFViewer({
  pdfData,
  password,
  currentPage,
  scale,
  rotation,
  searchQuery,
  darkMode,
  onDocumentLoad,
  onPageChange,
  onPasswordNeeded,
  onSearchResults,
}) {
  const containerRef  = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [fitWidth, setFitWidth] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [visiblePages, setVisiblePages] = useState(new Set([1]));
  const scrollingToPage = useRef(false);
  const pageRefs = useRef({});

  // ── Load document ──
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;
    // Copy the data so the original ArrayBuffer in tab state isn't detached
    // when pdf.js transfers it to the Web Worker
    const params = { data: pdfData.slice(0) };
    if (password) params.password = password;

    const task = pdfjsLib.getDocument(params);

    task.onPassword = (updatePassword, reason) => {
      // reason 1 = need password, reason 2 = wrong password
      if (onPasswordNeeded) onPasswordNeeded(pdfData, '');
      // pdfjs will stall; we let the modal handle retry
    };

    task.promise.then((doc) => {
      if (cancelled) return;
      setPdf(doc);
      setNumPages(doc.numPages);
      onDocumentLoad(doc.numPages, doc);
      setRenderError(null);
    }).catch((err) => {
      if (!cancelled && err?.name !== 'PasswordException') {
        setRenderError('Failed to load PDF: ' + err.message);
      }
    });
    return () => {
      cancelled = true;
      task.destroy?.();
    };
  }, [pdfData, password]);

  // ── Fit-to-width on resize ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth - 48));
    ro.observe(el);
    setFitWidth(el.clientWidth - 48);
    return () => ro.disconnect();
  }, []);

  // ── Track which pages are visible via IntersectionObserver ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const n = Number(e.target.dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          });
          return next;
        });

        // Update current page to the most-visible page
        if (!scrollingToPage.current) {
          let bestPage = currentPage;
          let bestRatio = 0;
          entries.forEach((e) => {
            if (e.intersectionRatio > bestRatio) {
              bestRatio = e.intersectionRatio;
              bestPage  = Number(e.target.dataset.page);
            }
          });
          if (bestPage !== currentPage && bestRatio > 0.4) {
            onPageChange(bestPage);
          }
        }
      },
      { root: container, threshold: [0, 0.1, 0.4, 0.7, 1] }
    );

    // Observe all page wrappers
    const wrappers = container.querySelectorAll('.page-wrapper[data-page]');
    wrappers.forEach((w) => io.observe(w));

    return () => io.disconnect();
  }, [numPages, pdf]);

  // ── Scroll to page when currentPage changes externally ──
  useEffect(() => {
    const el = pageRefs.current[currentPage];
    if (!el) return;
    scrollingToPage.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { scrollingToPage.current = false; }, 800);
  }, [currentPage]);

  // ── Ctrl+Scroll to zoom ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Expose zoom callbacks via window event
      window.dispatchEvent(new CustomEvent('pdf-zoom', { detail: { delta: e.deltaY } }));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (renderError) {
    return (
      <div className="pdf-viewer" ref={containerRef}>
        <div className="render-error">{renderError}</div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      <div className="pages-stack">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            ref={(el) => { pageRefs.current[n] = el; }}
            className="page-row"
          >
            <PageRenderer
              pdf={pdf}
              pageNum={n}
              scale={scale}
              fitWidth={fitWidth}
              rotation={rotation}
              searchQuery={searchQuery}
              darkMode={darkMode}
              isVisible={visiblePages.has(n) || Math.abs(n - currentPage) <= 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
