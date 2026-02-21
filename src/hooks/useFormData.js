import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'kodari_form_';

function storageKey(pdfName) {
  return STORAGE_PREFIX + pdfName;
}

/**
 * Custom hook to persist PDF form field values to localStorage.
 * Works with pdfjs AnnotationStorage — saves/restores form data keyed by PDF name.
 *
 * @param {string} pdfName - Filename used as localStorage key
 * @param {import('pdfjs-dist').AnnotationStorage|null} annotationStorage - pdfjs storage instance
 */
export function useFormData(pdfName, annotationStorage) {
  const loaded = useRef(false);

  // Restore saved form data when PDF opens
  useEffect(() => {
    if (!pdfName || !annotationStorage) {
      loaded.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(pdfName));
      if (raw) {
        const saved = JSON.parse(raw);
        // saved is { fieldId: { value: ... }, ... }
        if (saved && typeof saved === 'object') {
          for (const [key, val] of Object.entries(saved)) {
            annotationStorage.setValue(key, val);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
    loaded.current = true;
  }, [pdfName, annotationStorage]);

  // Save form data whenever annotationStorage is modified
  useEffect(() => {
    if (!pdfName || !annotationStorage || !loaded.current) return;

    function save() {
      try {
        const all = annotationStorage.getAll();
        if (all) {
          localStorage.setItem(storageKey(pdfName), JSON.stringify(all));
        }
      } catch (e) {
        console.warn('Failed to save form data:', e);
      }
    }

    // pdfjs fires onSetModified when any field value changes
    const prevCallback = annotationStorage.onSetModified;
    annotationStorage.onSetModified = () => {
      if (prevCallback) prevCallback();
      // Debounce save
      clearTimeout(annotationStorage._kodariSaveTimer);
      annotationStorage._kodariSaveTimer = setTimeout(save, 300);
    };

    return () => {
      clearTimeout(annotationStorage._kodariSaveTimer);
      annotationStorage.onSetModified = prevCallback || null;
    };
  }, [pdfName, annotationStorage]);
}
