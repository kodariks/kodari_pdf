import { useState, useEffect, useCallback, useRef } from 'react';
import PDFViewer from './components/PDFViewer.jsx';
import Toolbar from './components/Toolbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import DropZone from './components/DropZone.jsx';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

export default function App() {
  const [pdfFile, setPdfFile] = useState(null);       // { data: Uint8Array, name: string }
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // ── Electron: listen for PDFs opened from menu / OS ──
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = window.electronAPI.onOpenPDF(({ base64, fileName }) => {
      loadFromBase64(base64, fileName);
    });
    return cleanup;
  }, []);

  function loadFromBase64(base64, fileName) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    setPdfFile({ data: bytes, name: fileName });
    setCurrentPage(1);
    setError(null);
  }

  // ── Open via native dialog (Electron) ──
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

  // ── Open via browser <input type="file"> ──
  function openBrowserDialog() {
    fileInputRef.current?.click();
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    e.target.value = '';
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
      setPdfFile({ data: bytes, name: file.name });
      setCurrentPage(1);
      setIsLoading(false);
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Drag & Drop ──
  const handleDrop = useCallback((file) => {
    loadFromFile(file);
  }, []);

  // ── Navigation ──
  function goToPage(page) {
    setCurrentPage(Math.max(1, Math.min(page, numPages)));
  }

  function zoomIn()  { setScale((s) => Math.min(s + 0.25, 4.0)); }
  function zoomOut() { setScale((s) => Math.max(s - 0.25, 0.25)); }
  function zoomReset() { setScale(1.0); }
  function zoomFit() { setScale(0); }   // 0 = fit-to-width (handled in PDFViewer)

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e) {
      if (!pdfFile) return;
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          goToPage(currentPage + 1); break;
        case 'ArrowLeft':
        case 'ArrowUp':
          goToPage(currentPage - 1); break;
        case 'Home': goToPage(1); break;
        case 'End':  goToPage(numPages); break;
        case '+': case '=': zoomIn(); break;
        case '-': zoomOut(); break;
        case '0': zoomReset(); break;
        default: break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdfFile, currentPage, numPages]);

  const openFile = isElectron ? openElectronDialog : openBrowserDialog;

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      {/* Hidden file input for web */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      <Toolbar
        pdfName={pdfFile?.name}
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        darkMode={darkMode}
        sidebarOpen={sidebarOpen}
        searchQuery={searchQuery}
        isElectron={isElectron}
        onOpenFile={openFile}
        onPageChange={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        onZoomFit={zoomFit}
        onToggleDark={() => setDarkMode((d) => !d)}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        onSearchChange={setSearchQuery}
      />

      <div className="main-area">
        {pdfFile && sidebarOpen && (
          <Sidebar
            pdfData={pdfFile.data}
            numPages={numPages}
            currentPage={currentPage}
            onPageSelect={goToPage}
          />
        )}

        <div className="viewer-container">
          {!pdfFile ? (
            <DropZone onDrop={handleDrop} onOpen={openFile} isLoading={isLoading} />
          ) : (
            <PDFViewer
              pdfData={pdfFile.data}
              currentPage={currentPage}
              scale={scale}
              searchQuery={searchQuery}
              darkMode={darkMode}
              onDocumentLoad={(n) => setNumPages(n)}
              onPageChange={goToPage}
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
