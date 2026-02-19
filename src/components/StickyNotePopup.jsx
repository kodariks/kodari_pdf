import { useState, useRef, useEffect } from 'react';

/**
 * Positioned popup for editing a sticky note's content.
 * Rendered as an absolutely positioned div within the page-wrapper.
 */
export default function StickyNotePopup({ annotation, vpX, vpY, onUpdate, onClose, onDelete }) {
  const [text, setText] = useState(annotation.content || '');
  const textareaRef = useRef(null);

  useEffect(() => {
    setText(annotation.content || '');
  }, [annotation.content]);

  useEffect(() => {
    // Focus textarea when popup opens
    textareaRef.current?.focus();
  }, []);

  function handleBlur() {
    onUpdate({ content: text });
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      onUpdate({ content: text });
      onClose();
    }
    // Stop propagation so global keyboard shortcuts don't fire
    e.stopPropagation();
  }

  return (
    <div
      className="note-popup"
      style={{
        position: 'absolute',
        left: `${vpX + 14}px`,
        top: `${vpY - 10}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="note-popup-header" style={{ background: annotation.color }}>
        <span className="note-popup-title">Note</span>
        <div className="note-popup-actions">
          <button
            className="note-popup-btn"
            onClick={() => { onUpdate({ content: text }); onClose(); }}
            title="Collapse note"
          >
            _
          </button>
          <button
            className="note-popup-btn"
            onClick={onDelete}
            title="Delete note"
          >
            &times;
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="note-popup-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Type your note here..."
        rows={4}
      />
    </div>
  );
}
