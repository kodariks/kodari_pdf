import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_PREFIX = 'kodari_annotations_';
const MAX_HISTORY    = 50;

function storageKey(pdfName) {
  return STORAGE_PREFIX + pdfName;
}

/**
 * Custom hook for managing PDF annotations with localStorage persistence
 * and a full undo / redo history stack (up to MAX_HISTORY entries).
 *
 * Each PDFViewer instance calls this with its own pdfName.
 */
export function useAnnotations(pdfName) {
  // History stack: { past: [], present: [], future: [] }
  const [history, setHistory] = useState({ past: [], present: [], future: [] });
  const loaded = useRef(false);

  const annotations = history.present;

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfName) {
      setHistory({ past: [], present: [], future: [] });
      loaded.current = false;
      return;
    }
    try {
      const raw  = localStorage.getItem(storageKey(pdfName));
      const saved = raw ? JSON.parse(raw) : [];
      setHistory({ past: [], present: saved, future: [] });
    } catch {
      setHistory({ past: [], present: [], future: [] });
    }
    loaded.current = true;
  }, [pdfName]);

  // ── Debounced save ────────────────────────────────────────────────────────
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

  // ── Mutate helper: push present to past, clear future ─────────────────────
  function mutate(updater) {
    setHistory((prev) => ({
      past:    [...prev.past.slice(-MAX_HISTORY), prev.present],
      present: updater(prev.present),
      future:  [],
    }));
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const addAnnotation = useCallback((partial) => {
    const ann = {
      ...partial,
      id:        crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
    };
    mutate((prev) => [...prev, ann]);
    return ann;
  }, []);

  const updateAnnotation = useCallback((id, patch) => {
    mutate((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const deleteAnnotation = useCallback((id) => {
    mutate((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const getPageAnnotations = useCallback(
    (pageNum) => annotations.filter((a) => a.page === pageNum),
    [annotations]
  );

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.past.length) return prev;
      const newPast    = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];
      return {
        past:    newPast,
        present: newPresent,
        future:  [prev.present, ...prev.future.slice(0, MAX_HISTORY - 1)],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.future.length) return prev;
      const [newPresent, ...newFuture] = prev.future;
      return {
        past:    [...prev.past.slice(-MAX_HISTORY), prev.present],
        present: newPresent,
        future:  newFuture,
      };
    });
  }, []);

  const canUndo = history.past.length   > 0;
  const canRedo = history.future.length > 0;

  return {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getPageAnnotations,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
