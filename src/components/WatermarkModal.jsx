import { useState, useRef } from 'react';
import { downloadBytes } from '../utils/pdfManipulation.js';

export default function WatermarkModal({ pdfData, pdfName, onClose }) {
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.15);
  const [color, setColor] = useState('#888888');
  const [angle, setAngle] = useState(-45);
  const [applying, setApplying] = useState(false);
  const [file, setFile] = useState(pdfData ? { bytes: pdfData, name: pdfName } : null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function loadFile(f) {
    if (!f || (!f.name.endsWith('.pdf') && f.type !== 'application/pdf')) return;
    const reader = new FileReader();
    reader.onload = (e) => setFile({ bytes: new Uint8Array(e.target.result), name: f.name });
    reader.readAsArrayBuffer(f);
  }

  async function apply() {
    if (!file || !text.trim()) return;
    setApplying(true);
    try {
      const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
      const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      const total = doc.getPageCount();

      for (let i = 0; i < total; i++) {
        const page = doc.getPage(i);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          opacity,
          rotate: degrees(angle),
        });
      }

      const result = await doc.save();
      const base = (file.name || 'document').replace(/\.pdf$/i, '');
      downloadBytes(result, `${base}_watermarked.pdf`);
      onClose();
    } catch (e) {
      console.error('Watermark failed:', e);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            Add Watermark
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {!file && (
          <div
            className={`merge-dropzone ${dragOver ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files?.[0])} />
            <span>Drop PDF here or click to browse</span>
          </div>
        )}

        {file && (
          <>
            <div className="pn-section">
              <label className="pn-label">Watermark Text</label>
              <input className="modal-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter watermark text" />
            </div>

            <div className="pn-settings-row">
              <div className="pn-setting">
                <label className="pn-label">Font Size</label>
                <input type="number" className="modal-input" style={{ width: 70 }} min={12} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              </div>
              <div className="pn-setting">
                <label className="pn-label">Opacity</label>
                <input type="range" min={0.05} max={0.5} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 100 }} />
                <span className="muted" style={{ fontSize: 12 }}>{Math.round(opacity * 100)}%</span>
              </div>
              <div className="pn-setting">
                <label className="pn-label">Angle</label>
                <input type="number" className="modal-input" style={{ width: 60 }} min={-90} max={90} value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
              </div>
              <div className="pn-setting">
                <label className="pn-label">Color</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 30, padding: 0, border: 'none', cursor: 'pointer' }} />
              </div>
            </div>

            <div className="modal-footer">
              <button className="tb-btn" onClick={onClose}>Cancel</button>
              <button className="tb-btn primary-btn" onClick={apply} disabled={applying || !text.trim()}>
                {applying ? 'Applying…' : 'Apply Watermark'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
