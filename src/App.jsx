import { useState, useEffect, useCallback, useRef } from 'react';
import PDFViewer from './components/PDFViewer.jsx';
import Toolbar from './components/Toolbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import DropZone from './components/DropZone.jsx';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
const MAX_RECENT = 8;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem('kodari_recent') || '[]'); } catch { return []; }
}
function saveRecent(name) {
  const list = [name, ...loadRecent().filter((n) => n !== name)].slice(0, MAX_RECENT);
  localStorage.setItem('kodari_recent', JSON.stringify(list));
}

export default function App() {
  const [pdfFile, setPdfFile]       = useState(null);   // { data: Uint8Array, name: string }
  const [numPages, setNumPages]     = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]           = useState(0);      // 0 = fit-to-width default
  const [rotation, setRotation]     = useState(0);      // 0 | 90 | 180 | 270
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode]     = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);
  const [searchIndex, setSearchIndex] = useState(0);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState(null);
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [pendingPasswordData, setPendingPasswordData] = useState(null);
  const [passwordInput, setPasswordInput]   = useState('');
  const [recentFiles, setRecentFiles]       = useState(loadRecent);
  const [showRecent, setShowRecent]         = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);

  const fileInputRef  = useRef(null);
  const pdfDocRef     = useRef(null);   // shared PDF document object
  const [pdfDoc, setPdfDoc] = useState(null); // state version so Sidebar re-renders

  // ── Electron: open PDF from menu/OS ──
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = window.electronAPI.onOpenPDF(({ base64, fileName }) => {
      loadFromBase64(base64, fileName);
    });
    return cleanup;
  }, []);

  // ── Ctrl+Scroll zoom (dispatched by PDFViewer) ──
  useEffect(() => {
    function onZoomEvent(e) {
      const { delta } = e.detail;
      if (delta < 0) zoomIn();
      else zoomOut();
    }
    window.addEventListener('pdf-zoom', onZoomEvent);
    return () => window.removeEventListener('pdf-zoom', onZoomEvent);
  }, []);

  // ── Fullscreen change tracking ──
  useEffect(() => {
    function onFSChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  // ── Load helpers ──
  function loadFromBase64(base64, fileName, password) {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    loadFromBytes(bytes, fileName, password);
  }

  function loadFromBytes(bytes, fileName, password) {
    setPdfFile({ data: bytes, name: fileName, password });
    setCurrentPage(1);
    setError(null);
    setSearchQuery('');
    setRotation(0);
    saveRecent(fileName);
    setRecentFiles(loadRecent());
  }

  function loadFromFile(file) {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }
    setIsLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const bytes = new Uint8Array(ev.target.result);
      loadFromBytes(bytes, file.name);
      setIsLoading(false);
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Electron dialog ──
  async function openElectronDialog() {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.openPDFDialog();
      if (result) loadFromBase64(result.base64, result.fileName);
    } catch (e) {
      setError('Failed to open file: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }

  function openBrowserDialog() { fileInputRef.current?.click(); }
  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    e.target.value = '';
  }
  const handleDrop = useCallback((file) => loadFromFile(file), []);
  const openFile   = isElectron ? openElectronDialog : openBrowserDialog;

  // ── Navigation ──
  function goToPage(page) {
    setCurrentPage(Math.max(1, Math.min(page, numPages)));
  }

  // ── Zoom ──
  function zoomIn()         { setScale((s) => Math.min((s || 1) + 0.25, 4.0)); }
  function zoomOut()        { setScale((s) => Math.max((s || 1) - 0.25, 0.25)); }
  function zoomReset()      { setScale(1.0); }
  function zoomFit()        { setScale(0); }
  function zoomSet(v)       { setScale(v); }

  // ── Rotation ──
  function rotateCW()  { setRotation((r) => (r + 90) % 360); }

  // ── Print ──
  function handlePrint() { window.print(); }

  // ── Fullscreen ──
  function handleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  // ── Search navigation ──
  function searchNext() { setSearchIndex((i) => (searchCount > 0 ? (i + 1) % searchCount : 0)); }
  function searchPrev() { setSearchIndex((i) => (searchCount > 0 ? (i - 1 + searchCount) % searchCount : 0)); }
  function handleSearchChange(q) { setSearchQuery(q); setSearchIndex(0); }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e) {
      if (!pdfFile) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown': goToPage(currentPage + 1); break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':   goToPage(currentPage - 1); break;
        case 'Home': goToPage(1); break;
        case 'End':  goToPage(numPages); break;
        case '+': case '=': zoomIn(); break;
        case '-': zoomOut(); break;
        case '0': zoomFit(); break;
        case 'F11': e.preventDefault(); handleFullscreen(); break;
        case 'r': rotateCW(); break;
        default: break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdfFile, currentPage, numPages]);

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* Password dialog */}
      {passwordNeeded && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2>Password Required</h2>
            <p>This PDF is password-protected. Enter the password to open it.</p>
            <input
              type="password"
              className="modal-input"
              placeholder="PDF password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPendingPasswordData(null);
                  setPasswordNeeded(false);
                  if (pendingPasswordData) {
                    loadFromBytes(pendingPasswordData.bytes, pendingPasswordData.name, passwordInput);
                  }
                  setPasswordInput('');
                }
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="tb-btn primary-btn" onClick={() => {
                setPasswordNeeded(false);
                if (pendingPasswordData) {
                  loadFromBytes(pendingPasswordData.bytes, pendingPasswordData.name, passwordInput);
                }
                setPendingPasswordData(null);
                setPasswordInput('');
              }}>
                Open
              </button>
              <button className="tb-btn" onClick={() => {
                setPasswordNeeded(false);
                setPendingPasswordData(null);
                setPasswordInput('');
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Toolbar
        pdfName={pdfFile?.name}
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        darkMode={darkMode}
        sidebarOpen={sidebarOpen}
        searchQuery={searchQuery}
        searchCount={searchCount}
        searchIndex={searchIndex}
        isElectron={isElectron}
        onOpenFile={openFile}
        onPageChange={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        onZoomFit={zoomFit}
        onZoomSet={zoomSet}
        onToggleDark={() => setDarkMode((d) => !d)}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        onSearchChange={handleSearchChange}
        onSearchNext={searchNext}
        onSearchPrev={searchPrev}
        onPrint={handlePrint}
        onFullscreen={handleFullscreen}
        onRotate={rotateCW}
      />

      <div className="main-area">
        {pdfFile && sidebarOpen && (
          <Sidebar
            pdf={pdfDoc}
            numPages={numPages}
            currentPage={currentPage}
            onPageSelect={goToPage}
          />
        )}

        <div className="viewer-container">
          {!pdfFile ? (
            <DropZone
              onDrop={handleDrop}
              onOpen={openFile}
              isLoading={isLoading}
              recentFiles={recentFiles}
              onShowRecent={() => setShowRecent((v) => !v)}
            />
          ) : (
            <PDFViewer
              pdfData={pdfFile.data}
              password={pdfFile.password}
              currentPage={currentPage}
              scale={scale}
              rotation={rotation}
              searchQuery={searchQuery}
              darkMode={darkMode}
              onDocumentLoad={(n, doc) => {
                setNumPages(n);
                if (doc) { pdfDocRef.current = doc; setPdfDoc(doc); }
              }}
              onPageChange={goToPage}
              onSearchResults={(count) => setSearchCount(count)}
              pdfDocRef={pdfDocRef}
              onPasswordNeeded={(bytes, name) => {
                setPendingPasswordData({ bytes, name });
                setPasswordNeeded(true);
              }}
            />
          )}

          {error && (
            <div className="error-toast">
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
