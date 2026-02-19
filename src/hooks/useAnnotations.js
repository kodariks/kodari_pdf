import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_PREFIX = 'kodari_annotations_';

function storageKey(pdfName) {
  return STORAGE_PREFIX + pdfName;
}

/**
 * Custom hook for managing PDF annotations with localStorage persistence.
 * Each PDFViewer instance calls this with its own pdfName.
 */
export function useAnnotations(pdfName) {
  const [annotations, setAnnotations] = useState([]);
  const loaded = useRef(false);

  // Load annotations when pdfName changes
  useEffect(() => {
    if (!pdfName) {
      setAnnotations([]);
      loaded.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(pdfName));
      setAnnotations(raw ? JSON.parse(raw) : []);
    } catch {
      setAnnotations([]);
    }
    loaded.current = true;
  }, [pdfName]);

  // Debounced save to localStorage whenever annotations change
  useEffect(() => {
    if (!pdfName || !loaded.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(pdfName), JSON.stringify(annotations));
      } catch (e) {
        console.warn('Failed to save annotations:', e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [annotations, pdfName]);

  const addAnnotation = useCallback((partial) => {
    const ann = {
      ...partial,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
    };
    setAnnotations((prev) => [...prev, ann]);
    return ann;
  }, []);

  const updateAnnotation = useCallback((id, patch) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const deleteAnnotation = useCallback((id) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const getPageAnnotations = useCallback(
    (pageNum) => annotations.filter((a) => a.page === pageNum),
    [annotations]
  );

  return {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getPageAnnotations,
  };
}
