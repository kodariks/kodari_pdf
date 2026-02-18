import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const THUMB_WIDTH = 160;

function Thumbnail({ pdf, pageNum, isActive, onClick }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / viewport.width;
      const scaledVP = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width  = scaledVP.width;
      canvas.height = scaledVP.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: scaledVP }).promise;
      if (!cancelled) setRendered(true);
    })();
    return () => { cancelled = true; };
  }, [pdf, pageNum]);

  return (
    <button
      className={`thumb-item ${isActive ? 'active' : ''}`}
      onClick={() => onClick(pageNum)}
      aria-label={`Go to page ${pageNum}`}
      aria-current={isActive}
    >
      <div className="thumb-canvas-wrap">
        {!rendered && <div className="thumb-placeholder" />}
        <canvas ref={canvasRef} className="thumb-canvas" />
      </div>
      <span className="thumb-label">{pageNum}</span>
    </button>
  );
}

export default function Sidebar({ pdfData, numPages, currentPage, onPageSelect }) {
  const [pdf, setPdf] = useState(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;
    const task = pdfjsLib.getDocument({ data: pdfData });
    task.promise.then((doc) => { if (!cancelled) setPdf(doc); });
    return () => { cancelled = true; task.destroy?.(); };
  }, [pdfData]);

  // Scroll active thumbnail into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  if (!pdf || numPages === 0) {
    return <aside className="sidebar"><div className="sidebar-loading">Loading…</div></aside>;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <div key={n} ref={n === currentPage ? activeRef : null}>
            <Thumbnail
              pdf={pdf}
              pageNum={n}
              isActive={n === currentPage}
              onClick={onPageSelect}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
