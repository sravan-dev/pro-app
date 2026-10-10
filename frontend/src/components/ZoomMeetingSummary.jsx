import React, { useState, useEffect } from 'react';
import { api } from '../api';

// Zoom page → click a meeting: its summary. Past meetings add, for one session
// (picker when the meeting ran more than once), the actual times, Zoom's AI
// Companion summary and a scrolling participants panel.
const muted = { color: 'var(--color-text-secondary)' };
const fmtWhen = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (s) => (s ? new Date(s).toLocaleTimeString([], { timeStyle: 'short' }) : '—');
const fmtId = (id) => String(id).replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3');
const fmtMinutes = (sec) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

// Zoom lists one row per join, so someone who rejoined appears several times.
// Merge them into one row per person with their total time.
function mergeAttendance(rows) {
  const byPerson = new Map();
  for (const r of rows) {
    const key = (r.user_email || r.name || r.id || '').toLowerCase();
    const p = byPerson.get(key) || { name: r.name, email: r.user_email || '', seconds: 0, first: r.join_time, last: r.leave_time };
    p.seconds += r.duration || 0;
    if (r.join_time && (!p.first || r.join_time < p.first)) p.first = r.join_time;
    if (r.leave_time && (!p.last || r.leave_time > p.last)) p.last = r.leave_time;
    byPerson.set(key, p);
  }
  return [...byPerson.values()].sort((a, b) => b.seconds - a.seconds);
}

const Item = ({ label, children }) => (
  <div>
    <div style={{ ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ marginTop: 2, wordBreak: 'break-word' }}>{children}</div>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginTop: '1.25rem' }}>
    <h4 style={{ margin: '0 0 0.5rem' }}>{title}</h4>
    {children}
  </div>
);

function Participants({ data, attendance }) {
  const [q, setQ] = useState('');
  const shown = q
    ? attendance.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()))
    : attendance;

  return (
    <div style={{ border: '1px solid var(--color-border, #E5E7EB)', borderRadius: 'var(--radius-lg, 12px)', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '62vh' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border, #E5E7EB)' }}>
        <h4 style={{ margin: 0 }}>Participants ({attendance.length})</h4>
        {attendance.length > 6 && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" style={{ marginTop: 8, width: '100%' }} />
        )}
      </div>
      <div style={{ overflowY: 'auto', padding: '0.25rem 0' }}>
        {data.participants_error ? (
          <p style={{ ...muted, margin: 0, padding: '0.75rem 1rem', fontSize: 14 }}>{data.participants_error}</p>
        ) : attendance.length === 0 ? (
          <p style={{ ...muted, margin: 0, padding: '0.75rem 1rem', fontSize: 14 }}>Nobody joined.</p>
        ) : shown.length === 0 ? (
          <p style={{ ...muted, margin: 0, padding: '0.75rem 1rem', fontSize: 14 }}>No match.</p>
        ) : shown.map((p, i) => (
          <div key={i} style={{ padding: '0.5rem 1rem', borderBottom: i < shown.length - 1 ? '1px solid var(--color-border, #F1F5F9)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</strong>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtMinutes(p.seconds)}</span>
            </div>
            <div style={{ ...muted, fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || 'No email'}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmtTime(p.first)} – {fmtTime(p.last)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ZoomMeetingSummary({ meeting, past, onClose, onStart, onCopy }) {
  const [instance, setInstance] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.getZoomMeetingSummary(meeting.id, { past, instance: instance || meeting.uuid })
      .then(setData)
      .catch((err) => setError(err.message || 'Could not load the summary'));
  }, [meeting.id, meeting.uuid, past, instance]);

  const d = data?.meeting || {};
  const s = d.settings || {};
  const pm = data?.past;
  const attendance = data ? mergeAttendance(data.participants) : [];
  const ai = data?.ai_summary;
  const instances = data?.instances || [];

  const details = data && (
    <>
      {past && instances.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: '1rem' }}>
          <span style={muted}>Session</span>
          <select value={data.instance || ''} onChange={(e) => setInstance(e.target.value)}>
            {instances.map((m) => <option key={m.uuid} value={m.uuid}>{fmtWhen(m.start_time)}</option>)}
          </select>
          <span style={{ ...muted, fontSize: 12 }}>{instances.length} sessions</span>
        </label>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
        <Item label="Scheduled">{fmtWhen(meeting.start_time)}</Item>
        <Item label="Planned length">{meeting.duration ? `${meeting.duration} min` : '—'}</Item>
        {d.password && <Item label="Passcode"><span style={{ fontFamily: 'monospace' }}>{d.password}</span></Item>}
        {d.host_email && <Item label="Host">{d.host_email}</Item>}
        {pm && <Item label="Actual time">{fmtTime(pm.start_time)} – {fmtTime(pm.end_time)}</Item>}
        {pm && <Item label="Ran for">{pm.duration} min</Item>}
      </div>

      {d.join_url && !past && (
        <Section title="Join link">
          <a href={d.join_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{d.join_url}</a>
        </Section>
      )}

      {d.agenda && (
        <Section title="Description">
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.agenda}</p>
        </Section>
      )}

      {data.meeting && (
        <Section title="Settings">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: 13 }}>
            {[
              ['Waiting room', s.waiting_room],
              ['Join before host', s.join_before_host],
              ['Mute on entry', s.mute_upon_entry],
            ].map(([label, on]) => (
              <span key={label} style={{ padding: '2px 10px', borderRadius: 999, background: on ? '#DCFCE7' : '#F1F5F9', color: on ? '#166534' : '#64748B' }}>
                {label}: {on ? 'on' : 'off'}
              </span>
            ))}
            {(() => {
              const rec = s.auto_recording && s.auto_recording !== 'none';
              return (
                <span style={{ padding: '2px 10px', borderRadius: 999, background: rec ? '#DCFCE7' : '#F1F5F9', color: rec ? '#166534' : '#64748B' }}>
                  Recording: {rec ? s.auto_recording : 'off'}
                </span>
              );
            })()}
          </div>
        </Section>
      )}
      {data.meeting_error && !past && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{data.meeting_error}</div>}

      {past && (
        <Section title="AI summary">
          {ai ? (
            <div style={{ fontSize: 14 }}>
              {ai.summary_overview && <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{ai.summary_overview}</p>}
              {(ai.summary_details || []).map((x, i) => (
                <div key={i} style={{ marginBottom: '0.75rem' }}>
                  {x.label && <strong>{x.label}</strong>}
                  <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{x.summary}</p>
                </div>
              ))}
              {ai.next_steps?.length > 0 && (
                <>
                  <strong>Next steps</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '1.25rem' }}>
                    {ai.next_steps.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </>
              )}
              {!ai.summary_overview && !ai.summary_details?.length && ai.summary_content && (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ai.summary_content}</p>
              )}
            </div>
          ) : (
            <p style={{ ...muted, margin: 0, fontSize: 14 }}>
              No AI summary for this session. Zoom only makes one when the host turns on AI Companion
              “Meeting summary” during the meeting.
            </p>
          )}
        </Section>
      )}
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: past ? 1000 : 760, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>{meeting.topic}</h3>
            <div style={{ ...muted, fontSize: 13 }}>{past ? 'Past meeting' : 'Upcoming meeting'} · ID {fmtId(meeting.id)}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
        {!data && !error && <div className="spinner" style={{ margin: '2rem auto' }} />}

        {data && (past ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            <div>{details}</div>
            <div style={{ marginTop: '1.25rem' }}><Participants data={data} attendance={attendance} /></div>
          </div>
        ) : details)}

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          {!past && <button type="button" className="btn btn-ghost" onClick={() => onCopy(meeting)}>Copy invite</button>}
          {!past && <button type="button" className="btn btn-primary" onClick={() => onStart(meeting)}>Start</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
