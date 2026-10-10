import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Zoom page → Contacts: everyone who has joined your Zoom meetings, one row
// per person (by email; guests without one by name). "Sync from Zoom" pulls
// new sessions in the background; the first sync reads every past meeting.
const muted = { color: 'var(--color-text-secondary)' };
// Stored times are UTC "YYYY-MM-DD HH:MM:SS".
const fromUtc = (s) => (s ? new Date(`${String(s).replace(' ', 'T')}Z`) : null);
const fmtDate = (s) => (s ? fromUtc(s).toLocaleDateString([], { dateStyle: 'medium' }) : '—');
const fmtWhen = (s) => (s ? fromUtc(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDuration = (sec) => {
  const m = Math.round((Number(sec) || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

export default function ZoomContacts({ onCountChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [person, setPerson] = useState(null); // contact whose sessions popup is open
  const [sessions, setSessions] = useState(null);
  const polling = useRef(null);

  const load = useCallback(() => {
    api.getZoomContacts()
      .then((d) => { setData(d); setError(''); onCountChange?.(d.contacts.length); })
      .catch((err) => setError(err.message));
  }, [onCountChange]);

  const poll = useCallback(() => {
    clearTimeout(polling.current);
    api.getZoomContactsSync().then((j) => {
      setJob(j);
      if (j.running) polling.current = setTimeout(poll, 2000);
      else if (j.finishedAt) load();
    }).catch(() => {});
  }, [load]);

  // Pick up a sync that is already running (e.g. started before a page refresh).
  useEffect(() => { load(); poll(); return () => clearTimeout(polling.current); }, [load, poll]);

  const sync = async () => {
    try { await api.startZoomContactsSync(); poll(); }
    catch (err) { setError(err.message); }
  };

  const openPerson = (p) => {
    setPerson(p);
    setSessions(null);
    api.getZoomContactSessions(p.id).then(setSessions).catch((err) => { setSessions([]); setError(err.message); });
  };

  const columns = [
    { key: 'name', label: 'Name', accessor: 'name', render: (r) => <strong>{r.name || '—'}</strong> },
    { key: 'email', label: 'Email', accessor: 'email', render: (r) => r.email || <span style={muted}>Guest (no email)</span> },
    { key: 'sessions', label: 'Sessions', accessor: (r) => Number(r.sessions) },
    { key: 'time', label: 'Total time', accessor: (r) => Number(r.seconds), render: (r) => fmtDuration(r.seconds) },
    { key: 'first', label: 'First joined', accessor: 'first_seen', render: (r) => fmtDate(r.first_seen) },
    { key: 'last', label: 'Last joined', accessor: 'last_seen', render: (r) => fmtDate(r.last_seen) },
  ];

  const running = job?.running;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <span style={{ ...muted, fontSize: 14 }}>
          People who joined your Zoom meetings.{' '}
          {data?.last_synced ? `Last synced ${fmtWhen(data.last_synced)}.` : 'Not synced yet.'}
        </span>
        <button className="btn btn-primary" onClick={sync} disabled={running} style={{ marginLeft: 'auto' }}>
          {running ? 'Syncing…' : '↻ Sync from Zoom'}
        </button>
      </div>

      {running && (
        <div className="alert alert-info">
          {job.meetings == null
            ? 'Finding your past Zoom meetings…'
            : `Reading meetings: ${job.processed} of ${job.meetings} · ${job.new_sessions} new session(s)`}
          {' '}— you can leave this page; the sync keeps going.
        </div>
      )}
      {!running && job?.finishedAt && (
        <div className={`alert ${job.error ? 'alert-error' : 'alert-success'}`}>
          {job.error
            ? `Sync stopped: ${job.error}`
            : `Sync finished: ${job.new_sessions} new session(s) added${job.errors ? `, ${job.errors} could not be read` : ''}.`}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {!data ? <div className="spinner" /> : data.contacts.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
          No Zoom contacts yet. Click “Sync from Zoom” to collect everyone who joined your past meetings.
        </div>
      ) : (
        <DataTable columns={columns} data={data.contacts} pageSize={15} onRowClick={openPerson} />
      )}

      {person && (
        <div className="modal-overlay" onClick={() => setPerson(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: 4 }}>{person.name || 'Guest'}</h3>
                <div style={{ ...muted, fontSize: 13 }}>
                  {person.email || 'No email'} · {person.sessions} session(s) · {fmtDuration(person.seconds)} total
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPerson(null)} aria-label="Close">✕</button>
            </div>
            {!sessions ? <div className="spinner" style={{ margin: '2rem auto' }} /> : (
              <table className="data-table" style={{ width: '100%', fontSize: 13, marginTop: '1rem' }}>
                <thead><tr><th>Meeting</th><th>When</th><th>Time in meeting</th></tr></thead>
                <tbody>
                  {sessions.map((x, i) => (
                    <tr key={i}>
                      <td>{x.topic || `Meeting ${x.meeting_id}`}</td>
                      <td>{fmtWhen(x.start_time_utc)}</td>
                      <td>{fmtDuration(x.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPerson(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
