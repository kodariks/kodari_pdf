import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

export default function UnlockModal({ pdfData, pdfName, pdfPassword, onClose }) {
  const [password,   setPassword]   = useState(pdfPassword || '');
  const [showPw,     setShowPw]     = useState(false);
  const [unlocking,  setUnlocking]  = useState(false);
  const [error,      setError]      = useState(null);
  const [file,       setFile]       = useState(
    pdfData ? { bytes: pdfData, name: pdfName } : null
  );
  const [dragOver,   setDragOver]   = useState(false);
  const fileInputRef = useRef(null);

  function loadFile(f) {
    if (!f || (!f.name.endsWith('.pdf') && f.type !== 'application/pdf')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setFile({ bytes: new Uint8Array(e.target.result), name: f.name });
      setPassword('');
      setError(null);
    };
    reader.readAsArrayBuffer(f);
  }

  async function handleUnlock() {
    if (!file) { setError('No PDF loaded.'); return; }
    setError(null);
    setUnlocking(true);
    try {
      const { PDFDocument } = await import('pdf-lib');

      // Try loading with the provided password
      let doc;
      try {
        doc = await PDFDocument.load(file.bytes, { password: password || undefined });
      } catch (e) {
        if (e.message?.includes('password') || e.message?.includes('encrypt')) {
          setError('Incorrect password. Please try again.');
          setUnlocking(false);
          return;
        }
        throw e;
      }

      // Save without encryption
      const unlocked = await doc.save();
      const base = (file.name || 'document').replace('.pdf', '');
      downloadBytes(unlocked, `${base}_unlocked.pdf`);
      onClose();
    } catch (e) {
      setError('Failed to unlock: ' + e.message);
    } finally {
      setUnlocking(false);
    }
  }

  const hasPasswordPreloaded = !!pdfPassword;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
            Unlock PDF
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
            <span>Click or drag &amp; drop a password-protected PDF</span>
          </div>
        ) : (
          <div className="compress-file-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
            {!pdfData && (
              <button className="tb-btn icon-btn tiny-btn danger-btn" onClick={() => setFile(null)}>✕</button>
            )}
          </div>
        )}

        {/* Password */}
        {file && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="split-label">
              {hasPasswordPreloaded
                ? 'PDF password (pre-filled from open document)'
                : 'PDF Password'}
              <div className="pw-input-wrap" style={{ marginTop: 6 }}>
                <input
                  className="modal-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter PDF password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  autoFocus={!hasPasswordPreloaded}
                />
                <button
                  className="pw-toggle"
                  onClick={() => setShowPw((v) => !v)}
                  title={showPw ? 'Hide' : 'Show'}
                  type="button"
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              The downloaded PDF will have no password restrictions.
            </p>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleUnlock}
            disabled={!file || unlocking}
          >
            {unlocking ? 'Unlocking…' : '🔓 Unlock & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
