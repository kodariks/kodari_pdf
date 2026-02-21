import { useEffect, useRef, useState } from 'react';
import AnnotationsPanel from './AnnotationsPanel.jsx';

const THUMB_WIDTH = 160;

// ── Lazy thumbnail ─────────────────────────────────────────────────────────
function Thumbnail({ pdf, pageNum, isActive, onClick }) {
  const canvasRef  = useRef(null);
  const wrapRef    = useRef(null);
  const [rendered, setRendered] = useState(false);

  // Render only when the thumbnail scrolls into view
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !rendered) renderThumb();
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pdf, pageNum, rendered]);

  async function renderThumb() {
    if (!pdf) return;
    try {
      const page     = await pdf.getPage(pageNum);
      const baseVP   = page.getViewport({ scale: 1 });
      const scale    = THUMB_WIDTH / baseVP.width;
      const vp       = page.getViewport({ scale });
      const canvas   = canvasRef.current;
      if (!canvas) return;

      // Render at higher resolution for sharp thumbnails on HiDPI screens
      const dpr = window.devicePixelRatio || 1;
      canvas.width   = Math.floor(vp.width  * dpr);
      canvas.height  = Math.floor(vp.height * dpr);
      canvas.style.width  = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, vp.width, vp.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      setRendered(true);
    } catch (_) {}
  }

  return (
    <button
      className={`thumb-item ${isActive ? 'active' : ''}`}
      onClick={() => onClick(pageNum)}
      aria-label={`Page ${pageNum}`}
      aria-current={isActive}
    >
      <div className="thumb-canvas-wrap" ref={wrapRef}>
        {!rendered && <div className="thumb-placeholder" />}
        <canvas
          ref={canvasRef}
          className="thumb-canvas"
          style={{ display: rendered ? 'block' : 'none' }}
        />
      </div>
      <span className="thumb-label">{pageNum}</span>
    </button>
  );
}

// ── Outline / Bookmarks ────────────────────────────────────────────────────
function OutlineItem({ item, pdf, onPageSelect, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1);

  async function handleClick() {
    if (!item.dest && !item.url) return;
    try {
      let pageIndex = 0;
      if (typeof item.dest === 'string') {
        const dest = await pdf.getDestination(item.dest);
        const ref  = await pdf.getPageIndex(dest[0]);
        pageIndex  = ref;
      } else if (Array.isArray(item.dest)) {
        pageIndex  = await pdf.getPageIndex(item.dest[0]);
      } else if (item.url) {
        window.open(item.url, '_blank', 'noopener');
        return;
      }
      onPageSelect(pageIndex + 1);
    } catch (_) {}
  }

  return (
    <li className="outline-item">
      <div className="outline-row" style={{ paddingLeft: `${10 + depth * 14}px` }}>
        {item.items?.length > 0 && (
          <button
            className="outline-toggle"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        <button className="outline-label" onClick={handleClick} title={item.title}>
          {item.title || '(Untitled)'}
        </button>
      </div>
      {open && item.items?.length > 0 && (
        <ul className="outline-list">
          {item.items.map((child, i) => (
            <OutlineItem key={i} item={child} pdf={pdf} onPageSelect={onPageSelect} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────
export default function Sidebar({ pdf, numPages, currentPage, onPageSelect, annotations, onDeleteAnnotation }) {
  const [tab, setTab]         = useState('thumbs');  // 'thumbs' | 'outline' | 'annotations'
  const [outline, setOutline] = useState(null);
  const activeRef             = useRef(null);

  // Load outline once
  useEffect(() => {
    if (!pdf) return;
    pdf.getOutline().then((ol) => setOutline(ol)).catch(() => setOutline([]));
  }, [pdf]);

  // Scroll active thumbnail into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  if (!pdf || numPages === 0) {
    return <aside className="sidebar"><div className="sidebar-loading">Loading…</div></aside>;
  }

  return (
    <aside className="sidebar">
      {/* Tab bar */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'thumbs' ? 'active' : ''}`}
          onClick={() => setTab('thumbs')}
          title="Page thumbnails"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <button
          className={`sidebar-tab ${tab === 'outline' ? 'active' : ''}`}
          onClick={() => setTab('outline')}
          title="Bookmarks / Outline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <polyline points="3 6 4 7 6 5"/>
            <polyline points="3 12 4 13 6 11"/>
            <polyline points="3 18 4 19 6 17"/>
          </svg>
        </button>
        <button
          className={`sidebar-tab ${tab === 'annotations' ? 'active' : ''}`}
          onClick={() => setTab('annotations')}
          title="Annotations"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>

      {/* Thumbnails */}
      {tab === 'thumbs' && (
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
      )}

      {/* Outline */}
      {tab === 'outline' && (
        <div className="sidebar-outline">
          {!outline && <div className="sidebar-loading">Loading…</div>}
          {outline && outline.length === 0 && (
            <div className="sidebar-loading" style={{ padding: '20px', textAlign: 'center' }}>
              No bookmarks in this document.
            </div>
          )}
          {outline && outline.length > 0 && (
            <ul className="outline-list">
              {outline.map((item, i) => (
                <OutlineItem key={i} item={item} pdf={pdf} onPageSelect={onPageSelect} depth={0} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Annotations */}
      {tab === 'annotations' && (
        <div className="sidebar-inner">
          <AnnotationsPanel
            annotations={annotations || []}
            onPageSelect={onPageSelect}
            onDeleteAnnotation={onDeleteAnnotation || (() => {})}
          />
        </div>
      )}
    </aside>
  );
}
