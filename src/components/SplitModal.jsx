import { useState, useRef } from 'react';
import { splitPDF, downloadFile } from '../utils/pdfManipulation.js';

export default function SplitModal({ onClose }) {
  const [file,        setFile]        = useState(null);   // { name, bytes, numPages }
  const [mode,        setMode]        = useState('range'); // 'range' | 'every' | 'individual'
  const [ranges,      setRanges]      = useState('');      // e.g. "1-3, 4-7, 8"
  const [everyN,      setEveryN]      = useState(1);
  const [splitting,   setSplitting]   = useState(false);
  const [error,       setError]       = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const fileInputRef = useRef(null);

  // ── Load file ─────────────────────────────────
  async function loadFile(f) {
    if (!f || (!f.name.endsWith('.pdf') && f.type !== 'application/pdf')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const bytes = new Uint8Array(e.target.result);
      // Quick page count using pdf-lib
      try {
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        setFile({ name: f.name, bytes, numPages: doc.getPageCount() });
        setError(null);
      } catch {
        setFile({ name: f.name, bytes, numPages: '?' });
      }
    };
    reader.readAsArrayBuffer(f);
  }

  function handleFileInput(e) { loadFile(e.target.files?.[0]); e.target.value = ''; }
  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  // ── Parse range string ────────────────────────
  function parseRanges(str, total) {
    const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
    const result = [];
    for (const part of parts) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        if (!isNaN(a) && !isNaN(b) && a >= 1 && b >= a && b <= total) {
          result.push([a, b]);
        } else {
          return null; // invalid
        }
      } else {
        const n = Number(part);
        if (!isNaN(n) && n >= 1 && n <= total) {
          result.push([n, n]);
        } else {
          return null;
        }
      }
    }
    return result.length > 0 ? result : null;
  }

  function buildEveryNRanges(total, n) {
    const result = [];
    for (let i = 1; i <= total; i += n) {
      result.push([i, Math.min(i + n - 1, total)]);
    }
    return result;
  }

  // ── Split ─────────────────────────────────────
  async function handleSplit() {
    if (!file) { setError('Please select a PDF file first.'); return; }
    setError(null);
    setSplitting(true);

    try {
      const total = typeof file.numPages === 'number' ? file.numPages : 0;
      let splitRanges;

      if (mode === 'individual') {
        splitRanges = Array.from({ length: total }, (_, i) => [i + 1, i + 1]);
      } else if (mode === 'every') {
        if (everyN < 1) { setError('Enter a valid number of pages.'); setSplitting(false); return; }
        splitRanges = buildEveryNRanges(total, everyN);
      } else {
        splitRanges = parseRanges(ranges, total);
        if (!splitRanges) {
          setError(`Invalid ranges. Use format: 1-3, 4-7, 8  (total pages: ${total})`);
          setSplitting(false); return;
        }
      }

      const parts = await splitPDF(file.bytes, splitRanges);

      if (parts.length === 1) {
        downloadFile(parts[0], file.name.replace('.pdf', '_split.pdf'), 'application/pdf');
      } else {
        // Multiple files → zip them
        const JSZip = (await import('jszip')).default;
        const zip   = new JSZip();
        const base  = file.name.replace('.pdf', '');
        parts.forEach((bytes, i) => {
          zip.file(`${base}_part${i + 1}.pdf`, bytes);
        });
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        downloadFile(zipBytes, `${base}_split.zip`, 'application/zip');
      }
      onClose();
    } catch (e) {
      setError('Failed to split: ' + e.message);
    } finally {
      setSplitting(false);
    }
  }

  const previewCount = () => {
    if (!file || typeof file.numPages !== 'number') return null;
    if (mode === 'individual') return file.numPages;
    if (mode === 'every') return Math.ceil(file.numPages / Math.max(everyN, 1));
    const r = parseRanges(ranges, file.numPages);
    return r ? r.length : null;
  };

  const count = previewCount();

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Split PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* File picker */}
        {!file ? (
          <div
            className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
              style={{ display: 'none' }} onChange={handleFileInput} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Click or drag &amp; drop a PDF file here</span>
          </div>
        ) : (
          <div className="split-file-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="merge-file-name">{file.name}</span>
            <span className="muted" style={{ fontSize: 12 }}>{file.numPages} pages</span>
            <button className="tb-btn icon-btn tiny-btn danger-btn" onClick={() => setFile(null)} title="Remove">✕</button>
          </div>
        )}

        {/* Split mode */}
        {file && (
          <div className="split-options">
            <div className="split-mode-tabs">
              {[
                { id: 'range',      label: 'By Range' },
                { id: 'every',      label: 'Every N Pages' },
                { id: 'individual', label: 'Individual Pages' },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`split-mode-tab ${mode === m.id ? 'active' : ''}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'range' && (
              <div className="split-option-body">
                <label className="split-label">
                  Page ranges (comma-separated)
                  <input
                    className="modal-input"
                    placeholder={`e.g. 1-3, 4-7, 8  (1–${file.numPages})`}
                    value={ranges}
                    onChange={(e) => setRanges(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </label>
              </div>
            )}

            {mode === 'every' && (
              <div className="split-option-body">
                <label className="split-label">
                  Split every
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <input
                      type="number" min={1} max={file.numPages}
                      className="modal-input" style={{ width: 80 }}
                      value={everyN}
                      onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <span className="muted">pages</span>
                  </div>
                </label>
              </div>
            )}

            {mode === 'individual' && (
              <div className="split-option-body">
                <p className="muted" style={{ fontSize: 13 }}>
                  Each page will be saved as a separate PDF file, zipped together.
                </p>
              </div>
            )}

            {count !== null && (
              <p className="split-preview-count">
                → Will create <strong>{count}</strong> PDF file{count !== 1 ? 's' : ''}
                {count > 1 ? ' (downloaded as .zip)' : ''}
              </p>
            )}
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleSplit}
            disabled={!file || splitting}
          >
            {splitting ? 'Splitting…' : 'Split PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
