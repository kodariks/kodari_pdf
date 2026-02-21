import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

function PasswordStrength({ password }) {
  let score = 0;
  if (password.length >= 8)            score++;
  if (/[A-Z]/.test(password))          score++;
  if (/[0-9]/.test(password))          score++;
  if (/[^A-Za-z0-9]/.test(password))   score++;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#e63946', '#ff9800', '#4caf50', '#2196f3'];

  if (!password) return null;
  return (
    <div className="pw-strength">
      <div className="pw-bars">
        {[1,2,3,4].map((i) => (
          <div
            key={i}
            className="pw-bar"
            style={{ background: i <= score ? colors[score] : 'var(--border)' }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: colors[score] }}>{labels[score]}</span>
    </div>
  );
}

export default function ProtectModal({ pdfData, pdfName, onClose }) {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [protecting, setProtecting] = useState(false);
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

  async function handleProtect() {
    if (!file)               { setError('No PDF loaded.'); return; }
    if (!password)           { setError('Enter a password.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }

    setError(null);
    setProtecting(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const encrypted = await doc.save({
        userPassword:  password,
        ownerPassword: password,
      });
      const base = (file.name || 'document').replace('.pdf', '');
      downloadBytes(encrypted, `${base}_protected.pdf`);
      onClose();
    } catch (e) {
      setError('Failed to protect PDF: ' + e.message);
    } finally {
      setProtecting(false);
    }
  }

  const match = password && confirm && password === confirm;
  const mismatch = password && confirm && password !== confirm;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Protect PDF
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
            <span>Click or drag &amp; drop a PDF to protect</span>
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

        {/* Password fields */}
        {file && (
          <div className="protect-fields">
            <label className="split-label">
              Password
              <div className="pw-input-wrap" style={{ marginTop: 6 }}>
                <input
                  className="modal-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
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
              <PasswordStrength password={password} />
            </label>

            <label className="split-label" style={{ marginTop: 8 }}>
              Confirm Password
              <div className="pw-input-wrap" style={{ marginTop: 6 }}>
                <input
                  className="modal-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={{ borderColor: mismatch ? 'var(--accent)' : match ? '#4caf50' : undefined }}
                  onKeyDown={(e) => e.key === 'Enter' && handleProtect()}
                />
                <span className="pw-match-icon">
                  {match && '✓'}
                  {mismatch && '✗'}
                </span>
              </div>
            </label>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleProtect}
            disabled={!file || !password || protecting}
          >
            {protecting ? 'Protecting…' : '🔒 Protect & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
