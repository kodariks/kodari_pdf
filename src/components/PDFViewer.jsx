import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { AnnotationLayer as PdfjsAnnotationLayer } from 'pdfjs-dist';
import AnnotationLayer from './AnnotationLayer.jsx';
import { useAnnotations } from '../hooks/useAnnotations.js';
import { useFormData } from '../hooks/useFormData.js';
import { viewportToPdfRect } from '../utils/coordTransform.js';

// Minimal linkService stub required by pdfjs AnnotationLayer
const linkService = {
  getDestinationHash: () => '#',
  getAnchorUrl: () => '#',
  addLinkAttributes: () => {},
  isPageVisible: () => true,
  isPageCached: () => true,
  page: 0,
  rotation: 0,
  externalLinkEnabled: true,
  externalLinkRel: 'noopener noreferrer nofollow',
  externalLinkTarget: 2,
};

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ── Single page component ──────────────────────────────────────────────────
function PageRenderer({
  pdf, pageNum, scale, fitWidth, rotation, searchQuery, darkMode, isVisible,
  activeTool, annotationColor, annotationFontSize, strokeWidth, pendingImage, annotations,
  onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation,
  annotationStorage,
}) {
  const canvasRef    = useRef(null);
  const textLayerRef = useRef(null);
  const formLayerRef = useRef(null);
  const wrapperRef   = useRef(null);
  const renderTaskRef = useRef(null);
  const renderGenRef  = useRef(0);
  const pdfjsAnnLayerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [rendered, setRendered]     = useState(false);
  const [viewport, setViewport]     = useState(null);

  useEffect(() => {
    if (!pdf || !isVisible) return;

    const gen = ++renderGenRef.current;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
      renderTaskRef.current = null;
    }

    let cancelled = false;

    (async () => {
      const canvas    = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas) return;

      try {
        const page     = await pdf.getPage(pageNum);
        if (cancelled || gen !== renderGenRef.current) return;

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
        setViewport(vp);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vp.width, vp.height);

        if (cancelled || gen !== renderGenRef.current) return;

        // annotationMode 2 = ENABLE_FORMS: skip painting form widget
        // appearances on the canvas (they render as HTML inputs instead)
        const task = page.render({
          canvasContext: ctx,
          viewport: vp,
          annotationMode: 2,
        });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;

        if (cancelled || gen !== renderGenRef.current) return;

        // ── Text layer ──────────────────────────────────────────────
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width  = `${vp.width}px`;
          textLayer.style.height = `${vp.height}px`;

          const textContent = await page.getTextContent();
          if (cancelled || gen !== renderGenRef.current) return;

          textContent.items.forEach((item) => {
            if (!item.str) return;
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const angle      = Math.atan2(tx[1], tx[0]);
            const fontSize   = Math.hypot(tx[0], tx[1]);
            const span       = document.createElement('span');
            span.textContent = item.str;

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

        // ── Form layer (pdfjs AnnotationLayer) ───────────────────────
        const formLayer = formLayerRef.current;
        if (formLayer) {
          formLayer.innerHTML = '';
          formLayer.style.setProperty('--scale-factor', effScale);

          try {
            const allAnnotations = await page.getAnnotations({ intent: 'display' });
            if (cancelled || gen !== renderGenRef.current) return;

            // Filter to form widgets (type 20) and their popups (type 16)
            // Excludes link annotations that cause full-page yellow overlays
            const WIDGET = 20;
            const POPUP  = 16;
            const formAnnotations = allAnnotations.filter(
              (a) => a.annotationType === WIDGET || a.annotationType === POPUP
            );

            // Only render if there are form widgets to show
            if (formAnnotations.length > 0) {
              const annLayer = new PdfjsAnnotationLayer({
                div: formLayer,
                page,
                viewport: vp,
              });
              await annLayer.render({
                annotations: formAnnotations,
                page,
                viewport: vp,
                renderForms: true,
                annotationStorage: annotationStorage || undefined,
                linkService,
              });
              pdfjsAnnLayerRef.current = annLayer;
            }
          } catch (formErr) {
            // Form layer errors are non-fatal
            console.warn('Form layer render error:', formErr);
          }
        }

        setRendered(true);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNum, scale, fitWidth, rotation, searchQuery, darkMode, isVisible]);

  // ── Text highlight creation via mouseup ──────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const textLayer = textLayerRef.current;
    if (!wrapper || !textLayer || activeTool !== 'highlight' || !viewport) return;

    function handleMouseUp() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      const layerBounds = textLayer.getBoundingClientRect();

      const pdfRects = clientRects
        .filter((r) => {
          // Only include rects that overlap with this page's text layer
          return (
            r.right > layerBounds.left &&
            r.left < layerBounds.right &&
            r.bottom > layerBounds.top &&
            r.top < layerBounds.bottom &&
            r.width > 0 && r.height > 0
          );
        })
        .map((r) => {
          const relRect = {
            x: r.left - layerBounds.left,
            y: r.top - layerBounds.top,
            w: r.width,
            h: r.height,
          };
          return viewportToPdfRect(relRect, viewport);
        });

      if (pdfRects.length === 0) return;

      const text = selection.toString();
      selection.removeAllRanges();

      onAddAnnotation({
        type: 'highlight',
        page: pageNum,
        color: annotationColor,
        rects: pdfRects,
        text,
      });
    }

    wrapper.addEventListener('mouseup', handleMouseUp);
    return () => wrapper.removeEventListener('mouseup', handleMouseUp);
  }, [activeTool, viewport, pageNum, annotationColor, onAddAnnotation]);

  // Toggle text layer pointer-events based on active tool
  const textLayerInteractive = activeTool === 'cursor' || activeTool === 'highlight';

  return (
    <div
      ref={wrapperRef}
      className={`page-wrapper ${activeTool === 'highlight' ? 'highlight-mode' : ''}`}
      style={{ width: dimensions.w || 'auto', height: dimensions.h || 200 }}
      data-page={pageNum}
    >
      {!rendered && <div className="page-placeholder" />}
      <canvas ref={canvasRef} className="pdf-canvas" />

      {/* Custom annotation layer — between canvas and form layer */}
      <AnnotationLayer
        annotations={annotations}
        viewport={viewport}
        pageNum={pageNum}
        activeTool={activeTool}
        annotationColor={annotationColor}
        annotationFontSize={annotationFontSize}
        strokeWidth={strokeWidth}
        pendingImage={pendingImage}
        onAddAnnotation={onAddAnnotation}
        onUpdateAnnotation={onUpdateAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
      />

      <div
        ref={textLayerRef}
        className="text-layer"
        style={{ pointerEvents: activeTool === 'highlight' ? 'auto' : 'none' }}
      />

      {/* pdfjs form layer — renders interactive form widgets (on top of text layer) */}
      <div
        ref={formLayerRef}
        className="pdfjs-form-layer annotationLayer"
        style={{
          pointerEvents: textLayerInteractive ? 'auto' : 'none',
        }}
      />
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
  pdfName,
  password,
  currentPage,
  scale,
  rotation,
  searchQuery,
  darkMode,
  activeTool,
  annotationColor,
  annotationFontSize,
  strokeWidth,
  pendingImage,
  onDocumentLoad,
  onPageChange,
  onPasswordNeeded,
  onSearchResults,
  onAnnotationsChange,
  onHistoryReady,
}) {
  const containerRef  = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [fitWidth, setFitWidth] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [visiblePages, setVisiblePages] = useState(new Set([1]));
  const scrollingToPage = useRef(false);
  const pageRefs = useRef({});

  // ── Annotations (per-viewer, backed by localStorage) ──
  const {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getPageAnnotations,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAnnotations(pdfName);

  // ── Form data (AnnotationStorage for pdfjs form fields) ──
  const [formStorage, setFormStorage] = useState(null);
  useFormData(pdfName, formStorage);

  // Notify parent when annotations change (for sidebar panel)
  useEffect(() => {
    if (onAnnotationsChange) onAnnotationsChange(annotations, deleteAnnotation);
  }, [annotations]);

  // Expose undo/redo to parent
  useEffect(() => {
    if (onHistoryReady) onHistoryReady({ undo, redo, canUndo, canRedo });
  }, [undo, redo, canUndo, canRedo]);

  // ── Load document ──
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;
    const params = { data: pdfData.slice(0) };
    if (password) params.password = password;

    const task = pdfjsLib.getDocument(params);

    task.onPassword = (updatePassword, reason) => {
      if (onPasswordNeeded) onPasswordNeeded(pdfData, '');
    };

    task.promise.then((doc) => {
      if (cancelled) return;
      setPdf(doc);
      setNumPages(doc.numPages);
      setFormStorage(doc.annotationStorage);
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
              activeTool={activeTool || 'cursor'}
              annotationColor={annotationColor || '#FFEA00'}
              annotationFontSize={annotationFontSize || 14}
              strokeWidth={strokeWidth || 2}
              pendingImage={pendingImage || null}
              annotations={getPageAnnotations(n)}
              onAddAnnotation={addAnnotation}
              onUpdateAnnotation={updateAnnotation}
              onDeleteAnnotation={deleteAnnotation}
              annotationStorage={formStorage}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
