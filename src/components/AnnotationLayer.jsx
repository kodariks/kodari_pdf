import { useState, useRef, useCallback } from 'react';
import { rectPdfToViewport, pdfToViewport, viewportToPdf } from '../utils/coordTransform.js';
import StickyNotePopup from './StickyNotePopup.jsx';

/**
 * SVG + HTML overlay rendered per page.
 * Handles highlights, drawings, notes, text-boxes, and image overlays.
 */
export default function AnnotationLayer({
  annotations,
  viewport,
  pageNum,
  activeTool,
  annotationColor,
  annotationFontSize,
  strokeWidth,
  pendingImage,         // { dataURL, naturalW, naturalH } for add-image tool
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}) {
  const svgRef = useRef(null);
  const [currentStroke,  setCurrentStroke]  = useState(null);
  const [hoveredId,      setHoveredId]      = useState(null);
  const [editingNoteId,  setEditingNoteId]  = useState(null);
  const [editingTextId,  setEditingTextId]  = useState(null);

  // Drag state for repositioning placed annotations
  const dragRef = useRef(null); // { id, startX, startY, origX, origY }

  const getPointerPos = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  if (!viewport) return null;

  const isInteractive = ['draw', 'note', 'eraser', 'add-text', 'add-image'].includes(activeTool);

  // ── SVG pointer handlers ──────────────────────────────────────────────────
  function handlePointerDown(e) {
    if (activeTool === 'draw') {
      const pos = getPointerPos(e);
      setCurrentStroke({ points: [pos], color: annotationColor, strokeWidth: strokeWidth || 2 });
      e.currentTarget.setPointerCapture(e.pointerId);

    } else if (activeTool === 'note') {
      const pos    = getPointerPos(e);
      const pdfPos = viewportToPdf(pos.x, pos.y, viewport);
      onAddAnnotation({
        type: 'note', page: pageNum, color: annotationColor,
        x: pdfPos.x, y: pdfPos.y, content: '', collapsed: false,
      });

    } else if (activeTool === 'add-text') {
      const pos    = getPointerPos(e);
      const pdfPos = viewportToPdf(pos.x, pos.y, viewport);
      const ann = onAddAnnotation({
        type: 'text-box', page: pageNum,
        x: pdfPos.x, y: pdfPos.y,
        text: '',
        fontSize: annotationFontSize || 14,
        color: annotationColor || '#000000',
      });
      if (ann?.id) setEditingTextId(ann.id);

    } else if (activeTool === 'add-image' && pendingImage) {
      const pos    = getPointerPos(e);
      const pdfPos = viewportToPdf(pos.x, pos.y, viewport);
      // Default size: 1/3 of page width, maintaining aspect ratio
      const pageW  = viewport.viewBox ? viewport.viewBox[2] : (viewport.width / viewport.scale);
      const defW   = pageW / 3;
      const aspect = pendingImage.naturalH / pendingImage.naturalW;
      onAddAnnotation({
        type: 'image-overlay', page: pageNum,
        x: pdfPos.x, y: pdfPos.y,
        w: defW, h: defW * aspect,
        dataURL: pendingImage.dataURL,
      });
    }
  }

  function handlePointerMove(e) {
    if (activeTool === 'draw' && currentStroke) {
      const pos = getPointerPos(e);
      setCurrentStroke((prev) => ({ ...prev, points: [...prev.points, pos] }));
    }
  }

  function handlePointerUp() {
    if (activeTool === 'draw' && currentStroke && currentStroke.points.length > 1) {
      const pdfPoints = currentStroke.points.map((p) => viewportToPdf(p.x, p.y, viewport));
      onAddAnnotation({
        type: 'drawing', page: pageNum,
        color: currentStroke.color, strokeWidth: currentStroke.strokeWidth || 2,
        points: pdfPoints,
      });
    }
    setCurrentStroke(null);
  }

  function handleAnnotationClick(e, annId) {
    e.stopPropagation();
    if (activeTool === 'eraser') onDeleteAnnotation(annId);
  }

  function handleNoteClick(e, annId) {
    e.stopPropagation();
    if (activeTool === 'eraser') onDeleteAnnotation(annId);
    else setEditingNoteId((prev) => (prev === annId ? null : annId));
  }

  // ── Drag handlers for repositionable annotations ──────────────────────────
  function startDrag(e, ann) {
    if (activeTool !== 'cursor') return;
    e.stopPropagation();
    dragRef.current = {
      id: ann.id,
      startX: e.clientX, startY: e.clientY,
      origX: ann.x, origY: ann.y,
    };
    function onMove(ev) {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const pdfDelta = {
        x: dx / viewport.scale,
        y: -dy / viewport.scale,
      };
      onUpdateAnnotation(dragRef.current.id, {
        x: dragRef.current.origX + pdfDelta.x,
        y: dragRef.current.origY + pdfDelta.y,
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function pointsToPath(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const highlights   = annotations.filter((a) => a.type === 'highlight');
  const drawings     = annotations.filter((a) => a.type === 'drawing');
  const notes        = annotations.filter((a) => a.type === 'note');
  const textBoxes    = annotations.filter((a) => a.type === 'text-box');
  const imageOverlays= annotations.filter((a) => a.type === 'image-overlay');

  return (
    <>
      <svg
        ref={svgRef}
        className="annotation-layer"
        width={viewport.width}
        height={viewport.height}
        style={{
          position: 'absolute', top: 0, left: 0,
          pointerEvents: isInteractive ? 'auto' : 'none',
          cursor: activeTool === 'draw'      ? 'crosshair'
                : activeTool === 'note'      ? 'cell'
                : activeTool === 'eraser'    ? 'pointer'
                : activeTool === 'add-text'  ? 'text'
                : activeTool === 'add-image' ? 'copy'
                : 'default',
        }}
        onPointerDown={isInteractive ? handlePointerDown : undefined}
        onPointerMove={isInteractive ? handlePointerMove : undefined}
        onPointerUp={isInteractive   ? handlePointerUp   : undefined}
      >
        {/* Highlight rects */}
        {highlights.map((ann) =>
          ann.rects.map((rect, i) => {
            const vr = rectPdfToViewport(rect, viewport);
            return (
              <rect
                key={`${ann.id}-${i}`}
                x={vr.x} y={vr.y} width={vr.w} height={vr.h}
                fill={ann.color}
                opacity={hoveredId === ann.id && activeTool === 'eraser' ? 0.7 : 0.35}
                rx={2}
                stroke={hoveredId === ann.id && activeTool === 'eraser' ? '#ff0000' : 'none'}
                strokeWidth={2}
                style={{ pointerEvents: activeTool === 'eraser' ? 'auto' : 'none' }}
                onClick={(e) => handleAnnotationClick(e, ann.id)}
                onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })
        )}

        {/* Drawing strokes */}
        {drawings.map((ann) => {
          const vpPoints = ann.points.map((p) => pdfToViewport(p.x, p.y, viewport));
          return (
            <path
              key={ann.id}
              d={pointsToPath(vpPoints)}
              stroke={hoveredId === ann.id && activeTool === 'eraser' ? '#ff0000' : ann.color}
              strokeWidth={ann.strokeWidth * viewport.scale}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)}
              onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          );
        })}

        {/* Active drawing stroke */}
        {currentStroke && currentStroke.points.length > 1 && (
          <path
            d={pointsToPath(currentStroke.points)}
            stroke={currentStroke.color}
            strokeWidth={currentStroke.strokeWidth * viewport.scale}
            fill="none" strokeLinecap="round" strokeLinejoin="round"
            opacity={0.7}
          />
        )}

        {/* Note icons */}
        {notes.map((ann) => {
          const vp = pdfToViewport(ann.x, ann.y, viewport);
          const isErasing = hoveredId === ann.id && activeTool === 'eraser';
          return (
            <g
              key={ann.id}
              transform={`translate(${vp.x - 10}, ${vp.y - 10})`}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={(e) => handleNoteClick(e, ann.id)}
              onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <rect width={20} height={20} rx={3}
                fill={isErasing ? '#ff4444' : ann.color}
                stroke={isErasing ? '#ff0000' : 'rgba(0,0,0,0.2)'} strokeWidth={1} />
              <text x={10} y={14} textAnchor="middle" fontSize={12}
                fill="rgba(0,0,0,0.6)" style={{ pointerEvents: 'none' }}>N</text>
            </g>
          );
        })}

        {/* Image overlays */}
        {imageOverlays.map((ann) => {
          const vp = pdfToViewport(ann.x, ann.y, viewport);
          const vp2 = pdfToViewport(ann.x + ann.w, ann.y - ann.h, viewport);
          const x = Math.min(vp.x, vp2.x);
          const y = Math.min(vp.y, vp2.y);
          const w = Math.abs(vp2.x - vp.x);
          const h = Math.abs(vp2.y - vp.y);
          const isErasing = hoveredId === ann.id && activeTool === 'eraser';
          return (
            <g key={ann.id}>
              <image
                href={ann.dataURL}
                x={x} y={y} width={w} height={h}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  pointerEvents: activeTool === 'eraser' || activeTool === 'cursor' ? 'auto' : 'none',
                  cursor: activeTool === 'cursor' ? 'move' : activeTool === 'eraser' ? 'pointer' : 'default',
                  outline: isErasing ? '2px solid red' : 'none',
                  opacity: isErasing ? 0.7 : 1,
                }}
                onClick={(e) => { e.stopPropagation(); if (activeTool === 'eraser') onDeleteAnnotation(ann.id); }}
                onPointerDown={(e) => startDrag(e, ann)}
                onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
              {activeTool === 'cursor' && (
                <rect x={x} y={y} width={w} height={h}
                  fill="none" stroke="rgba(100,100,255,0.4)" strokeWidth={1}
                  strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Sticky note popups */}
      {notes
        .filter((ann) => editingNoteId === ann.id || !ann.collapsed)
        .map((ann) => {
          const vp = pdfToViewport(ann.x, ann.y, viewport);
          return (
            <StickyNotePopup
              key={`popup-${ann.id}`}
              annotation={ann}
              vpX={vp.x} vpY={vp.y}
              onUpdate={(patch) => onUpdateAnnotation(ann.id, patch)}
              onClose={() => {
                setEditingNoteId(null);
                onUpdateAnnotation(ann.id, { collapsed: true });
              }}
              onDelete={() => onDeleteAnnotation(ann.id)}
            />
          );
        })}

      {/* Text-box overlays */}
      {textBoxes.map((ann) => {
        const vp = pdfToViewport(ann.x, ann.y, viewport);
        const isEditing = editingTextId === ann.id;
        const isErasing = hoveredId === ann.id && activeTool === 'eraser';
        const scaledFont = Math.max(8, (ann.fontSize || 14) * viewport.scale);

        return (
          <div
            key={`tb-${ann.id}`}
            style={{
              position: 'absolute',
              left: vp.x,
              top: vp.y,
              zIndex: isEditing ? 20 : 10,
              pointerEvents: 'auto',
            }}
          >
            {isEditing ? (
              <textarea
                autoFocus
                defaultValue={ann.text}
                className="text-box-editor"
                style={{ fontSize: scaledFont, color: ann.color || '#000000' }}
                onBlur={(e) => {
                  const txt = e.target.value;
                  if (!txt.trim()) onDeleteAnnotation(ann.id);
                  else onUpdateAnnotation(ann.id, { text: txt });
                  setEditingTextId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    const txt = e.target.value;
                    if (!txt.trim()) onDeleteAnnotation(ann.id);
                    else onUpdateAnnotation(ann.id, { text: txt });
                    setEditingTextId(null);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className={`text-box-display${isErasing ? ' text-box-erase' : ''}`}
                style={{
                  fontSize: scaledFont,
                  color: ann.color || '#000000',
                  cursor: activeTool === 'eraser'  ? 'pointer'
                        : activeTool === 'cursor'  ? 'move'
                        : activeTool === 'add-text' ? 'text'
                        : 'default',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeTool === 'eraser') onDeleteAnnotation(ann.id);
                  else if (activeTool === 'cursor' || activeTool === 'add-text') setEditingTextId(ann.id);
                }}
                onPointerDown={(e) => {
                  if (activeTool === 'cursor') startDrag(e, ann);
                }}
                onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {ann.text || '…'}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
