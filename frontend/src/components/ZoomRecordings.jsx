import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import usePersistedTab from '../hooks/usePersistedTab';

// Admin → Recordings → Zoom cloud: every host's Zoom cloud recordings in a
// date range, as a thumbnail grid (like Zoom's own Recordings page) or a list.
// Videos stream from Zoom via /api/zoom/recordings/play.
const muted = { color: 'var(--color-text-secondary)' };

const ymd = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtId = (id) => String(id).replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3');
const fmtWhen = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDuration = (secs) => {
  const s = Math.max(0, Math.round(secs || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const fmtSize = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const VIEW_LABELS = {
  shared_screen_with_speaker_view: 'Screen + speaker',
  'shared_screen_with_speaker_view(CC)': 'Screen + speaker (CC)',
  shared_screen_with_gallery_view: 'Screen + gallery',
  speaker_view: 'Speaker',
  gallery_view: 'Gallery',
  shared_screen: 'Screen only',
  active_speaker: 'Active speaker',
  audio_only: 'Audio only',
  audio_transcript: 'Transcript',
  chat_file: 'Chat',
  closed_caption: 'Captions',
  timeline: 'Timeline',
  summary: 'Summary',
};
const fileLabel = (f) => VIEW_LABELS[f.view] || f.view.replace(/_/g, ' ') || f.type;

export const playUrl = (r, fileId) => `/api/zoom/recordings/play?file=${encodeURIComponent(fileId)}&meeting=${encodeURIComponent(r.uuid)}`;

// Thumbnail: the video's frame a few seconds in, loaded only once the card
// scrolls into view so a long grid doesn't open dozens of streams at once.
function Thumb({ r }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} className="zrec-thumb">
      {r.video_file_id && visible && !failed ? (
        <video src={`${playUrl(r, r.video_file_id)}#t=8`} preload="metadata" muted playsInline onError={() => setFailed(true)} />
      ) : (
        <div className="zrec-thumb-fallback">{r.video_file_id ? '▶' : '🎧'}</div>
      )}
      <span className="zrec-duration">{fmtDuration(r.seconds)}</span>
    </div>
  );
}

export default function ZoomRecordings() {
  const [range, setRange] = useState(() => {
    const to = new Date();
    return { from: ymd(new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)), to: ymd(to) };
  });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = usePersistedTab('zoomrec:view', 'grid');
  const [playing, setPlaying] = useState(null); // { r, fileId }

  const load = useCallback(() => {
    setLoading(true); setError('');
    api.getZoomRecordings(range.from, range.to)
      .then((d) => setRows(d.recordings || []))
      .catch((err) => { setError(err.message || 'Could not load Zoom recordings'); setRows([]); })
      .finally(() => setLoading(false));
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  // Search matches the topic, host, or meeting ID (spaces ignored, so
  // "873 6365 4219" matches like on Zoom).
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\s+/g, '');
  const shown = (rows || []).filter((r) => !q
    || r.topic.toLowerCase().includes(q)
    || (r.host_name || '').toLowerCase().includes(q)
    || (/^\d+$/.test(qDigits) && r.meeting_id.includes(qDigits)));

  const open = (r) => setPlaying({ r, fileId: r.video_file_id || r.files[0]?.id });

  return (
    <div>
      <div className="zrec-toolbar">
        <input
          type="search" className="zrec-search" placeholder="Search topic, host or meeting ID"
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recordings"
        />
        <div className="zrec-dates">
          <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((x) => ({ ...x, from: e.target.value }))} aria-label="From date" />
          <span style={muted}>–</span>
          <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((x) => ({ ...x, to: e.target.value }))} aria-label="To date" />
        </div>
        <div className="view-toggle" role="tablist" style={{ marginBottom: 0, marginLeft: 'auto' }}>
          <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && rows === null ? (
        <p style={muted}>Loading Zoom recordings…</p>
      ) : shown.length === 0 ? (
        !error && <p style={muted}>{rows?.length ? 'No recordings match your search.' : 'No Zoom cloud recordings in this date range.'}</p>
      ) : view === 'grid' ? (
        <div className="zrec-grid" style={loading ? { opacity: 0.6 } : undefined}>
          {shown.map((r) => (
            <button type="button" key={r.uuid} className="zrec-card" onClick={() => open(r)} title={r.topic}>
              <Thumb r={r} />
              <div className="zrec-title">{r.topic}</div>
              <div className="zrec-meta">{r.host_name}</div>
              <div className="zrec-meta">{fmtWhen(r.start_time)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={loading ? { opacity: 0.6 } : undefined}>
          <DataTable
            columns={[
              { key: 'topic', label: 'Topic', accessor: 'topic' },
              { key: 'id', label: 'Meeting ID', accessor: 'meeting_id', render: (r) => fmtId(r.meeting_id) },
              { key: 'host', label: 'Host', accessor: 'host_name' },
              { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => fmtWhen(r.start_time) },
              { key: 'dur', label: 'Duration', accessor: 'seconds', render: (r) => fmtDuration(r.seconds) },
              { key: 'size', label: 'Size', accessor: 'total_size', render: (r) => (r.total_size ? fmtSize(r.total_size) : '—') },
              { key: 'actions', label: '', sortable: false, render: (r) => <button type="button" className="btn btn-sm btn-primary" onClick={() => open(r)}>▶ Play</button> },
            ]}
            data={shown}
            searchable={false}
            pageSize={20}
          />
        </div>
      )}

      {playing && (() => {
        const { r, fileId } = playing;
        const file = r.files.find((f) => f.id === fileId);
        const media = r.files.filter((f) => f.type === 'MP4' || f.type === 'M4A');
        const others = r.files.filter((f) => f.type !== 'MP4' && f.type !== 'M4A');
        return (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setPlaying(null)}>
            <div className="modal" style={{ maxWidth: '920px', width: '100%' }}>
              <div className="page-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{r.topic}</h3>
                  <div style={{ ...muted, fontSize: '0.85em', marginTop: '0.25rem' }}>
                    {fmtWhen(r.start_time)} · {r.host_name} · ID {fmtId(r.meeting_id)}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setPlaying(null)}>✕ Close</button>
              </div>
              {file && (file.type === 'MP4' || file.type === 'M4A') ? (
                <video key={fileId} src={playUrl(r, fileId)} controls autoPlay style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '60vh' }} />
              ) : (
                <p style={muted}>This recording has no playable video.</p>
              )}
              {media.length > 1 && (
                <div className="view-toggle" style={{ marginTop: '0.75rem', marginBottom: 0, flexWrap: 'wrap' }}>
                  {media.map((f) => (
                    <button type="button" key={f.id} className={f.id === fileId ? 'active' : ''} onClick={() => setPlaying({ r, fileId: f.id })}>{fileLabel(f)}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                {others.map((f) => (
                  <a key={f.id} className="btn btn-sm btn-ghost" href={playUrl(r, f.id)} target="_blank" rel="noreferrer">⬇ {fileLabel(f)}</a>
                ))}
                {file && <a className="btn btn-sm btn-ghost" href={playUrl(r, fileId)} target="_blank" rel="noreferrer">⬇ Download {fileLabel(file)}</a>}
                {r.share_url && <a className="btn btn-sm btn-ghost" href={r.share_url} target="_blank" rel="noreferrer">Open in Zoom ↗</a>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
