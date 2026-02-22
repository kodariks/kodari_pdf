import { useState, useRef, useEffect } from 'react';

// ── Tools menu items ─────────────────────────────────────────────
const TOOLS_MENU = [
  { id: 'merge',       label: 'Merge Files',       icon: '⊕', desc: 'Combine multiple PDFs into one' },
  { id: 'split',       label: 'Split File',        icon: '⊘', desc: 'Divide PDF into multiple files' },
  { id: 'compress',    label: 'Compress',          icon: '⊙', desc: 'Reduce PDF file size' },
  'separator',
  { id: 'protect',     label: 'Protect PDF',       icon: '🔒', desc: 'Password-encrypt the PDF' },
  { id: 'unlock',      label: 'Unlock PDF',        icon: '🔓', desc: 'Remove password protection' },
  'separator',
  { id: 'pagenumbers', label: 'Add Page Numbers',  icon: '#',  desc: 'Number pages automatically' },
  { id: 'rearrange',   label: 'Rearrange Pages',   icon: '⇅',  desc: 'Reorder, delete, rotate pages' },
  'separator',
  { id: 'imagetopdf',  label: 'Image to PDF',      icon: '🖼', desc: 'Convert JPEG/PNG to PDF'     },
  { id: 'wordtopdf',   label: 'Word to PDF',        icon: '📄', desc: 'Convert .docx to PDF'        },
  'separator',
  { id: 'toimage',     label: 'PDF to Image',       icon: '🖼', desc: 'Export pages as JPEG/PNG'    },
  { id: 'toword',      label: 'PDF to Word',        icon: '📝', desc: 'Export text as .docx'        },
  { id: 'toexcel',     label: 'PDF to Excel',       icon: '📊', desc: 'Export tables as .xlsx'      },
  'separator',
  { id: 'compare',     label: 'Compare PDFs',       icon: '⇔',  desc: 'View two PDFs side by side'  },
];

const ANNOTATION_COLORS = [
  '#FFEA00', // yellow
  '#76FF03', // green
  '#00E5FF', // cyan
  '#FF6E40', // orange
  '#E040FB', // purple
  '#FF1744', // red
];

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
  activeTool,
  annotationColor,
  annotationFontSize,
  strokeWidth,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onFontSizeChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onAddImageClick,
  onSignClick,
  onExportPDF,
  viewMode,
  onViewModeChange,
  onToolsAction,
}) {
  const [pageInput,   setPageInput]   = useState('');
  const [zoomOpen,    setZoomOpen]    = useState(false);
  const [colorOpen,   setColorOpen]   = useState(false);
  const [toolsOpen,   setToolsOpen]   = useState(false);
  const zoomRef   = useRef(null);
  const searchRef = useRef(null);
  const colorRef  = useRef(null);
  const toolsRef  = useRef(null);

  // Close zoom dropdown on outside click
  useEffect(() => {
    if (!zoomOpen) return;
    function handler(e) {
      if (zoomRef.current && !zoomRef.current.contains(e.target)) setZoomOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [zoomOpen]);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorOpen) return;
    function handler(e) {
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorOpen]);

  // Close tools menu on outside click
  useEffect(() => {
    if (!toolsOpen) return;
    function handler(e) {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [toolsOpen]);

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

        {/* Tools dropdown */}
        <div className="tools-menu-wrap" ref={toolsRef}>
          <button
            className="tb-btn icon-btn"
            title="PDF Tools"
            onClick={() => setToolsOpen((o) => !o)}
            aria-label="PDF Tools menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5"  r="1" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>
            </svg>
            Tools ▾
          </button>
          {toolsOpen && (
            <div className="tools-menu">
              {TOOLS_MENU.map((item, i) =>
                item === 'separator'
                  ? <div key={i} className="tools-menu-separator" />
                  : (
                    <button
                      key={item.id}
                      className="tools-menu-item"
                      onClick={() => { setToolsOpen(false); onToolsAction?.(item.id); }}
                      title={item.desc}
                    >
                      <span style={{ fontSize: 16, minWidth: 20, textAlign: 'center' }}>{item.icon}</span>
                      {item.label}
                    </button>
                  )
              )}
            </div>
          )}
        </div>

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

      {/* ── Annotation tools ──────────────────────── */}
      {numPages > 0 && onToolChange && (
        <div className="tb-group tb-annotations">
          {/* Undo */}
          <button
            className="tb-btn icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 14 4 9 9 4"/>
              <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>

          {/* Redo */}
          <button
            className="tb-btn icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 14 20 9 15 4"/>
              <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
            </svg>
          </button>

          <div className="tb-divider" />

          {/* Cursor (default) */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'cursor' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('cursor')}
            title="Select / Cursor (Esc)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
              <path d="M13 13l6 6"/>
            </svg>
          </button>

          {/* Highlight */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'highlight' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('highlight')}
            title="Highlight text (H)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>

          {/* Sticky note */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'note' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('note')}
            title="Sticky note (N)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>

          {/* Freehand draw */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'draw' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('draw')}
            title="Freehand draw (D)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>

          {/* Line width (shown when draw is active) */}
          {activeTool === 'draw' && (
            <select
              className="modal-input"
              style={{ width: 54, padding: '2px 4px', fontSize: 12 }}
              value={strokeWidth || 2}
              onChange={(e) => onStrokeWidthChange?.(Number(e.target.value))}
              title="Stroke width"
            >
              <option value={1}>1px</option>
              <option value={2}>2px</option>
              <option value={4}>4px</option>
              <option value={6}>6px</option>
              <option value={10}>10px</option>
            </select>
          )}

          {/* Eraser */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'eraser' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('eraser')}
            title="Eraser (E)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.83 0L20 9.59a2 2 0 0 1 0 2.83L12.42 20"/>
              <line x1="18" y1="12.41" x2="11.59" y2="6"/>
            </svg>
          </button>

          {/* Add Text */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'add-text' ? 'tool-active' : ''}`}
            onClick={() => onToolChange('add-text')}
            title="Add Text (T)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>

          {/* Add Image */}
          <button
            className={`tb-btn icon-btn ${activeTool === 'add-image' ? 'tool-active' : ''}`}
            onClick={() => onAddImageClick?.()}
            title="Add Image"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>

          {/* Sign Document */}
          <button
            className="tb-btn icon-btn"
            onClick={() => onSignClick?.()}
            title="Sign Document"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5"/>
              <path d="M8 17.37l1.68-5.06 8.84-8.84a1.5 1.5 0 0 1 2.12 2.12L11.8 14.43z"/>
            </svg>
          </button>

          {/* Font size (shown when add-text is active) */}
          {activeTool === 'add-text' && (
            <input
              type="number"
              min={8} max={72}
              className="modal-input"
              style={{ width: 52, padding: '2px 4px', fontSize: 12 }}
              value={annotationFontSize || 14}
              onChange={(e) => onFontSizeChange?.(Math.min(72, Math.max(8, parseInt(e.target.value) || 14)))}
              title="Font size"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* Color picker */}
          <div className="ann-color-wrap" ref={colorRef}>
            <button
              className="tb-btn icon-btn ann-color-btn"
              onClick={() => setColorOpen((o) => !o)}
              title="Annotation color"
            >
              <span className="ann-color-dot" style={{ background: annotationColor || '#FFEA00' }} />
            </button>
            {colorOpen && (
              <div className="ann-color-picker">
                {ANNOTATION_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`ann-color-swatch ${c === annotationColor ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => { onColorChange(c); setColorOpen(false); }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>
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

            {/* Export annotated PDF */}
            <button
              className="tb-btn icon-btn"
              onClick={onExportPDF}
              title="Export PDF with annotations"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
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

            {/* Two-page / Side-by-side view */}
            <button
              className={`tb-btn icon-btn${viewMode === 'double' ? ' active' : ''}`}
              onClick={() => onViewModeChange(viewMode === 'double' ? 'single' : 'double')}
              title={viewMode === 'double' ? 'Single page view' : 'Two-page spread view'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1"  y="3" width="9" height="18" rx="1"/>
                <rect x="14" y="3" width="9" height="18" rx="1"/>
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
