import React, { useEffect, useRef, useState } from 'react';

// Select box with a search field. options: [{ value, label, hint? }].
// value '' = nothing picked; clearLabel (when given) adds a "none" option.
export default function SearchSelect({ value, options, onChange, placeholder = 'Select…', clearLabel, loading = false, error = '', id }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q));
  const items = clearLabel && !q ? [{ value: '', label: clearLabel, none: true }, ...filtered] : filtered;

  useEffect(() => {
    if (!open) return undefined;
    setQuery(''); setActive(0);
    setTimeout(() => searchRef.current?.focus(), 0);
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => { listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (o) => { onChange(o.value, o); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="ss" ref={wrapRef}>
      <button type="button" id={id} className="ss-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={selected ? '' : 'ss-placeholder'}>{selected ? selected.label : (value ? value : placeholder)}</span>
        <span aria-hidden="true" className="ss-caret">▾</span>
      </button>
      {open && (
        <div className="ss-menu">
          <input
            ref={searchRef} className="ss-search" placeholder="Search…" value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} aria-label="Search options"
          />
          {loading ? <div className="ss-empty">Loading…</div>
            : error ? <div className="ss-empty" style={{ color: '#B91C1C' }}>{error}</div>
              : items.length === 0 ? <div className="ss-empty">No matches</div>
                : (
                  <ul className="ss-list" role="listbox" ref={listRef}>
                    {items.map((o, i) => (
                      <li
                        key={o.value || '__none'} role="option" aria-selected={o.value === value}
                        className={`ss-option${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}${o.none ? ' ss-none' : ''}`}
                        onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                      >
                        <span>{o.label}</span>
                        {o.hint && <span className="ss-hint">{o.hint}</span>}
                      </li>
                    ))}
                  </ul>
                )}
        </div>
      )}
    </div>
  );
}
