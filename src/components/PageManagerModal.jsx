import { useState, useEffect, useRef } from 'react';
import { reorderPages, deletePages, duplicatePage, rotatePages, downloadBytes } from '../utils/pdfManipulation.js';

// Render a single page thumbnail via pdf.js
function PageThumb({ pdf, pageNum, width = 120 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const vp     = page.getViewport({ scale: 1 });
      const scale  = width / vp.width;
      const vp2    = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width  = vp2.width;
      canvas.height = vp2.height;
      page.render({ canvasContext: canvas.getContext('2d'), viewport: vp2 });
    });
    return () => { cancelled = true; };
  }, [pdf, pageNum, width]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', borderRadius: 3 }}
    />
  );
}

export default function PageManagerModal({ pdfData, pdfDoc, pdfName, onClose, onApply }) {
  // pageOrder: array of 0-indexed original page numbers, may have duplicates (duplicated pages)
  const [pageOrder,   setPageOrder]   = useState([]);
  const [rotations,   setRotations]   = useState({}); // { listIdx: extraDeg }
  const [selected,    setSelected]    = useState(new Set());
  const [dragIdx,     setDragIdx]     = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [applying,    setApplying]    = useState(false);
  const [error,       setError]       = useState(null);

  // initialise page order from the loaded PDF
  useEffect(() => {
    if (!pdfDoc) return;
    setPageOrder(Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1)); // 1-indexed
  }, [pdfDoc]);

  // ── Selection ────────────────────────────────
  function toggleSelect(idx) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(pageOrder.map((_, i) => i)));
  }
  function clearSelect() { setSelected(new Set()); }

  // ── Drag-and-drop reorder ─────────────────────
  function onDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOverItem(e, idx) {
    e.preventDefault();
    setDragOver(idx);
  }
  function onDropItem(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOver(null); return; }
    setPageOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    // remap rotations
    setRotations((prev) => {
      const entries = Object.entries(prev).map(([k, v]) => [Number(k), v]);
      const reordered = {};
      const keys = entries.map(([k]) => k);
      const order = Array.from({ length: pageOrder.length }, (_, i) => i);
      const [movedKey] = order.splice(dragIdx, 1);
      order.splice(idx, 0, movedKey);
      entries.forEach(([oldIdx, val]) => {
        const newIdx = order.indexOf(oldIdx);
        if (newIdx !== -1) reordered[newIdx] = val;
      });
      return reordered;
    });
    setDragIdx(null);
    setDragOver(null);
  }
  function onDragEnd() { setDragIdx(null); setDragOver(null); }

  // ── Per-page actions ─────────────────────────
  function rotatePage(idx) {
    setRotations((prev) => ({ ...prev, [idx]: ((prev[idx] || 0) + 90) % 360 }));
  }

  function deletePage(idx) {
    setPageOrder((prev) => prev.filter((_, i) => i !== idx));
    setRotations((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
    setSelected((prev) => {
      const next = new Set();
      prev.forEach((s) => { if (s < idx) next.add(s); else if (s > idx) next.add(s - 1); });
      return next;
    });
  }

  function deleteSelected() {
    const toDelete = [...selected].sort((a, b) => b - a);
    let order = [...pageOrder];
    let rots  = { ...rotations };
    for (const idx of toDelete) {
      order = order.filter((_, i) => i !== idx);
      const next = {};
      Object.entries(rots).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      rots = next;
    }
    setPageOrder(order);
    setRotations(rots);
    setSelected(new Set());
  }

  function dupPage(idx) {
    setPageOrder((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, prev[idx]);
      return next;
    });
    setRotations((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki <= idx) next[ki] = v;
        else next[ki + 1] = v;
      });
      if (prev[idx] !== undefined) next[idx + 1] = prev[idx];
      return next;
    });
  }

  function moveUp(idx) {
    if (idx === 0) return;
    setPageOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx) {
    setPageOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  // ── Apply changes ─────────────────────────────
  async function handleApply() {
    if (!pdfData) return;
    setError(null);
    setApplying(true);
    try {
      const { PDFDocument } = await import('pdf-lib');

      // Step 1: apply rotations first on original doc
      let workBytes = pdfData;
      const rotMap = {};
      pageOrder.forEach((origPage, listIdx) => {
        if (rotations[listIdx]) {
          // origPage is 1-indexed; we'll apply rotation per original page index
          // Accumulate — if same original page appears multiple times we rotate independently
          rotMap[origPage - 1] = (rotMap[origPage - 1] || 0) + rotations[listIdx];
        }
      });

      if (Object.keys(rotMap).length > 0) {
        const doc = await PDFDocument.load(workBytes, { ignoreEncryption: true });
        const { degrees } = await import('pdf-lib');
        for (const [idx, angle] of Object.entries(rotMap)) {
          const page    = doc.getPage(Number(idx));
          const current = page.getRotation().angle;
          page.setRotation(degrees((current + angle) % 360));
        }
        workBytes = await doc.save();
      }

      // Step 2: reorder (0-indexed)
      const src     = await PDFDocument.load(workBytes, { ignoreEncryption: true });
      const newDoc  = await PDFDocument.create();
      const indices = pageOrder.map((p) => p - 1);
      const copied  = await newDoc.copyPages(src, indices);
      copied.forEach((page) => newDoc.addPage(page));
      const finalBytes = await newDoc.save();

      onApply(finalBytes);
      onClose();
    } catch (e) {
      setError('Failed to apply changes: ' + e.message);
    } finally {
      setApplying(false);
    }
  }

  async function handleDownload() {
    if (!pdfData) return;
    setError(null);
    setApplying(true);
    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      let workBytes = pdfData;

      const rotMap = {};
      pageOrder.forEach((origPage, listIdx) => {
        if (rotations[listIdx]) rotMap[origPage - 1] = (rotMap[origPage - 1] || 0) + rotations[listIdx];
      });

      if (Object.keys(rotMap).length > 0) {
        const doc = await PDFDocument.load(workBytes, { ignoreEncryption: true });
        for (const [idx, angle] of Object.entries(rotMap)) {
          const page = doc.getPage(Number(idx));
          page.setRotation(degrees((page.getRotation().angle + angle) % 360));
        }
        workBytes = await doc.save();
      }

      const src    = await PDFDocument.load(workBytes, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(src, pageOrder.map((p) => p - 1));
      copied.forEach((p) => newDoc.addPage(p));
      const finalBytes = await newDoc.save();
      downloadBytes(finalBytes, pdfName ? pdfName.replace('.pdf', '_rearranged.pdf') : 'rearranged.pdf');
    } catch (e) {
      setError('Failed: ' + e.message);
    } finally {
      setApplying(false);
    }
  }

  const numPages = pageOrder.length;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-wide" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Rearrange Pages
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
              — {numPages} page{numPages !== 1 ? 's' : ''}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Toolbar */}
        <div className="pm-toolbar">
          <button className="tb-btn icon-btn tiny-btn" onClick={selectAll} title="Select all">
            Select All
          </button>
          {selected.size > 0 && (
            <>
              <span className="muted" style={{ fontSize: 12 }}>{selected.size} selected</span>
              <button className="tb-btn icon-btn tiny-btn danger-btn" onClick={deleteSelected}>
                Delete Selected
              </button>
              <button className="tb-btn icon-btn tiny-btn" onClick={clearSelect}>
                Clear
              </button>
            </>
          )}
        </div>

        {/* Page grid */}
        {!pdfDoc ? (
          <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
            Open a PDF first to rearrange its pages.
          </p>
        ) : (
          <div className="pm-grid">
            {pageOrder.map((origPage, idx) => (
              <div
                key={`${origPage}-${idx}`}
                className={`pm-page-card
                  ${selected.has(idx) ? 'selected' : ''}
                  ${dragIdx === idx ? 'dragging' : ''}
                  ${dragOver === idx ? 'drag-target' : ''}
                `}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOverItem(e, idx)}
                onDrop={(e) => onDropItem(e, idx)}
                onDragEnd={onDragEnd}
                onClick={() => toggleSelect(idx)}
              >
                {/* Thumbnail */}
                <div
                  className="pm-thumb"
                  style={{ transform: `rotate(${rotations[idx] || 0}deg)` }}
                >
                  <PageThumb pdf={pdfDoc} pageNum={origPage} width={110} />
                </div>

                {/* Page number label */}
                <div className="pm-page-label">
                  <span>{idx + 1}</span>
                  {rotations[idx] ? <span className="muted" style={{ fontSize: 10 }}>↻{rotations[idx]}°</span> : null}
                </div>

                {/* Action buttons */}
                <div className="pm-card-actions">
                  <button className="pm-action-btn" onClick={(e) => { e.stopPropagation(); moveUp(idx); }} disabled={idx === 0} title="Move left">←</button>
                  <button className="pm-action-btn" onClick={(e) => { e.stopPropagation(); rotatePage(idx); }} title="Rotate 90°">↻</button>
                  <button className="pm-action-btn" onClick={(e) => { e.stopPropagation(); dupPage(idx); }} title="Duplicate">⧉</button>
                  <button className="pm-action-btn danger" onClick={(e) => { e.stopPropagation(); deletePage(idx); }} title="Delete">✕</button>
                  <button className="pm-action-btn" onClick={(e) => { e.stopPropagation(); moveDown(idx); }} disabled={idx === numPages - 1} title="Move right">→</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button className="tb-btn" onClick={handleDownload} disabled={applying || !pdfDoc}>
            {applying ? '…' : 'Download'}
          </button>
          <button className="tb-btn primary-btn" onClick={handleApply} disabled={applying || !pdfDoc}>
            {applying ? 'Applying…' : 'Apply to Current PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
