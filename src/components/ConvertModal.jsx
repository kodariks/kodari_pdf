/**
 * ConvertModal — PDF → Image / Word / Excel conversions.
 * Opened from the Tools menu with a targetFormat prop indicating which tab to show.
 */
import { useState } from 'react';
import { pdfToImages, pdfToDocx, pdfToXlsx } from '../utils/exportFormats.js';

const FORMAT_TABS = [
  { id: 'image', label: '🖼 Image',  desc: 'Export pages as JPEG or PNG images' },
  { id: 'docx',  label: '📝 Word',   desc: 'Export text content as .docx file'  },
  { id: 'xlsx',  label: '📊 Excel',  desc: 'Export tabular content as .xlsx'    },
];

const DPI_OPTIONS = [
  { value: 72,  label: '72 DPI (screen)'      },
  { value: 150, label: '150 DPI (medium)'     },
  { value: 300, label: '300 DPI (high quality)'},
];

export default function ConvertModal({ pdfDoc, pdfName, targetFormat, onClose }) {
  const [activeTab,   setActiveTab]   = useState(targetFormat || 'image');
  const [imgFormat,   setImgFormat]   = useState('jpeg');
  const [dpi,         setDpi]         = useState(150);
  const [converting,  setConverting]  = useState(false);
  const [progress,    setProgress]    = useState(null); // { current, total }
  const [error,       setError]       = useState(null);

  const baseName = (pdfName || 'document').replace(/\.pdf$/i, '');

  async function handleConvert() {
    if (!pdfDoc) { setError('No PDF loaded.'); return; }
    setError(null);
    setConverting(true);
    setProgress(null);
    try {
      const onProg = (cur, tot) => setProgress({ current: cur, total: tot });
      if (activeTab === 'image') {
        await pdfToImages(pdfDoc, baseName, imgFormat, dpi, onProg);
      } else if (activeTab === 'docx') {
        await pdfToDocx(pdfDoc, baseName, onProg);
      } else if (activeTab === 'xlsx') {
        await pdfToXlsx(pdfDoc, baseName, onProg);
      }
      onClose();
    } catch (e) {
      setError('Conversion failed: ' + e.message);
    } finally {
      setConverting(false);
      setProgress(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            Convert PDF
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Format tabs */}
        <div className="split-mode-tabs" style={{ marginBottom: 14 }}>
          {FORMAT_TABS.map((t) => (
            <button
              key={t.id}
              className={`split-mode-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(t.id); setError(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Image options */}
        {activeTab === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pn-section">
              <label className="pn-label">Format</label>
              <div className="split-mode-tabs">
                <button
                  className={`split-mode-tab ${imgFormat === 'jpeg' ? 'active' : ''}`}
                  onClick={() => setImgFormat('jpeg')}
                >JPEG</button>
                <button
                  className={`split-mode-tab ${imgFormat === 'png' ? 'active' : ''}`}
                  onClick={() => setImgFormat('png')}
                >PNG</button>
              </div>
            </div>
            <div className="pn-section">
              <label className="pn-label">Resolution</label>
              <div className="split-mode-tabs">
                {DPI_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`split-mode-tab ${dpi === opt.value ? 'active' : ''}`}
                    onClick={() => setDpi(opt.value)}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              {pdfDoc ? `${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? 's' : ''}` : ''} →{' '}
              {pdfDoc && pdfDoc.numPages > 1 ? 'downloaded as .zip' : `${imgFormat.toUpperCase()} file`}
            </p>
          </div>
        )}

        {/* Word options */}
        {activeTab === 'docx' && (
          <div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Extracts text content from all pages and generates a .docx file.
              Layout fidelity is best-effort — complex multi-column PDFs or scanned
              documents (no embedded text) may have limited output.
            </p>
          </div>
        )}

        {/* Excel options */}
        {activeTab === 'xlsx' && (
          <div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Groups text by approximate row/column position to reconstruct tables.
              Each page becomes a separate sheet. Works best with structured tables.
            </p>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div style={{ marginTop: 10 }}>
            <div className="pw-strength" style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--accent)',
                  width: `${(progress.current / progress.total) * 100}%`,
                  transition: 'width 0.2s',
                  borderRadius: 3,
                }}
              />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Processing page {progress.current} of {progress.total}…
            </p>
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button
            className="tb-btn primary-btn"
            onClick={handleConvert}
            disabled={!pdfDoc || converting}
          >
            {converting ? 'Converting…' : `Convert to ${activeTab === 'image' ? imgFormat.toUpperCase() : activeTab.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
