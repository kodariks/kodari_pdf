import { useState } from 'react';

const LANGUAGES = [
  { id: 'eng', label: 'English' },
  { id: 'spa', label: 'Spanish' },
  { id: 'fra', label: 'French' },
  { id: 'deu', label: 'German' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'chi_sim', label: 'Chinese (Simplified)' },
  { id: 'kor', label: 'Korean' },
];

export default function OCRModal({ pdfDoc, pdfName, onClose }) {
  const [ocrLang, setOcrLang] = useState('eng');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runOCR() {
    if (!pdfDoc) return;
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(ocrLang);

      const totalPages = pdfDoc.numPages;
      const allText = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress({ current: i, total: totalPages });
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 2.0 });

        // Render page to canvas
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        // Run OCR
        const { data } = await worker.recognize(canvas);
        allText.push(`--- Page ${i} ---\n${data.text}`);
      }

      await worker.terminate();
      setResult(allText.join('\n\n'));
    } catch (e) {
      setError('OCR failed: ' + e.message);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }

  function copyText() {
    if (result) navigator.clipboard?.writeText(result);
  }

  function downloadText() {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (pdfName || 'document').replace(/\.pdf$/i, '') + '_ocr.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            OCR — Extract Text from Scanned PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Uses Tesseract.js to recognize text in scanned or image-based PDF pages.
          This may take a moment for large documents.
        </p>

        <div className="pn-section">
          <label className="pn-label">OCR Language</label>
          <select className="modal-input" value={ocrLang} onChange={(e) => setOcrLang(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        {progress && (
          <div>
            <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.2s', borderRadius: 3 }} />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Processing page {progress.current} of {progress.total}...
            </p>
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="tb-btn" onClick={copyText} title="Copy to clipboard">Copy</button>
              <button className="tb-btn" onClick={downloadText} title="Download as .txt">Download .txt</button>
            </div>
            <textarea
              readOnly
              value={result}
              style={{
                width: '100%', height: 250, resize: 'vertical',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 13,
                fontFamily: 'monospace', color: 'var(--text)',
              }}
            />
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Close</button>
          <button className="tb-btn primary-btn" onClick={runOCR} disabled={!pdfDoc || processing}>
            {processing ? 'Processing...' : 'Run OCR'}
          </button>
        </div>
      </div>
    </div>
  );
}
