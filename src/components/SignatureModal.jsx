import { useState, useRef, useEffect } from 'react';

const CURSIVE_FONTS = [
  { id: 'dancing',    label: 'Dancing Script',  css: "'Dancing Script', cursive"    },
  { id: 'pacifico',  label: 'Pacifico',         css: "'Pacifico', cursive"          },
  { id: 'satisfy',   label: 'Satisfy',          css: "'Satisfy', cursive"           },
  { id: 'greatvibes',label: 'Great Vibes',      css: "'Great Vibes', cursive"       },
];

// Load Google Fonts dynamically
function loadGoogleFont(family) {
  const encoded = family.replace(/ /g, '+');
  const id = `gfont-${encoded}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  document.head.appendChild(link);
}

export default function SignatureModal({ onConfirm, onClose }) {
  const [tab,        setTab]        = useState('type'); // 'type' | 'draw' | 'upload'
  const [typedName,  setTypedName]  = useState('');
  const [fontId,     setFontId]     = useState('dancing');
  const [drawing,    setDrawing]    = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const canvasRef    = useRef(null);
  const lastPos      = useRef(null);

  // Load all cursive fonts on mount
  useEffect(() => {
    CURSIVE_FONTS.forEach((f) => loadGoogleFont(f.label));
  }, []);

  // ── Draw tab ──────────────────────────────────────────────────────────────
  function getCanvasPos(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function handleDrawStart(e) {
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getCanvasPos(e);
  }

  function handleDrawMove(e) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawing(true);
  }

  function handleDrawEnd() {
    setDrawing(false);
    lastPos.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  // ── Upload tab ────────────────────────────────────────────────────────────
  const [uploadDataURL, setUploadDataURL] = useState(null);
  function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setUploadDataURL(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (tab === 'type') {
      if (!typedName.trim()) return;
      // Render typed signature to canvas for a consistent dataURL
      const font = CURSIVE_FONTS.find((f) => f.id === fontId) || CURSIVE_FONTS[0];
      const offCanvas = document.createElement('canvas');
      offCanvas.width  = 400;
      offCanvas.height = 120;
      const ctx = offCanvas.getContext('2d');
      ctx.clearRect(0, 0, 400, 120);
      ctx.font = `60px ${font.css}`;
      ctx.fillStyle = '#1a1a1a';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(typedName).width;
      // Scale to fit
      const scale = Math.min(1, 360 / w);
      ctx.font = `${60 * scale}px ${font.css}`;
      ctx.fillText(typedName, 20, 60);
      onConfirm({ dataURL: offCanvas.toDataURL('image/png'), fontId });
    } else if (tab === 'draw') {
      if (!hasDrawing) return;
      onConfirm({ dataURL: canvasRef.current.toDataURL('image/png') });
    } else if (tab === 'upload') {
      if (!uploadDataURL) return;
      onConfirm({ dataURL: uploadDataURL });
    }
  }

  const canConfirm = (tab === 'type' && typedName.trim())
    || (tab === 'draw' && hasDrawing)
    || (tab === 'upload' && uploadDataURL);

  const selectedFont = CURSIVE_FONTS.find((f) => f.id === fontId) || CURSIVE_FONTS[0];

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5"/>
              <path d="M8 18.37l1.68-5.06 8.84-8.84a1.5 1.5 0 0 1 2.12 2.12L11.8 15.43z"/>
            </svg>
            Create Signature
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="split-mode-tabs" style={{ marginBottom: 12 }}>
          {[
            { id: 'type',   label: '✏ Type'   },
            { id: 'draw',   label: '✍ Draw'   },
            { id: 'upload', label: '↑ Upload' },
          ].map((t) => (
            <button
              key={t.id}
              className={`split-mode-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Type tab */}
        {tab === 'type' && (
          <div>
            <input
              className="modal-input"
              style={{ width: '100%', fontSize: 15, marginBottom: 12 }}
              placeholder="Type your name…"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoFocus
            />
            {/* Font selector */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {CURSIVE_FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`sig-font-btn ${fontId === f.id ? 'active' : ''}`}
                  style={{ fontFamily: f.css }}
                  onClick={() => setFontId(f.id)}
                >
                  {typedName || 'Signature'}
                </button>
              ))}
            </div>
            {/* Preview */}
            {typedName && (
              <div className="sig-preview-box" style={{ fontFamily: selectedFont.css }}>
                {typedName}
              </div>
            )}
          </div>
        )}

        {/* Draw tab */}
        {tab === 'draw' && (
          <div>
            <div className="sig-canvas-wrap">
              <canvas
                ref={canvasRef}
                width={420}
                height={130}
                className="sig-canvas"
                onMouseDown={handleDrawStart}
                onMouseMove={handleDrawMove}
                onMouseUp={handleDrawEnd}
                onMouseLeave={handleDrawEnd}
                onTouchStart={handleDrawStart}
                onTouchMove={handleDrawMove}
                onTouchEnd={handleDrawEnd}
              />
              <span className="sig-canvas-hint">Draw your signature</span>
            </div>
            <button className="tb-btn" style={{ marginTop: 8 }} onClick={clearCanvas}>
              Clear
            </button>
          </div>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div>
            {!uploadDataURL ? (
              <label className="merge-dropzone" style={{ cursor: 'pointer' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Click to upload signature image</span>
              </label>
            ) : (
              <div className="sig-preview-box" style={{ padding: 8 }}>
                <img src={uploadDataURL} alt="Signature" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
              </div>
            )}
            {uploadDataURL && (
              <button className="tb-btn" style={{ marginTop: 8 }} onClick={() => setUploadDataURL(null)}>
                Remove
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Use Signature
          </button>
        </div>

      </div>
    </div>
  );
}
