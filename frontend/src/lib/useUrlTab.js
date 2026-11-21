import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Keeps the selected tab in the address bar (?tab=bookings). A refresh, a
// shared link or the browser's Back button then land on the same tab, instead
// of falling back to the first one. Other query parameters are left alone.
export function useUrlTab(validKeys, fallback) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = validKeys.includes(raw) ? raw : fallback;
  const setTab = useCallback((next) => {
    setParams((current) => {
      const n = new URLSearchParams(current);
      if (next === fallback) n.delete('tab'); else n.set('tab', next);
      return n;
    });
  }, [fallback, setParams]);
  return [tab, setTab];
}
