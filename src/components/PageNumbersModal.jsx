import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

const POSITIONS = [
  { id: 'top-left',     label: '↖', row: 0, col: 0 },
  { id: 'top-center',   label: '↑', row: 0, col: 1 },
  { id: 'top-right',    label: '↗', row: 0, col: 2 },
  { id: 'bottom-left',  label: '↙', row: 1, col: 0 },
  { id: 'bottom-center',label: '↓', row: 1, col: 1 },
  { id: 'bottom-right', label: '↘', row: 1, col: 2 },
];

const FORMATS = [
  { id: 'n',        label: '1, 2, 3 …'        },
  { id: 'Page n',   label: 'Page 1, Page 2 …'  },
  { id: 'n / total',label: '1 / 10, 2 / 10 …'  },
];

const FONT_COLORS = ['#000000','#ffffff','#e63946','#2196f3','#4caf50','#ff9800'];

export default function PageNumbersModal({ pdfData, pdfName, onClose }) {
  const [position,  setPosition]  = useState('bottom-center');
  const [format,    setFormat]    = useState('n');
  const [startFrom, setStartFrom] = useState(1);
  const [fontSize,  setFontSize]  = useState(12);
  const [color,     setColor]     = useState('#000000');
  const [applying,  setApplying]  = useState(false);
  const [error,     setError]     = useState(null);
  const [file,      setFile]      = useState(
    pdfData ? { bytes: pdfData, name: pdfName } : null
  );
  const [dragOver,  setDragOver]  = useState(false);
  const fileInputRef = useRef(null);

  function loadFile(f) {
    if (!f || (!f.name.endsWith('.pdf') && f.type !== 'application/pdf')) return;
    const reader = new FileReader();
    reader.onload = (e) => setFile({ bytes: new Uint8Array(e.target.result), name: f.name });
    reader.readAsArrayBuffer(f);
  }

  async function handleApply() {
    if (!file) { setError('No PDF loaded.'); return; }
    setError(null);
    setApplying(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const doc   = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const font  = await doc.embedFont(StandardFonts.Helvetica);
      const total = doc.getPageCount();

      // Parse hex color
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      const pdfColor = rgb(r, g, b);
      const margin   = 24;

      for (let i = 0; i < total; i++) {
        const page           = doc.getPage(i);
        const { width, height } = page.getSize();
        const n              = i + startFrom;
        let label;
        if (format === 'Page n')         label = `Page ${n}`;
        else if (format === 'n / total') label = `${n} / ${total + startFrom - 1}`;
        else                             label = `${n}`;

        const textWidth = font.widthOfTextAtSize(label, fontSize);
        let x, y;

        // Y position
        if (position.startsWith('top')) {
          y = height - margin - fontSize;
        } else {
          y = margin;
        }

        // X position
        if (position.endsWith('left')) {
          x = margin;
        } else if (position.endsWith('right')) {
          x = width - textWidth - margin;
        } else {
          x = (width - textWidth) / 2;
        }

        page.drawText(label, { x, y, size: fontSize, font, color: pdfColor });
      }

      const result = await doc.save();
      const base   = (file.name || 'document').replace('.pdf', '');
      downloadBytes(result, `${base}_numbered.pdf`);
      onClose();
    } catch (e) {
      setError('Failed: ' + e.message);
    } finally {
      setApplying(false);
    }
  }

  // Preview label
  const previewLabel = (() => {
    const n = startFrom;
    if (format === 'Page n') return `Page ${n}`;
    if (format === 'n / total') return `${n} / 10`;
    return `${n}`;
  })();

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
              <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
            </svg>
            Add Page Numbers
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* File */}
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Click or drag &amp; drop a PDF</span>
          </div>
        ) : (
          <div className="compress-file-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          </div>
        )}

        {file && (
          <div className="pn-options">
            {/* Position grid */}
            <div className="pn-section">
              <label className="pn-label">Position</label>
              <div className="pn-position-grid">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos.id}
                    className={`pn-pos-btn ${position === pos.id ? 'active' : ''}`}
                    style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1 }}
                    onClick={() => setPosition(pos.id)}
                    title={pos.id.replace('-', ' ')}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div className="pn-section">
              <label className="pn-label">Format</label>
              <div className="split-mode-tabs">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    className={`split-mode-tab ${format === f.id ? 'active' : ''}`}
                    onClick={() => setFormat(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings row */}
            <div className="pn-settings-row">
              <label className="pn-setting">
                <span className="pn-label">Start from</span>
                <input
                  type="number" min={1} className="modal-input"
                  style={{ width: 70 }}
                  value={startFrom}
                  onChange={(e) => setStartFrom(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </label>
              <label className="pn-setting">
                <span className="pn-label">Font size</span>
                <input
                  type="number" min={8} max={48} className="modal-input"
                  style={{ width: 70 }}
                  value={fontSize}
                  onChange={(e) => setFontSize(Math.min(48, Math.max(8, parseInt(e.target.value) || 12)))}
                />
              </label>
              <div className="pn-setting">
                <span className="pn-label">Color</span>
                <div className="pn-colors">
                  {FONT_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`ann-color-swatch ${c === color ? 'active' : ''}`}
                      style={{ background: c, border: c === '#ffffff' ? '1px solid var(--border)' : undefined }}
                      onClick={() => setColor(c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="pn-preview">
              <div className="pn-preview-page">
                <div className="pn-preview-lines">
                  {[...Array(4)].map((_, i) => <div key={i} className="pn-line" />)}
                </div>
                <span
                  className="pn-preview-label"
                  style={{
                    fontSize: Math.max(9, Math.min(fontSize * 0.9, 16)),
                    color: color === '#ffffff' ? '#999' : color,
                    ...(position.startsWith('top') ? { top: 6 } : { bottom: 6 }),
                    ...(position.endsWith('left')   ? { left: 8 }
                      : position.endsWith('right')  ? { right: 8 }
                      : { left: '50%', transform: 'translateX(-50%)' }),
                  }}
                >
                  {previewLabel}
                </span>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>Preview</span>
            </div>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleApply}
            disabled={!file || applying}
          >
            {applying ? 'Applying…' : 'Add Page Numbers & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
