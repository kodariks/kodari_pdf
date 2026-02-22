import { useState, useRef } from 'react';
import { docxToPrintPDF } from '../utils/importFormats.js';

export default function WordToPDFModal({ onClose }) {
  const [file,       setFile]       = useState(null); // { name, arrayBuffer }
  const [dragOver,   setDragOver]   = useState(false);
  const [converting, setConverting] = useState(false);
  const [error,      setError]      = useState(null);
  const fileInputRef = useRef(null);

  function loadFile(f) {
    if (!f) return;
    const isDocx = f.name.endsWith('.docx') ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isDocx) { setError('Please select a .docx file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => setFile({ name: f.name, arrayBuffer: e.target.result });
    reader.readAsArrayBuffer(f);
  }

  async function handleConvert() {
    if (!file) { setError('No .docx file loaded.'); return; }
    setError(null);
    setConverting(true);
    try {
      await docxToPrintPDF(file.arrayBuffer, file.name.replace('.docx', ''));
      onClose();
    } catch (e) {
      setError('Conversion failed: ' + e.message);
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Word to PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Drop zone */}
        {!file ? (
          <div
            className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Click or drag &amp; drop a .docx file</span>
          </div>
        ) : (
          <div className="compress-file-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"
              style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </span>
            <button className="tb-btn icon-btn tiny-btn" onClick={() => setFile(null)} title="Remove">✕</button>
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, padding: '6px 0' }}>
          Opens a print-preview window — use your browser's Print → Save as PDF to download.
        </p>

        {error && <p className="modal-error">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleConvert}
            disabled={!file || converting}
          >
            {converting ? 'Opening preview…' : 'Convert & Preview'}
          </button>
        </div>
      </div>
    </div>
  );
}
