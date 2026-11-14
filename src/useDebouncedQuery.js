import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 180;

export function useDebouncedQuery(delay = SEARCH_DEBOUNCE_MS) {
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const timerRef = useRef(null);

  const update = (next) => {
    const text = next == null ? '' : String(next);
    setValue(text);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!text.trim()) {
      setDebounced('');
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebounced(text);
    }, delay);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [value, debounced, update];
}
