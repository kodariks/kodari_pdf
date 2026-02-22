/**
 * CompareView — Side-by-side PDF comparison viewer.
 * Left pane shows the currently active PDF; right pane lets the user
 * pick a second PDF.  "Sync Scroll" links the page position of both viewers.
 */
import { useState, useRef, useCallback } from 'react';
import PDFViewer from './PDFViewer.jsx';

const noop = () => {};

export default function CompareView({ leftPdfData, leftPdfName, darkMode, onClose }) {
  // ── Right-pane PDF state ──
  const [rightPdfData, setRightPdfData] = useState(null);
  const [rightPdfName, setRightPdfName] = useState('');
  const [dragOver, setDragOver]         = useState(false);

  // ── Per-viewer state ──
  const [leftPage,     setLeftPage]     = useState(1);
  const [rightPage,    setRightPage]    = useState(1);
  const [leftNumPages, setLeftNumPages] = useState(0);
  const [rightNumPages,setRightNumPages]= useState(0);
  const [leftScale,    setLeftScale]    = useState(0); // 0 = fit-width
  const [rightScale,   setRightScale]   = useState(0);

  // ── Sync scroll ──
  const [syncScroll, setSyncScroll] = useState(true);
  const syncingRef = useRef(false); // prevent feedback loop

  const fileInputRef = useRef(null);

  // ── Load right PDF from File ──
  function loadRightFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setRightPdfData(new Uint8Array(e.target.result));
      setRightPdfName(file.name);
      setRightPage(1);
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Page change with sync ──
  const handleLeftPageChange = useCallback((page) => {
    setLeftPage(page);
    if (syncScroll && !syncingRef.current) {
      syncingRef.current = true;
      setRightPage((prev) => {
        const clamped = rightNumPages > 0 ? Math.min(page, rightNumPages) : page;
        return clamped;
      });
      requestAnimationFrame(() => { syncingRef.current = false; });
    }
  }, [syncScroll, rightNumPages]);

  const handleRightPageChange = useCallback((page) => {
    setRightPage(page);
    if (syncScroll && !syncingRef.current) {
      syncingRef.current = true;
      setLeftPage((prev) => {
        const clamped = leftNumPages > 0 ? Math.min(page, leftNumPages) : page;
        return clamped;
      });
      requestAnimationFrame(() => { syncingRef.current = false; });
    }
  }, [syncScroll, leftNumPages]);

  // ── Zoom helpers ──
  function zoomIn(side)  { (side === 'left' ? setLeftScale : setRightScale)((s) => Math.min((s || 1) + 0.25, 4)); }
  function zoomOut(side) { (side === 'left' ? setLeftScale : setRightScale)((s) => Math.max((s || 1) - 0.25, 0.25)); }
  function zoomFit(side) { (side === 'left' ? setLeftScale : setRightScale)(() => 0); }

  return (
    <div className="compare-view">

      {/* ── Top bar ── */}
      <div className="compare-topbar">
        <div className="compare-topbar-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="1"  y="3" width="9" height="18" rx="1"/>
            <rect x="14" y="3" width="9" height="18" rx="1"/>
          </svg>
          <span>PDF Compare</span>
        </div>

        <div className="compare-topbar-center">
          {/* Sync scroll toggle */}
          <button
            className={`tb-btn compare-sync-btn${syncScroll ? ' active' : ''}`}
            onClick={() => setSyncScroll((s) => !s)}
            title={syncScroll ? 'Disable synchronized scrolling' : 'Enable synchronized scrolling'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 0-2 2h-3"/>
            </svg>
            Sync Scroll
          </button>
        </div>

        <div className="compare-topbar-right">
          <button className="tb-btn" onClick={onClose} title="Close compare mode">
            ✕ Close Compare
          </button>
        </div>
      </div>

      {/* ── Split panes ── */}
      <div className="compare-panes">

        {/* Left pane — PDF A */}
        <div className="compare-pane">
          <div className="compare-pane-header">
            <span className="compare-pane-label" title={leftPdfName || 'PDF A'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {leftPdfName || 'PDF A'}
            </span>
            <div className="compare-pane-zoom">
              <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomOut('left')} title="Zoom out">−</button>
              <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomFit('left')} title="Fit width">⊡</button>
              <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomIn('left')}  title="Zoom in">+</button>
            </div>
            <span className="compare-page-info">
              {leftPage}/{leftNumPages || '?'}
            </span>
          </div>
          <div className="compare-pane-body">
            {leftPdfData ? (
              <PDFViewer
                pdfData={leftPdfData}
                pdfName={leftPdfName}
                currentPage={leftPage}
                scale={leftScale}
                darkMode={darkMode}
                activeTool="cursor"
                annotationColor="#FFEA00"
                annotationFontSize={14}
                strokeWidth={2}
                onDocumentLoad={(n) => setLeftNumPages(n)}
                onPageChange={handleLeftPageChange}
                onSearchResults={noop}
                onAnnotationsChange={noop}
              />
            ) : (
              <div className="compare-empty">No PDF loaded</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="compare-divider" />

        {/* Right pane — PDF B */}
        <div className="compare-pane">
          <div className="compare-pane-header">
            <span className="compare-pane-label" title={rightPdfName || 'PDF B'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {rightPdfName || 'PDF B'}
            </span>
            {rightPdfData && (
              <div className="compare-pane-zoom">
                <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomOut('right')} title="Zoom out">−</button>
                <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomFit('right')} title="Fit width">⊡</button>
                <button className="tb-btn icon-btn tiny-btn" onClick={() => zoomIn('right')}  title="Zoom in">+</button>
              </div>
            )}
            {rightPdfData && (
              <span className="compare-page-info">
                {rightPage}/{rightNumPages || '?'}
              </span>
            )}
            <button
              className="tb-btn tiny-btn"
              onClick={() => fileInputRef.current?.click()}
              title={rightPdfData ? 'Load a different PDF' : 'Load second PDF'}
              style={{ marginLeft: 'auto', fontSize: 11 }}
            >
              {rightPdfData ? '↺ Change' : '+ Load PDF'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { loadRightFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
          <div
            className={`compare-pane-body${dragOver ? ' drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); loadRightFile(e.dataTransfer.files?.[0]); }}
          >
            {rightPdfData ? (
              <PDFViewer
                pdfData={rightPdfData}
                pdfName={rightPdfName}
                currentPage={rightPage}
                scale={rightScale}
                darkMode={darkMode}
                activeTool="cursor"
                annotationColor="#FFEA00"
                annotationFontSize={14}
                strokeWidth={2}
                onDocumentLoad={(n) => setRightNumPages(n)}
                onPageChange={handleRightPageChange}
                onSearchResults={noop}
                onAnnotationsChange={noop}
              />
            ) : (
              <div
                className="compare-drop-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="36"
                  style={{ opacity: 0.4 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="12" x2="12" y2="18"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <span>Click or drag &amp; drop a PDF to compare</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
