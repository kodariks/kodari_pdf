import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function isAccepted(file) {
  return ACCEPTED.includes(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

// Page size presets (width × height in points at 72dpi)
const PAGE_SIZES = [
  { id: 'fit',   label: 'Fit to image',  w: null, h: null },
  { id: 'a4',    label: 'A4',            w: 595,  h: 842  },
  { id: 'letter',label: 'Letter',        w: 612,  h: 792  },
];

export default function ImageToPDFModal({ onClose }) {
  const [images,    setImages]    = useState([]);  // [{ id, file, dataURL, name, size }]
  const [pageSize,  setPageSize]  = useState('fit');
  const [dragOver,  setDragOver]  = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragTarget,setDragTarget]= useState(null);
  const [converting,setConverting]= useState(false);
  const [error,     setError]     = useState(null);
  const fileInputRef = useRef(null);

  // ── Load images ──────────────────────────────────────────────────
  function addFiles(fileList) {
    const valid = Array.from(fileList).filter(isAccepted);
    if (!valid.length) return;
    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages((prev) => [
          ...prev,
          {
            id:      `${Date.now()}-${Math.random()}`,
            file,
            dataURL: e.target.result,
            name:    file.name,
            size:    file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(id) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  function moveUp(i) {
    if (i === 0) return;
    setImages((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i) {
    setImages((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  // ── Drag-to-reorder ──────────────────────────────────────────────
  function handleDragStart(i) { setDragIndex(i); }
  function handleDragOver(e, i) { e.preventDefault(); setDragTarget(i); }
  function handleDragDrop(e, i) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setDragTarget(null); return; }
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragTarget(null);
  }
  function handleDragEnd() { setDragIndex(null); setDragTarget(null); }

  // ── Convert ──────────────────────────────────────────────────────
  async function handleConvert() {
    if (!images.length) { setError('Add at least one image.'); return; }
    setError(null);
    setConverting(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      const preset = PAGE_SIZES.find((p) => p.id === pageSize) || PAGE_SIZES[0];

      for (const img of images) {
        // Decode dataURL to bytes
        const base64 = img.dataURL.split(',')[1];
        const binStr = atob(base64);
        const bytes  = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

        // Detect type from dataURL
        const mime = img.dataURL.split(';')[0].split(':')[1];
        let embedded;
        if (mime === 'image/png') {
          embedded = await doc.embedPng(bytes);
        } else {
          // jpeg / webp / gif / bmp — all try embedJpg; non-JPEG will need canvas conversion
          try {
            embedded = await doc.embedJpg(bytes);
          } catch {
            // Fallback: draw to canvas and re-encode as JPEG
            embedded = await embedViaCanvas(doc, img.dataURL, mime);
          }
        }

        const { width: iw, height: ih } = embedded;
        let pw, ph;

        if (preset.id === 'fit') {
          pw = iw;
          ph = ih;
        } else {
          // Scale image to fit within page, maintaining aspect ratio
          const scale = Math.min(preset.w / iw, preset.h / ih);
          pw = preset.w;
          ph = preset.h;
          const dw = iw * scale;
          const dh = ih * scale;
          const x  = (pw - dw) / 2;
          const y  = (ph - dh) / 2;
          const page = doc.addPage([pw, ph]);
          page.drawImage(embedded, { x, y, width: dw, height: dh });
          continue;
        }

        const page = doc.addPage([pw, ph]);
        page.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
      }

      const result = await doc.save();
      const firstName = images[0].name.replace(/\.[^.]+$/, '');
      downloadBytes(result, images.length === 1 ? `${firstName}.pdf` : 'images-to-pdf.pdf');
      onClose();
    } catch (e) {
      setError('Conversion failed: ' + e.message);
    } finally {
      setConverting(false);
    }
  }

  // Convert any image to JPEG via canvas for pdf-lib embedJpg
  async function embedViaCanvas(doc, dataURL, mime) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const jpegURL = canvas.toDataURL('image/jpeg', 0.9);
        const b64 = jpegURL.split(',')[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        try {
          resolve(await doc.embedJpg(arr));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = dataURL;
    });
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Image to PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Drop zone (always visible when < 10 images) */}
        {images.length < 20 && (
          <div
            className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
            style={{ minHeight: images.length ? 64 : 120 }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: 13 }}>
              {images.length ? 'Add more images' : 'Click or drag & drop images (JPEG, PNG, WebP…)'}
            </span>
          </div>
        )}

        {/* Image list */}
        {images.length > 0 && (
          <div className="i2p-list">
            {images.map((img, i) => (
              <div
                key={img.id}
                className={`i2p-row ${dragTarget === i ? 'drag-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDragDrop(e, i)}
                onDragEnd={handleDragEnd}
              >
                <span className="merge-drag-handle" title="Drag to reorder">⠿</span>
                <img src={img.dataURL} alt={img.name} className="i2p-thumb" />
                <span className="i2p-name">{img.name}</span>
                <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>{humanSize(img.size)}</span>
                <div className="merge-row-actions">
                  <button className="tb-btn icon-btn tiny-btn" onClick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
                  <button className="tb-btn icon-btn tiny-btn" onClick={() => moveDown(i)} disabled={i === images.length - 1} title="Move down">↓</button>
                  <button className="tb-btn icon-btn tiny-btn danger-btn" onClick={() => removeImage(img.id)} title="Remove">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Page size option */}
        {images.length > 0 && (
          <div className="pn-section" style={{ marginTop: 12 }}>
            <label className="pn-label">Page size</label>
            <div className="split-mode-tabs">
              {PAGE_SIZES.map((ps) => (
                <button
                  key={ps.id}
                  className={`split-mode-tab ${pageSize === ps.id ? 'active' : ''}`}
                  onClick={() => setPageSize(ps.id)}
                >
                  {ps.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {images.length > 0 && (
          <p className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
            {images.length} image{images.length !== 1 ? 's' : ''} → {images.length}-page PDF
          </p>
        )}

        {error && <p className="modal-error">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleConvert}
            disabled={!images.length || converting}
          >
            {converting ? 'Converting…' : 'Convert to PDF & Download'}
          </button>
        </div>

      </div>
    </div>
  );
}
