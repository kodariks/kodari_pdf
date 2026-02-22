const SHORTCUTS = [
  { section: 'Navigation', items: [
    { keys: ['→', '↓', 'PgDn'], desc: 'Next page' },
    { keys: ['←', '↑', 'PgUp'], desc: 'Previous page' },
    { keys: ['Home'], desc: 'First page' },
    { keys: ['End'], desc: 'Last page' },
  ]},
  { section: 'Zoom & View', items: [
    { keys: ['+', '='], desc: 'Zoom in' },
    { keys: ['-'], desc: 'Zoom out' },
    { keys: ['0'], desc: 'Fit to width' },
    { keys: ['Ctrl+Scroll'], desc: 'Zoom in/out' },
    { keys: ['R'], desc: 'Rotate clockwise' },
    { keys: ['F11'], desc: 'Fullscreen' },
  ]},
  { section: 'Tools', items: [
    { keys: ['Esc'], desc: 'Select / Cancel' },
    { keys: ['H'], desc: 'Highlight' },
    { keys: ['U'], desc: 'Underline' },
    { keys: ['S'], desc: 'Strikethrough' },
    { keys: ['N'], desc: 'Sticky note' },
    { keys: ['D'], desc: 'Draw' },
    { keys: ['E'], desc: 'Eraser' },
    { keys: ['T'], desc: 'Add text' },
  ]},
  { section: 'General', items: [
    { keys: ['Ctrl+Z'], desc: 'Undo' },
    { keys: ['Ctrl+Y'], desc: 'Redo' },
    { keys: ['Ctrl+F'], desc: 'Search in PDF' },
    { keys: ['Ctrl+P'], desc: 'Print' },
    { keys: ['Ctrl+O'], desc: 'Open file' },
    { keys: ['?'], desc: 'Show shortcuts' },
  ]},
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box modal-large">
        <div className="modal-header">
          <div className="modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M6 8h4M14 8h4M6 12h12M10 16h4"/>
            </svg>
            Keyboard Shortcuts
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxHeight: '60vh', overflowY: 'auto' }}>
          {SHORTCUTS.map((section) => (
            <div key={section.section}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 8 }}>
                {section.section}
              </div>
              {section.items.map((item) => (
                <div key={item.desc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--text)' }}>{item.desc}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {item.keys.map((k) => (
                      <kbd key={k} style={{
                        background: 'var(--btn)', border: '1px solid var(--border)', borderRadius: 4,
                        padding: '2px 6px', fontSize: 11, fontFamily: 'var(--font)', color: 'var(--muted)',
                        minWidth: 20, textAlign: 'center',
                      }}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
