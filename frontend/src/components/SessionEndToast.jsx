import React, { useEffect, useRef, useState } from 'react';

// Fading top-right toast that warns both the tutor and the student as a live
// session nears its scheduled end. Rendered once from SessionRoom, so it sits
// above whichever video backend (LiveKit / WebRTC) is in use.
//
// Warnings fire as the remaining time crosses each threshold below (minutes).
// 15 is the one the academy asked for; 5 and 1 are gentle follow-ups. Each
// threshold fires at most once, and the copy always shows the ACTUAL minutes
// left, so a tutor who joins late (already inside the window) still gets an
// accurate notice instead of a stale "15 minutes".
const WARN_THRESHOLDS = [15, 5, 1];
const TOAST_TTL_MS = 7000;   // how long a toast stays before it fades out
const FADE_MS = 450;         // must match the CSS fade-out animation length

// Parse the session's scheduled end. Stored values are wall-clock strings from a
// datetime-local input ('YYYY-MM-DDTHH:MM'), which new Date() reads in the
// viewer's local zone — the same clock the countdown runs on.
function parseEnd(session) {
  const raw = session?.end_time;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export default function SessionEndToast({ session }) {
  const [toasts, setToasts] = useState([]);
  // Thresholds already fired, plus the one-shot "time is up" flag. Kept in refs
  // so the ticking interval never reintroduces a warning it already showed.
  const firedRef = useRef(new Set());
  const endedRef = useRef(false);
  const idRef = useRef(0);
  const timersRef = useRef([]);

  const dismiss = (id) => {
    // Two-phase removal so the CSS fade-out can play before the node unmounts.
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const h = setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, FADE_MS);
    timersRef.current.push(h);
  };

  const pushToast = (text) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, text, leaving: false }]);
    const h = setTimeout(() => dismiss(id), TOAST_TTL_MS);
    timersRef.current.push(h);
  };

  useEffect(() => {
    const end = parseEnd(session);
    // No usable end, or the session's slot is already over when we mount: show
    // nothing (don't spam warnings for a past/overrun session on join).
    if (end === null || end - Date.now() <= 0) return undefined;

    const tick = () => {
      const remainingMs = end - Date.now();
      const remainingMin = remainingMs / 60000;

      if (remainingMs <= 0) {
        if (!endedRef.current) {
          endedRef.current = true;
          pushToast("This session's scheduled time is up.");
        }
        return;
      }

      // Fire every threshold we've just crossed. Mark them all fired but raise a
      // single toast carrying the real minutes left, so crossing two at once
      // (a late joiner) doesn't stack duplicates.
      const crossed = WARN_THRESHOLDS.filter(
        (t) => !firedRef.current.has(t) && remainingMin <= t
      );
      if (crossed.length) {
        crossed.forEach((t) => firedRef.current.add(t));
        const mins = Math.max(1, Math.round(remainingMin));
        pushToast(`Session ends in about ${mins} minute${mins === 1 ? '' : 's'}.`);
      }
    };

    tick(); // evaluate immediately on mount (covers a late join inside the window)
    const iv = setInterval(tick, 1000);
    return () => {
      clearInterval(iv);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [session]);

  if (!toasts.length) return null;

  return (
    <div className="session-toast-wrap" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`session-toast${t.leaving ? ' leaving' : ''}`}>
          <span className="session-toast-icon" aria-hidden="true">⏳</span>
          <span className="session-toast-text">{t.text}</span>
          <button
            type="button"
            className="session-toast-close"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
