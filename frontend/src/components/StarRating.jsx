import React, { useState } from 'react';

// Controlled 1-5 star widget. `value` is the current rating, `onChange(n)` fires
// on click, `readOnly` renders static stars (for rating views). `size` in px.
export default function StarRating({ value = 0, onChange, readOnly = false, size = 26 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: 'inline-flex', gap: 4 }} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(i)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange?.(i)}
          style={{
            background: 'none', border: 'none', padding: 0,
            cursor: readOnly ? 'default' : 'pointer',
            fontSize: size, lineHeight: 1,
            color: i <= shown ? '#F59E0B' : '#D1D5DB',
            transition: 'color 0.1s',
          }}
        >
          {i <= shown ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
