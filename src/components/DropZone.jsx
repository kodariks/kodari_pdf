import { useState, useCallback } from 'react';

export default function DropZone({ onDrop, onOpen, isLoading }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  }, [onDrop]);

  return (
    <div
      className={`dropzone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label="PDF drop zone"
    >
      <div className="dropzone-content">
        {/* Logo / Icon */}
        <div className="dropzone-icon">
          <svg viewBox="0 0 80 80" fill="none">
            <rect width="80" height="80" rx="16" fill="#e63946" opacity="0.15" />
            <path
              d="M24 12h22l14 14v42a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"
              fill="#e63946"
              opacity="0.8"
            />
            <path d="M46 12l14 14H46V12z" fill="#fff" opacity="0.4" />
            <text x="20" y="52" fontSize="14" fontWeight="bold" fill="#fff" fontFamily="sans-serif">PDF</text>
          </svg>
        </div>

        <h1 className="dropzone-title">Kodari PDF</h1>
        <p className="dropzone-subtitle">
          {isDragging ? 'Drop your PDF here' : 'Open or drag & drop a PDF file'}
        </p>

        {isLoading ? (
          <div className="loading-spinner" />
        ) : (
          <button className="open-btn" onClick={onOpen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Open PDF
          </button>
        )}

        <p className="dropzone-hint">
          Supports PDF files up to any size · Text selection · Dark mode · Thumbnails
        </p>

        <div className="dropzone-features">
          <span className="feature-badge">🖥 Desktop App</span>
          <span className="feature-badge">🌐 Works Online</span>
          <span className="feature-badge">🔒 Privacy First</span>
        </div>
      </div>
    </div>
  );
}
