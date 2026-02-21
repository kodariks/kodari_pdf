import { useState, useRef } from 'react';
import { mergePDFs, downloadBytes } from '../utils/pdfManipulation.js';

export default function MergeModal({ onClose }) {
  const [files, setFiles]       = useState([]); // [{ name, size, bytes }]
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx]   = useState(null);
  const [merging, setMerging]   = useState(false);
  const [error, setError]       = useState(null);
  const fileInputRef            = useRef(null);

  // ── Add files ─────────────────────────────────────
  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
    );
    const readers = incoming.map(
      (f) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) =>
            resolve({ name: f.name, size: f.size, bytes: new Uint8Array(e.target.result) });
          reader.readAsArrayBuffer(f);
        })
    );
    Promise.all(readers).then((newFiles) =>
      setFiles((prev) => [...prev, ...newFiles])
    );
  }

  function handleFileInput(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function handleDropZone(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  // ── Reorder via drag-and-drop ──────────────────────
  function onDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  }

  function onDragEnd() { setDragIdx(null); }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveUp(idx) {
    if (idx === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx) {
    setFiles((prev) => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  // ── Merge ──────────────────────────────────────────
  async function handleMerge() {
    if (files.length < 2) { setError('Add at least 2 PDF files to merge.'); return; }
    setError(null);
    setMerging(true);
    try {
      const result = await mergePDFs(files.map((f) => f.bytes));
      downloadBytes(result, 'merged.pdf');
      onClose();
    } catch (e) {
      setError('Failed to merge: ' + e.message);
    } finally {
      setMerging(false);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const totalPages = files.reduce((acc) => acc, 0); // page count needs pdf.js; skip for now

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M8 6H21M8 12H21M8 18H21M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
            Merge PDFs
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Drop zone */}
        <div
          className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDropZone}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Click or drag &amp; drop PDF files here</span>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="merge-file-list">
            <div className="merge-list-header">
              <span>Files to merge ({files.length}) — drag rows to reorder</span>
              <span className="muted">Total: {files.reduce((s, f) => s + f.size, 0) > 0 ? formatSize(files.reduce((s, f) => s + f.size, 0)) : ''}</span>
            </div>
            {files.map((f, idx) => (
              <div
                key={idx}
                className={`merge-file-row ${dragIdx === idx ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
              >
                <span className="merge-drag-handle" title="Drag to reorder">⠿</span>
                <span className="merge-file-num">{idx + 1}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ flexShrink: 0, color: 'var(--accent)' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="merge-file-name" title={f.name}>{f.name}</span>
                <span className="merge-file-size muted">{formatSize(f.size)}</span>
                <div className="merge-row-actions">
                  <button className="tb-btn icon-btn tiny-btn" onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up">↑</button>
                  <button className="tb-btn icon-btn tiny-btn" onClick={() => moveDown(idx)} disabled={idx === files.length - 1} title="Move down">↓</button>
                  <button className="tb-btn icon-btn tiny-btn danger-btn" onClick={() => removeFile(idx)} title="Remove">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleMerge}
            disabled={files.length < 2 || merging}
          >
            {merging ? 'Merging…' : `Merge ${files.length > 0 ? files.length + ' Files' : 'Files'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
