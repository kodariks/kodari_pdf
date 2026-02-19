import { useState, useRef, useCallback } from 'react';
import { rectPdfToViewport, pdfToViewport, viewportToPdf } from '../utils/coordTransform.js';
import StickyNotePopup from './StickyNotePopup.jsx';

/**
 * SVG overlay rendered per page — sits between the canvas and the text layer.
 * Renders highlights, drawings, and note icons.
 * Handles mouse events for draw, note placement, and eraser tools.
 */
export default function AnnotationLayer({
  annotations,
  viewport,
  pageNum,
  activeTool,
  annotationColor,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}) {
  const svgRef = useRef(null);
  const [currentStroke, setCurrentStroke] = useState(null); // drawing in progress
  const [hoveredId, setHoveredId] = useState(null);         // for eraser preview
  const [editingNoteId, setEditingNoteId] = useState(null); // expanded note

  if (!viewport) return null;

  const isInteractive = activeTool === 'draw' || activeTool === 'note' || activeTool === 'eraser';

  // ── Drawing handlers ─────────────────────────────────────────────────────
  const getPointerPos = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  function handlePointerDown(e) {
    if (activeTool === 'draw') {
      const pos = getPointerPos(e);
      setCurrentStroke({ points: [pos], color: annotationColor, strokeWidth: 2 });
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (activeTool === 'note') {
      const pos = getPointerPos(e);
      const pdfPos = viewportToPdf(pos.x, pos.y, viewport);
      onAddAnnotation({
        type: 'note',
        page: pageNum,
        color: annotationColor,
        x: pdfPos.x,
        y: pdfPos.y,
        content: '',
        collapsed: false,
      });
    }
  }

  function handlePointerMove(e) {
    if (activeTool === 'draw' && currentStroke) {
      const pos = getPointerPos(e);
      setCurrentStroke((prev) => ({
        ...prev,
        points: [...prev.points, pos],
      }));
    }
  }

  function handlePointerUp() {
    if (activeTool === 'draw' && currentStroke && currentStroke.points.length > 1) {
      // Convert all points from viewport to PDF coordinates
      const pdfPoints = currentStroke.points.map((p) => viewportToPdf(p.x, p.y, viewport));
      onAddAnnotation({
        type: 'drawing',
        page: pageNum,
        color: currentStroke.color,
        strokeWidth: 2,
        points: pdfPoints,
      });
    }
    setCurrentStroke(null);
  }

  function handleAnnotationClick(e, annId) {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      onDeleteAnnotation(annId);
    }
  }

  function handleNoteClick(e, annId) {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      onDeleteAnnotation(annId);
    } else {
      setEditingNoteId((prev) => (prev === annId ? null : annId));
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function pointsToPath(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const highlights = annotations.filter((a) => a.type === 'highlight');
  const drawings   = annotations.filter((a) => a.type === 'drawing');
  const notes      = annotations.filter((a) => a.type === 'note');

  return (
    <>
      <svg
        ref={svgRef}
        className="annotation-layer"
        width={viewport.width}
        height={viewport.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: isInteractive ? 'auto' : 'none',
          cursor: activeTool === 'draw' ? 'crosshair'
            : activeTool === 'note' ? 'cell'
            : activeTool === 'eraser' ? 'pointer'
            : 'default',
        }}
        onPointerDown={isInteractive ? handlePointerDown : undefined}
        onPointerMove={isInteractive ? handlePointerMove : undefined}
        onPointerUp={isInteractive ? handlePointerUp : undefined}
      >
        {/* Highlight rects */}
        {highlights.map((ann) =>
          ann.rects.map((rect, i) => {
            const vr = rectPdfToViewport(rect, viewport);
            return (
              <rect
                key={`${ann.id}-${i}`}
                x={vr.x}
                y={vr.y}
                width={vr.w}
                height={vr.h}
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

        {/* Active drawing stroke (in progress) */}
        {currentStroke && currentStroke.points.length > 1 && (
          <path
            d={pointsToPath(currentStroke.points)}
            stroke={currentStroke.color}
            strokeWidth={currentStroke.strokeWidth * viewport.scale}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
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
              <rect
                width={20}
                height={20}
                rx={3}
                fill={isErasing ? '#ff4444' : ann.color}
                stroke={isErasing ? '#ff0000' : 'rgba(0,0,0,0.2)'}
                strokeWidth={1}
              />
              <text
                x={10}
                y={14}
                textAnchor="middle"
                fontSize={12}
                fill="rgba(0,0,0,0.6)"
                style={{ pointerEvents: 'none' }}
              >
                N
              </text>
            </g>
          );
        })}
      </svg>

      {/* Sticky note popups (rendered outside SVG for proper HTML) */}
      {notes
        .filter((ann) => editingNoteId === ann.id || !ann.collapsed)
        .map((ann) => {
          const vp = pdfToViewport(ann.x, ann.y, viewport);
          return (
            <StickyNotePopup
              key={`popup-${ann.id}`}
              annotation={ann}
              vpX={vp.x}
              vpY={vp.y}
              onUpdate={(patch) => onUpdateAnnotation(ann.id, patch)}
              onClose={() => {
                setEditingNoteId(null);
                onUpdateAnnotation(ann.id, { collapsed: true });
              }}
              onDelete={() => onDeleteAnnotation(ann.id)}
            />
          );
        })}
    </>
  );
}
