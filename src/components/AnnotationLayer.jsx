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
  const [shapeStart,     setShapeStart]     = useState(null); // { x, y } for shape drawing
  const [shapeEnd,       setShapeEnd]       = useState(null);
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

  const SHAPE_TOOLS = ['shape-rect', 'shape-circle', 'shape-arrow', 'shape-line'];
  const isShapeTool = SHAPE_TOOLS.includes(activeTool);
  const isInteractive = ['draw', 'note', 'eraser', 'add-text', 'add-image', 'stamp', 'redact', ...SHAPE_TOOLS].includes(activeTool);

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
      const pageW  = viewport.viewBox ? viewport.viewBox[2] : (viewport.width / viewport.scale);
      const defW   = pageW / 3;
      const aspect = pendingImage.naturalH / pendingImage.naturalW;
      onAddAnnotation({
        type: 'image-overlay', page: pageNum,
        x: pdfPos.x, y: pdfPos.y,
        w: defW, h: defW * aspect,
        dataURL: pendingImage.dataURL,
      });

    } else if (isShapeTool) {
      const pos = getPointerPos(e);
      setShapeStart(pos);
      setShapeEnd(pos);
      e.currentTarget.setPointerCapture(e.pointerId);

    } else if (activeTool === 'stamp') {
      const pos    = getPointerPos(e);
      const pdfPos = viewportToPdf(pos.x, pos.y, viewport);
      onAddAnnotation({
        type: 'stamp', page: pageNum,
        x: pdfPos.x, y: pdfPos.y,
        stampText: annotationColor === '#FFEA00' ? 'APPROVED' :
                   annotationColor === '#76FF03' ? 'APPROVED' :
                   annotationColor === '#FF1744' ? 'REJECTED' :
                   annotationColor === '#FF6E40' ? 'DRAFT' :
                   annotationColor === '#E040FB' ? 'CONFIDENTIAL' :
                   'APPROVED',
        color: annotationColor,
      });

    } else if (activeTool === 'redact') {
      const pos = getPointerPos(e);
      setShapeStart(pos);
      setShapeEnd(pos);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e) {
    if (activeTool === 'draw' && currentStroke) {
      const pos = getPointerPos(e);
      setCurrentStroke((prev) => ({ ...prev, points: [...prev.points, pos] }));
    } else if ((isShapeTool || activeTool === 'redact') && shapeStart) {
      const pos = getPointerPos(e);
      setShapeEnd(pos);
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

    if (isShapeTool && shapeStart && shapeEnd) {
      const p1 = viewportToPdf(shapeStart.x, shapeStart.y, viewport);
      const p2 = viewportToPdf(shapeEnd.x, shapeEnd.y, viewport);
      const minW = 5 / viewport.scale;
      if (Math.abs(p2.x - p1.x) > minW || Math.abs(p2.y - p1.y) > minW) {
        onAddAnnotation({
          type: activeTool, page: pageNum, color: annotationColor,
          strokeWidth: strokeWidth || 2,
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        });
      }
      setShapeStart(null);
      setShapeEnd(null);
    }

    if (activeTool === 'redact' && shapeStart && shapeEnd) {
      const p1 = viewportToPdf(shapeStart.x, shapeStart.y, viewport);
      const p2 = viewportToPdf(shapeEnd.x, shapeEnd.y, viewport);
      if (Math.abs(p2.x - p1.x) > 2 && Math.abs(p2.y - p1.y) > 2) {
        onAddAnnotation({
          type: 'redact', page: pageNum,
          x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
          w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y),
        });
      }
      setShapeStart(null);
      setShapeEnd(null);
    }
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
  const underlines   = annotations.filter((a) => a.type === 'underline');
  const strikethroughs = annotations.filter((a) => a.type === 'strikethrough');
  const drawings     = annotations.filter((a) => a.type === 'drawing');
  const shapes       = annotations.filter((a) => SHAPE_TOOLS.includes(a.type));
  const notes        = annotations.filter((a) => a.type === 'note');
  const stamps       = annotations.filter((a) => a.type === 'stamp');
  const redactions   = annotations.filter((a) => a.type === 'redact');
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
                : activeTool === 'stamp'     ? 'copy'
                : activeTool === 'redact'    ? 'crosshair'
                : isShapeTool                ? 'crosshair'
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

        {/* Underline annotations */}
        {underlines.map((ann) =>
          ann.rects.map((rect, i) => {
            const vr = rectPdfToViewport(rect, viewport);
            return (
              <line
                key={`${ann.id}-${i}`}
                x1={vr.x} y1={vr.y + vr.h} x2={vr.x + vr.w} y2={vr.y + vr.h}
                stroke={ann.color} strokeWidth={2 * viewport.scale}
                style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
                onClick={(e) => handleAnnotationClick(e, ann.id)}
                onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })
        )}

        {/* Strikethrough annotations */}
        {strikethroughs.map((ann) =>
          ann.rects.map((rect, i) => {
            const vr = rectPdfToViewport(rect, viewport);
            return (
              <line
                key={`${ann.id}-${i}`}
                x1={vr.x} y1={vr.y + vr.h / 2} x2={vr.x + vr.w} y2={vr.y + vr.h / 2}
                stroke={ann.color} strokeWidth={2 * viewport.scale}
                style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
                onClick={(e) => handleAnnotationClick(e, ann.id)}
                onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })
        )}

        {/* Shape annotations */}
        {shapes.map((ann) => {
          const vp1 = pdfToViewport(ann.x1, ann.y1, viewport);
          const vp2 = pdfToViewport(ann.x2, ann.y2, viewport);
          const isErasing = hoveredId === ann.id && activeTool === 'eraser';
          const stroke = isErasing ? '#ff0000' : ann.color;
          const sw = (ann.strokeWidth || 2) * viewport.scale;

          if (ann.type === 'shape-rect') {
            const x = Math.min(vp1.x, vp2.x), y = Math.min(vp1.y, vp2.y);
            const w = Math.abs(vp2.x - vp1.x), h = Math.abs(vp2.y - vp1.y);
            return <rect key={ann.id} x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={sw}
              style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)} onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)} onMouseLeave={() => setHoveredId(null)} />;
          }
          if (ann.type === 'shape-circle') {
            const cx = (vp1.x + vp2.x) / 2, cy = (vp1.y + vp2.y) / 2;
            const rx = Math.abs(vp2.x - vp1.x) / 2, ry = Math.abs(vp2.y - vp1.y) / 2;
            return <ellipse key={ann.id} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth={sw}
              style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)} onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)} onMouseLeave={() => setHoveredId(null)} />;
          }
          if (ann.type === 'shape-line') {
            return <line key={ann.id} x1={vp1.x} y1={vp1.y} x2={vp2.x} y2={vp2.y} stroke={stroke} strokeWidth={sw} strokeLinecap="round"
              style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)} onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)} onMouseLeave={() => setHoveredId(null)} />;
          }
          if (ann.type === 'shape-arrow') {
            const angle = Math.atan2(vp2.y - vp1.y, vp2.x - vp1.x);
            const headLen = 12 * viewport.scale;
            const ax1 = vp2.x - headLen * Math.cos(angle - Math.PI / 6);
            const ay1 = vp2.y - headLen * Math.sin(angle - Math.PI / 6);
            const ax2 = vp2.x - headLen * Math.cos(angle + Math.PI / 6);
            const ay2 = vp2.y - headLen * Math.sin(angle + Math.PI / 6);
            return <g key={ann.id} style={{ pointerEvents: activeTool === 'eraser' ? 'stroke' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)} onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)} onMouseLeave={() => setHoveredId(null)}>
              <line x1={vp1.x} y1={vp1.y} x2={vp2.x} y2={vp2.y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
              <polyline points={`${ax1},${ay1} ${vp2.x},${vp2.y} ${ax2},${ay2}`} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>;
          }
          return null;
        })}

        {/* Stamp annotations */}
        {stamps.map((ann) => {
          const vp = pdfToViewport(ann.x, ann.y, viewport);
          const isErasing = hoveredId === ann.id && activeTool === 'eraser';
          const fontSize = 14 * viewport.scale;
          return (
            <g key={ann.id} transform={`translate(${vp.x}, ${vp.y})`}
              style={{ pointerEvents: 'auto', cursor: activeTool === 'eraser' ? 'pointer' : activeTool === 'cursor' ? 'move' : 'default' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)}
              onPointerDown={(e) => startDrag(e, ann)}
              onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <rect x={-4} y={-fontSize - 4} width={ann.stampText.length * fontSize * 0.7 + 16} height={fontSize + 10}
                rx={3} fill="none" stroke={isErasing ? '#ff0000' : ann.color} strokeWidth={2 * viewport.scale} />
              <text x={4} y={-2} fontSize={fontSize} fill={isErasing ? '#ff0000' : ann.color}
                fontWeight="700" fontFamily="Helvetica,sans-serif" style={{ pointerEvents: 'none' }}>{ann.stampText}</text>
            </g>
          );
        })}

        {/* Redaction annotations */}
        {redactions.map((ann) => {
          const vr = rectPdfToViewport({ x: ann.x, y: ann.y, w: ann.w, h: ann.h }, viewport);
          const isErasing = hoveredId === ann.id && activeTool === 'eraser';
          return (
            <rect key={ann.id} x={vr.x} y={vr.y} width={vr.w} height={vr.h}
              fill={isErasing ? '#ff4444' : '#000000'} opacity={0.85} rx={1}
              stroke={isErasing ? '#ff0000' : 'none'} strokeWidth={2}
              style={{ pointerEvents: activeTool === 'eraser' ? 'auto' : 'none' }}
              onClick={(e) => handleAnnotationClick(e, ann.id)}
              onMouseEnter={() => activeTool === 'eraser' && setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)} />
          );
        })}

        {/* Shape preview while drawing */}
        {isShapeTool && shapeStart && shapeEnd && (() => {
          const s = shapeStart, end = shapeEnd;
          const sw = (strokeWidth || 2) * viewport.scale;
          if (activeTool === 'shape-rect') {
            return <rect x={Math.min(s.x, end.x)} y={Math.min(s.y, end.y)} width={Math.abs(end.x - s.x)} height={Math.abs(end.y - s.y)}
              fill="none" stroke={annotationColor} strokeWidth={sw} opacity={0.6} strokeDasharray="4 3" />;
          }
          if (activeTool === 'shape-circle') {
            return <ellipse cx={(s.x + end.x) / 2} cy={(s.y + end.y) / 2} rx={Math.abs(end.x - s.x) / 2} ry={Math.abs(end.y - s.y) / 2}
              fill="none" stroke={annotationColor} strokeWidth={sw} opacity={0.6} strokeDasharray="4 3" />;
          }
          if (activeTool === 'shape-line') {
            return <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke={annotationColor} strokeWidth={sw} opacity={0.6} strokeDasharray="4 3" />;
          }
          if (activeTool === 'shape-arrow') {
            return <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke={annotationColor} strokeWidth={sw} opacity={0.6} strokeDasharray="4 3" />;
          }
          return null;
        })()}

        {/* Redaction preview while drawing */}
        {activeTool === 'redact' && shapeStart && shapeEnd && (
          <rect x={Math.min(shapeStart.x, shapeEnd.x)} y={Math.min(shapeStart.y, shapeEnd.y)}
            width={Math.abs(shapeEnd.x - shapeStart.x)} height={Math.abs(shapeEnd.y - shapeStart.y)}
            fill="#000000" opacity={0.5} strokeDasharray="4 3" stroke="#ff0000" strokeWidth={1} />
        )}

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
