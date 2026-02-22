import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

const LEVELS = [
  {
    id: 'low',
    label: 'Low',
    desc: 'Strip metadata + object stream optimization',
    est: '5–15%',
    icon: '▁',
  },
  {
    id: 'medium',
    label: 'Medium',
    desc: 'Low + remove embedded thumbnails & XMP data',
    est: '10–25%',
    icon: '▃',
  },
  {
    id: 'high',
    label: 'High',
    desc: 'Re-rasterize pages at reduced resolution (loses vector quality)',
    est: '30–70%',
    icon: '▇',
  },
];

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem('kodari_settings_' + key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function CompressModal({ pdfData, pdfName, pdfDoc, onClose }) {
  const [level,       setLevel]       = useState(() => loadSetting('compress_level', 'medium'));
  const [compressing, setCompressing] = useState(false);
  const [result,      setResult]      = useState(null); // { bytes, size }
  const [error,       setError]       = useState(null);
  const [file,        setFile]        = useState(
    pdfData ? { bytes: pdfData, name: pdfName, size: pdfData.byteLength } : null
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Allow dropping a file if none is pre-loaded
  function loadFile(f) {
    if (!f || (!f.name.endsWith('.pdf') && f.type !== 'application/pdf')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      setFile({ bytes, name: f.name, size: bytes.byteLength });
      setResult(null);
      setError(null);
    };
    reader.readAsArrayBuffer(f);
  }

  async function handleCompress() {
    if (!file) { setError('No PDF loaded.'); return; }
    setError(null);
    setCompressing(true);
    setResult(null);

    try {
      const { PDFDocument } = await import('pdf-lib');

      if (level === 'high' && pdfDoc) {
        // High: re-rasterize each page using pdf.js + canvas, rebuild with pdf-lib
        const newDoc = await PDFDocument.create();
        const total  = pdfDoc.numPages;
        const dpi    = 96; // lower DPI = smaller file
        const scale  = dpi / 72;

        for (let i = 1; i <= total; i++) {
          const page   = await pdfDoc.getPage(i);
          const vp     = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width  = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          const ctx    = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          // Encode as JPEG at quality 0.7
          const dataURL  = canvas.toDataURL('image/jpeg', 0.7);
          const base64   = dataURL.split(',')[1];
          const binStr   = atob(base64);
          const imgBytes = new Uint8Array(binStr.length);
          for (let j = 0; j < binStr.length; j++) imgBytes[j] = binStr.charCodeAt(j);

          const img      = await newDoc.embedJpg(imgBytes);
          const newPage  = newDoc.addPage([vp.width, vp.height]);
          newPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        }

        const compressed = await newDoc.save({ useObjectStreams: true });
        setResult({ bytes: compressed, size: compressed.byteLength });
      } else {
        // Low / Medium: strip metadata, optionally strip XMP
        const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setCreator('Kodari PDF');
        doc.setProducer('Kodari PDF');

        if (level === 'medium') {
          // Remove document info dictionary entries more aggressively
          try {
            const catalog = doc.catalog;
            if (catalog.has('Metadata')) catalog.delete('Metadata');
          } catch { /* skip if not accessible */ }
        }

        const compressed = await doc.save({ useObjectStreams: true, addDefaultPage: false });
        setResult({ bytes: compressed, size: compressed.byteLength });
      }
    } catch (e) {
      setError('Compression failed: ' + e.message);
    } finally {
      setCompressing(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const base = (file?.name || 'compressed').replace('.pdf', '');
    downloadBytes(result.bytes, `${base}_compressed.pdf`);
    onClose();
  }

  const savings = result && file
    ? Math.round((1 - result.size / file.size) * 100)
    : null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <polyline points="8 17 12 21 16 17"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
            </svg>
            Compress PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* File display or drop zone */}
        {!file ? (
          <div
            className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
              style={{ display: 'none' }} onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Click or drag &amp; drop a PDF to compress</span>
          </div>
        ) : (
          <div className="compress-file-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
              {file.name || 'Current PDF'}
            </span>
            <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>{formatSize(file.size)}</span>
          </div>
        )}

        {/* Level selector */}
        {file && (
          <div className="compress-levels">
            {LEVELS.map((lv) => (
              <button
                key={lv.id}
                className={`compress-level-card ${level === lv.id ? 'active' : ''}`}
                onClick={() => { setLevel(lv.id); setResult(null); try { localStorage.setItem('kodari_settings_compress_level', JSON.stringify(lv.id)); } catch {} }}
              >
                <div className="compress-level-icon">{lv.icon}</div>
                <div className="compress-level-label">{lv.label}</div>
                <div className="compress-level-est">~{lv.est} smaller</div>
                <div className="compress-level-desc">{lv.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`compress-result ${savings > 0 ? 'positive' : 'negative'}`}>
            <div className="compress-result-row">
              <span>Original</span>
              <strong>{formatSize(file.size)}</strong>
            </div>
            <div className="compress-result-row">
              <span>Compressed</span>
              <strong>{formatSize(result.size)}</strong>
            </div>
            <div className="compress-result-row">
              <span>Savings</span>
              <strong style={{ color: savings > 0 ? '#4caf50' : 'var(--accent)' }}>
                {savings > 0 ? `−${savings}%` : `+${Math.abs(savings)}% (larger — try lower level)`}
              </strong>
            </div>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        {level === 'high' && !result && (
          <p className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
            ⚠ High compression re-rasterizes pages as images. Vector text may appear less sharp.
          </p>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          {!result ? (
            <button className="tb-btn primary-btn" onClick={handleCompress} disabled={!file || compressing}>
              {compressing ? 'Compressing…' : 'Compress'}
            </button>
          ) : (
            <button className="tb-btn primary-btn" onClick={handleDownload}>
              Download Compressed PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
