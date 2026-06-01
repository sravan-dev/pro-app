import { useState, useEffect } from 'react';

// Keeps the active tab across page refreshes by saving it to localStorage.
// `key` should be unique per portal so each remembers its own tab.
export default function usePersistedTab(key, initial = 'dashboard') {
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem(key) || initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, tab);
    } catch {
      /* ignore storage errors (private mode, quota) */
    }
  }, [key, tab]);

  return [tab, setTab];
}
