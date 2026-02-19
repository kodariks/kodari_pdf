import { useState, useEffect, useCallback, useRef } from 'react';
import PDFViewer from './components/PDFViewer.jsx';
import Toolbar from './components/Toolbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import DropZone from './components/DropZone.jsx';
import TabBar from './components/TabBar.jsx';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
const MAX_RECENT = 8;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem('kodari_recent') || '[]'); } catch { return []; }
}
function saveRecent(name) {
  const list = [name, ...loadRecent().filter((n) => n !== name)].slice(0, MAX_RECENT);
  localStorage.setItem('kodari_recent', JSON.stringify(list));
}

function createTab(data, name, password = null) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    data,
    password,
    currentPage: 1,
    numPages: 0,
    scale: 0,        // 0 = fit-to-width
    rotation: 0,
    searchQuery: '',
    searchCount: 0,
    searchIndex: 0,
    pdfDoc: null,
  };
}

export default function App() {
  // ── Tab state ──
  const [tabs, setTabs]             = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  // ── App-level state (shared across tabs) ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode]     = useState(true);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState(null);
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [pendingPasswordData, setPendingPasswordData] = useState(null);
  const [passwordInput, setPasswordInput]   = useState('');
  const [recentFiles, setRecentFiles]       = useState(loadRecent);
  const [isFullscreen, setIsFullscreen]     = useState(false);

  const fileInputRef = useRef(null);

  // ── Active tab helpers ──
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  function updateTab(tabId, patch) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }

  function updateActiveTab(patch) {
    if (activeTabId) updateTab(activeTabId, patch);
  }

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
  }, [activeTabId, tabs]);

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
    const tab = createTab(bytes, fileName, password);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setError(null);
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

  // ── Tab management ──
  function switchTab(tabId) {
    setActiveTabId(tabId);
    setError(null);
  }

  function closeTab(tabId) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (tabId === activeTabId) {
        // Switch to the nearest tab
        const idx = prev.findIndex((t) => t.id === tabId);
        const newActive = next[Math.min(idx, next.length - 1)] || null;
        setActiveTabId(newActive?.id || null);
      }
      return next;
    });
  }

  // ── Navigation ──
  function goToPage(page) {
    if (!activeTab) return;
    updateActiveTab({ currentPage: Math.max(1, Math.min(page, activeTab.numPages)) });
  }

  // ── Zoom ──
  function zoomIn()  { updateActiveTab({ scale: Math.min((activeTab?.scale || 1) + 0.25, 4.0) }); }
  function zoomOut() { updateActiveTab({ scale: Math.max((activeTab?.scale || 1) - 0.25, 0.25) }); }
  function zoomReset() { updateActiveTab({ scale: 1.0 }); }
  function zoomFit()   { updateActiveTab({ scale: 0 }); }
  function zoomSet(v)  { updateActiveTab({ scale: v }); }

  // ── Rotation ──
  function rotateCW() { updateActiveTab({ rotation: ((activeTab?.rotation || 0) + 90) % 360 }); }

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
  function searchNext() {
    if (!activeTab) return;
    const count = activeTab.searchCount;
    updateActiveTab({ searchIndex: count > 0 ? (activeTab.searchIndex + 1) % count : 0 });
  }
  function searchPrev() {
    if (!activeTab) return;
    const count = activeTab.searchCount;
    updateActiveTab({ searchIndex: count > 0 ? (activeTab.searchIndex - 1 + count) % count : 0 });
  }
  function handleSearchChange(q) {
    updateActiveTab({ searchQuery: q, searchIndex: 0 });
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e) {
      if (!activeTab) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown': goToPage(activeTab.currentPage + 1); break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':   goToPage(activeTab.currentPage - 1); break;
        case 'Home': goToPage(1); break;
        case 'End':  goToPage(activeTab.numPages); break;
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
  }, [activeTab]);

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
        pdfName={activeTab?.name}
        currentPage={activeTab?.currentPage || 1}
        numPages={activeTab?.numPages || 0}
        scale={activeTab?.scale || 0}
        darkMode={darkMode}
        sidebarOpen={sidebarOpen}
        searchQuery={activeTab?.searchQuery || ''}
        searchCount={activeTab?.searchCount || 0}
        searchIndex={activeTab?.searchIndex || 0}
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

      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitchTab={switchTab}
          onCloseTab={closeTab}
          onNewTab={openFile}
        />
      )}

      <div className="main-area">
        {activeTab && sidebarOpen && (
          <Sidebar
            pdf={activeTab.pdfDoc}
            numPages={activeTab.numPages}
            currentPage={activeTab.currentPage}
            onPageSelect={goToPage}
          />
        )}

        <div className="viewer-container">
          {!activeTab ? (
            <DropZone
              onDrop={handleDrop}
              onOpen={openFile}
              isLoading={isLoading}
              recentFiles={recentFiles}
              onShowRecent={() => {}}
            />
          ) : (
            <PDFViewer
              key={activeTab.id}
              pdfData={activeTab.data}
              password={activeTab.password}
              currentPage={activeTab.currentPage}
              scale={activeTab.scale}
              rotation={activeTab.rotation}
              searchQuery={activeTab.searchQuery}
              darkMode={darkMode}
              onDocumentLoad={(n, doc) => {
                updateTab(activeTab.id, { numPages: n, pdfDoc: doc || null });
              }}
              onPageChange={(page) => updateTab(activeTab.id, { currentPage: page })}
              onSearchResults={(count) => updateTab(activeTab.id, { searchCount: count })}
              onPasswordNeeded={(bytes, name) => {
                // Remove the tab that triggered the password prompt
                closeTab(activeTab.id);
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
