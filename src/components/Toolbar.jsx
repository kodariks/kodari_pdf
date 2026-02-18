import { useState, useRef, useEffect } from 'react';

const ZOOM_PRESETS = [
  { label: '50%',   value: 0.5  },
  { label: '75%',   value: 0.75 },
  { label: '100%',  value: 1.0  },
  { label: '125%',  value: 1.25 },
  { label: '150%',  value: 1.5  },
  { label: '175%',  value: 1.75 },
  { label: '200%',  value: 2.0  },
  { label: '300%',  value: 3.0  },
  { label: 'Fit Width', value: 0 },
];

export default function Toolbar({
  pdfName,
  currentPage,
  numPages,
  scale,
  darkMode,
  sidebarOpen,
  searchQuery,
  searchCount,
  searchIndex,
  isElectron,
  onOpenFile,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomFit,
  onZoomSet,
  onToggleDark,
  onToggleSidebar,
  onSearchChange,
  onSearchNext,
  onSearchPrev,
  onPrint,
  onFullscreen,
  onRotate,
}) {
  const [pageInput,   setPageInput]   = useState('');
  const [zoomOpen,    setZoomOpen]    = useState(false);
  const zoomRef = useRef(null);
  const searchRef = useRef(null);

  // Close zoom dropdown on outside click
  useEffect(() => {
    if (!zoomOpen) return;
    function handler(e) {
      if (zoomRef.current && !zoomRef.current.contains(e.target)) setZoomOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [zoomOpen]);

  // Ctrl+F focuses search
  useEffect(() => {
    function handler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function handlePageSubmit(e) {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) onPageChange(n);
    setPageInput('');
  }

  const scaleLabel = scale === 0
    ? 'Fit Width'
    : `${Math.round(scale * 100)}%`;

  return (
    <header className="toolbar">

      {/* ── Left ─────────────────────────────────── */}
      <div className="tb-group tb-left">
        <button
          className="tb-btn icon-btn"
          title={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        <button className="tb-btn primary-btn" onClick={onOpenFile} title="Open PDF (Ctrl+O)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Open PDF
        </button>

        {pdfName && (
          <span className="pdf-name" title={pdfName}>
            {pdfName.length > 32 ? '…' + pdfName.slice(-30) : pdfName}
          </span>
        )}
      </div>

      {/* ── Center – navigation ───────────────────── */}
      {numPages > 0 && (
        <div className="tb-group tb-center">
          <button
            className="tb-btn icon-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            title="Previous page (←)"
            aria-label="Previous page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <form onSubmit={handlePageSubmit} className="page-form">
            <input
              type="number"
              className="page-input"
              value={pageInput !== '' ? pageInput : currentPage}
              min={1}
              max={numPages}
              onChange={(e) => setPageInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setPageInput('')}
              aria-label="Page number"
            />
            <span className="page-sep">/ {numPages}</span>
          </form>

          <button
            className="tb-btn icon-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= numPages}
            title="Next page (→)"
            aria-label="Next page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Right – zoom / search / actions ──────── */}
      <div className="tb-group tb-right">

        {numPages > 0 && (
          <>
            {/* Search */}
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search… (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.shiftKey ? onSearchPrev?.() : onSearchNext?.();
                  if (e.key === 'Escape') onSearchChange('');
                }}
                className="search-input"
                aria-label="Search in PDF"
              />
              {searchQuery && searchCount > 0 && (
                <span className="search-count">{searchIndex + 1}/{searchCount}</span>
              )}
              {searchQuery && searchCount === 0 && (
                <span className="search-count no-match">0/0</span>
              )}
              {searchQuery && (
                <>
                  <button className="search-nav-btn" onClick={onSearchPrev} title="Previous match (Shift+Enter)">‹</button>
                  <button className="search-nav-btn" onClick={onSearchNext} title="Next match (Enter)">›</button>
                  <button className="search-nav-btn" onClick={() => onSearchChange('')} title="Clear search">✕</button>
                </>
              )}
            </div>

            {/* Zoom controls */}
            <div className="zoom-group" ref={zoomRef}>
              <button className="tb-btn icon-btn" onClick={onZoomOut} title="Zoom out (-)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>

              <div className="zoom-dropdown-wrap">
                <button
                  className="tb-btn zoom-label"
                  onClick={() => setZoomOpen((o) => !o)}
                  title="Zoom level — click for presets"
                >
                  {scaleLabel} ▾
                </button>
                {zoomOpen && (
                  <ul className="zoom-dropdown">
                    {ZOOM_PRESETS.map((p) => (
                      <li key={p.label}>
                        <button
                          className={`zoom-option ${scale === p.value ? 'active' : ''}`}
                          onClick={() => { onZoomSet(p.value); setZoomOpen(false); }}
                        >
                          {p.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button className="tb-btn icon-btn" onClick={onZoomIn} title="Zoom in (+)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
            </div>

            {/* Rotate */}
            <button className="tb-btn icon-btn" onClick={() => onRotate?.('cw')} title="Rotate clockwise">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>

            {/* Print */}
            <button className="tb-btn icon-btn" onClick={onPrint} title="Print (Ctrl+P)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>

            {/* Fullscreen */}
            <button className="tb-btn icon-btn" onClick={onFullscreen} title="Fullscreen (F11)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          </>
        )}

        {/* Dark / Light mode */}
        <button
          className="tb-btn icon-btn"
          onClick={onToggleDark}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
