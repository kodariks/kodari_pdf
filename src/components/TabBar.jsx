export default function TabBar({ tabs, activeTabId, onSwitchTab, onCloseTab, onNewTab }) {
  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
            onClick={() => onSwitchTab(tab.id)}
            title={tab.name}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="tab-name">{tab.name}</span>
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.name}`}
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onCloseTab(tab.id); } }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>
      <button className="tab-add" onClick={onNewTab} title="Open another PDF">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  );
}
