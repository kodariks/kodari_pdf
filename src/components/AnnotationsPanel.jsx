/**
 * Sidebar panel listing all annotations grouped by page.
 * Click to navigate, delete button to remove.
 */
export default function AnnotationsPanel({ annotations, onPageSelect, onDeleteAnnotation }) {
  if (!annotations || annotations.length === 0) {
    return (
      <div className="sidebar-loading" style={{ padding: '20px', textAlign: 'center' }}>
        No annotations yet. Use the toolbar to highlight text, add notes, or draw.
      </div>
    );
  }

  // Group by page
  const grouped = {};
  annotations.forEach((ann) => {
    if (!grouped[ann.page]) grouped[ann.page] = [];
    grouped[ann.page].push(ann);
  });
  const sortedPages = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  function typeIcon(type) {
    if (type === 'highlight') return 'H';
    if (type === 'underline') return 'U';
    if (type === 'strikethrough') return 'S';
    if (type === 'note') return 'N';
    if (type === 'drawing') return 'D';
    if (type === 'text-box') return 'T';
    if (type === 'image-overlay') return 'I';
    if (type?.startsWith('shape-')) return '◇';
    if (type === 'stamp') return '⊡';
    if (type === 'redact') return '■';
    return '?';
  }

  function typeLabel(ann) {
    if (ann.type === 'highlight') return ann.text?.slice(0, 60) || 'Highlight';
    if (ann.type === 'underline') return ann.text?.slice(0, 60) || 'Underline';
    if (ann.type === 'strikethrough') return ann.text?.slice(0, 60) || 'Strikethrough';
    if (ann.type === 'note') return ann.content?.slice(0, 60) || 'Empty note';
    if (ann.type === 'drawing') return 'Drawing';
    if (ann.type === 'text-box') return ann.text?.slice(0, 60) || 'Text';
    if (ann.type === 'image-overlay') return 'Image';
    if (ann.type === 'shape-rect') return 'Rectangle';
    if (ann.type === 'shape-circle') return 'Circle';
    if (ann.type === 'shape-arrow') return 'Arrow';
    if (ann.type === 'shape-line') return 'Line';
    if (ann.type === 'stamp') return ann.stampText || 'Stamp';
    if (ann.type === 'redact') return 'Redaction';
    return 'Annotation';
  }

  return (
    <div className="annotations-panel">
      {sortedPages.map((page) => (
        <div key={page} className="ann-page-group">
          <div className="ann-page-header">Page {page}</div>
          {grouped[page]
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((ann) => (
              <div
                key={ann.id}
                className="ann-item"
                onClick={() => onPageSelect(ann.page)}
              >
                <span className="ann-item-color" style={{ background: ann.color }} />
                <span className="ann-item-icon">{typeIcon(ann.type)}</span>
                <span className="ann-item-text">
                  {typeLabel(ann)}
                  {((ann.text?.length || 0) > 60 || (ann.content?.length || 0) > 60) ? '...' : ''}
                </span>
                <button
                  className="ann-item-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id); }}
                  title="Delete annotation"
                >
                  &times;
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
