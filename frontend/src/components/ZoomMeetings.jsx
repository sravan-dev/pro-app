import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Admin → Zoom: create, edit and delete real Zoom meetings through the Zoom
// app saved in Settings → Video provider. Meetings belong to a Zoom user (the
// host); the picked host is remembered in this browser.
const HOST_KEY = 'zoom:host';
const muted = { color: 'var(--color-text-secondary)' };
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

const fmtWhen = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No fixed time');
const fmtId = (id) => String(id).replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3');

// Date → value for <input type="datetime-local"> in the browser's timezone.
const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyForm = () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return {
    topic: '', start_time: toLocalInput(start), duration: 60, agenda: '', passcode: '',
    waiting_room: true, join_before_host: false, mute_upon_entry: true, auto_recording: 'none',
  };
};

export default function ZoomMeetings() {
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [host, setHost] = useState(() => { try { return localStorage.getItem(HOST_KEY) || ''; } catch { return ''; } });
  const [view, setView] = useState('upcoming');
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null); // { id?, ...fields } while the create/edit modal is open
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [hostForm, setHostForm] = useState(null); // Create Host modal fields while open

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  useEffect(() => {
    api.getZoomStatus().then((s) => {
      setStatus(s);
      if (!s.connected) return;
      api.getZoomUsers().then((list) => {
        setUsers(list);
        setHost((h) => (list.some((u) => u.id === h) ? h : (list[0]?.id || '')));
      }).catch((err) => setError(err.message));
    }).catch(() => setStatus({ connected: false, error: 'Could not reach the server' }));
  }, []);

  useEffect(() => { try { if (host) localStorage.setItem(HOST_KEY, host); } catch {} }, [host]);

  const load = useCallback(() => {
    if (!host) return;
    setLoading(true);
    api.getZoomMeetings(host, view)
      .then((list) => { setMeetings(list); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [host, view]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setFormError(''); setForm(emptyForm()); };

  const openEdit = async (m) => {
    setBusyId(m.id);
    try {
      const d = await api.getZoomMeeting(m.id);
      setFormError('');
      setForm({
        id: m.id,
        topic: d.topic || '',
        start_time: d.start_time ? toLocalInput(new Date(d.start_time)) : toLocalInput(new Date()),
        duration: d.duration || 60,
        agenda: d.agenda || '',
        passcode: d.password || '',
        waiting_room: !!d.settings?.waiting_room,
        join_before_host: !!d.settings?.join_before_host,
        mute_upon_entry: !!d.settings?.mute_upon_entry,
        auto_recording: d.settings?.auto_recording || 'none',
      });
    } catch (err) { setError(err.message); }
    setBusyId(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const { id, ...fields } = form;
    const body = { ...fields, timezone: browserTz, user: host };
    try {
      if (id) await api.updateZoomMeeting(id, body);
      else await api.createZoomMeeting(body);
      setForm(null);
      flash(id ? 'Meeting updated' : 'Meeting created');
      if (view !== 'upcoming') setView('upcoming'); else load();
    } catch (err) { setFormError(err.message); }
    setSaving(false);
  };

  const remove = async (m) => {
    if (!confirm(`Delete "${m.topic}"? It will be cancelled in Zoom and the join link will stop working.`)) return;
    setBusyId(m.id);
    try {
      await api.deleteZoomMeeting(m.id);
      setMeetings((list) => list.filter((x) => x.id !== m.id));
      flash('Meeting deleted');
    } catch (err) { setError(err.message); }
    setBusyId(null);
  };

  // The start link carries a short-lived host token, so fetch it fresh each time.
  const start = async (m) => {
    setBusyId(m.id);
    try {
      const d = await api.getZoomMeeting(m.id);
      window.open(d.start_url, '_blank', 'noopener');
    } catch (err) { setError(err.message); }
    setBusyId(null);
  };

  const copyInvite = async (m) => {
    setBusyId(m.id);
    try {
      const d = await api.getZoomMeeting(m.id);
      const lines = [
        d.topic,
        d.start_time ? `Time: ${fmtWhen(d.start_time)}` : null,
        `Join Zoom meeting: ${d.join_url}`,
        `Meeting ID: ${fmtId(d.id)}`,
        d.password ? `Passcode: ${d.password}` : null,
      ].filter(Boolean);
      await navigator.clipboard.writeText(lines.join('\n'));
      flash('Invite copied');
    } catch (err) { setError(err.message || 'Could not copy'); }
    setBusyId(null);
  };

  const createHost = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const r = await api.createZoomUser(hostForm);
      setHostForm(null);
      flash(`${r.message}. They can host meetings once they accept it.`);
    } catch (err) { setFormError(err.message); }
    setSaving(false);
  };

  const setHostField = (k) => (e) => setHostForm((f) => ({ ...f, [k]: e.target.value }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const columns = [
    { key: 'topic', label: 'Topic', accessor: 'topic', render: (m) => (
      <>
        <strong>{m.topic}</strong>
        {m.type !== 2 && <div style={{ ...muted, fontSize: 12 }}>Recurring / instant — edit in Zoom</div>}
      </>
    )},
    { key: 'when', label: 'When', accessor: 'start_time', render: (m) => <span style={{ fontSize: 13 }}>{fmtWhen(m.start_time)}</span> },
    { key: 'duration', label: 'Duration', accessor: 'duration', render: (m) => <span style={{ fontSize: 13 }}>{m.duration ? `${m.duration} min` : '—'}</span> },
    { key: 'id', label: 'Meeting ID', accessor: 'id', render: (m) => <span style={{ fontFamily: 'monospace' }}>{fmtId(m.id)}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (m) => {
      const busy = busyId === m.id;
      const upcoming = view === 'upcoming';
      return (
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {upcoming && <button className="btn btn-sm btn-primary" onClick={() => start(m)} disabled={busy}>Start</button>}
          {upcoming && <button className="btn btn-sm btn-ghost" onClick={() => copyInvite(m)} disabled={busy}>Copy invite</button>}
          {upcoming && m.type === 2 && <button className="btn btn-sm btn-ghost" onClick={() => openEdit(m)} disabled={busy}>Edit</button>}
          <button className="btn btn-sm btn-ghost text-danger" onClick={() => remove(m)} disabled={busy}>Delete</button>
        </div>
      );
    }},
  ];

  if (!status) return <div className="portal-page"><div className="spinner" /></div>;

  if (!status.connected) {
    return (
      <div className="portal-page">
        <div className="page-header"><h2>Zoom</h2></div>
        <div className="card" style={{ padding: '2rem' }}>
          <h3 style={{ marginTop: 0 }}>{status.configured === false ? 'Zoom is not set up' : 'Zoom is not connected'}</h3>
          <p style={muted}>
            Save your Zoom Server-to-Server OAuth app's Account ID, Client ID and Client Secret in
            Settings → Video provider, then come back here.
          </p>
          {status.error && <div className="alert alert-error">{status.error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>Zoom</h2>
          <p style={{ ...muted, margin: 0 }}>Create and manage Zoom meetings. Times are shown in your timezone ({browserTz}).</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => { setFormError(''); setHostForm({ first_name: '', last_name: '', email: '', type: '1' }); }}>+ Create Host</button>
          <button className="btn btn-primary" onClick={openCreate} disabled={!host}>+ New Zoom Meeting</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="view-toggle" role="tablist" style={{ marginBottom: 0 }}>
          <button role="tab" aria-selected={view === 'upcoming'} className={view === 'upcoming' ? 'active' : ''} onClick={() => setView('upcoming')}>Upcoming</button>
          <button role="tab" aria-selected={view === 'previous'} className={view === 'previous' ? 'active' : ''} onClick={() => setView('previous')}>Past</button>
        </div>
        {users.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span style={muted}>Host</span>
            <select value={host} onChange={(e) => setHost(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </label>
        )}
        {users.length === 1 && <span style={{ ...muted, fontSize: 14 }}>Host: {users[0].name}</span>}
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? <div className="spinner" /> : meetings.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
          {view === 'upcoming' ? 'No upcoming Zoom meetings. Click “New Zoom Meeting” to schedule one.' : 'No past meetings.'}
        </div>
      ) : (
        <DataTable columns={columns} data={meetings} pageSize={10} rowId={(m) => `${m.id}-${m.start_time || ''}`} />
      )}

      {hostForm && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={createHost} style={{ maxWidth: 480 }}>
            <h3>Create Zoom Host</h3>
            <p style={{ ...muted, marginTop: '-0.5rem', fontSize: '0.9rem' }}>
              Adds a user to your Zoom account. Zoom emails them an activation link; once they accept it
              they appear in the Host list.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zh-first">First name *</label>
                <input id="zh-first" value={hostForm.first_name} onChange={setHostField('first_name')} maxLength={64} required autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="zh-last">Last name</label>
                <input id="zh-last" value={hostForm.last_name} onChange={setHostField('last_name')} maxLength={64} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="zh-email">Email *</label>
              <input id="zh-email" type="email" value={hostForm.email} onChange={setHostField('email')} maxLength={128} required />
            </div>
            <div className="form-group">
              <label htmlFor="zh-type">Zoom licence</label>
              <select id="zh-type" value={hostForm.type} onChange={setHostField('type')}>
                <option value="1">Basic (free — 40-minute limit on group meetings)</option>
                <option value="2">Licensed (uses one of your paid Zoom licences)</option>
              </select>
            </div>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setHostForm(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Sending invite…' : 'Create host'}</button>
            </div>
          </form>
        </div>
      )}

      {form && (
        <div className="modal-overlay">
          <form className="modal" onSubmit={save} style={{ maxWidth: 560 }}>
            <h3>{form.id ? 'Edit Zoom Meeting' : 'New Zoom Meeting'}</h3>
            <div className="form-group">
              <label htmlFor="zm-topic">Topic *</label>
              <input id="zm-topic" value={form.topic} onChange={set('topic')} maxLength={200} required autoFocus placeholder="e.g. 360 Digital Marketing — Week 3" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zm-start">Start *</label>
                <input id="zm-start" type="datetime-local" value={form.start_time} onChange={set('start_time')} required />
              </div>
              <div className="form-group">
                <label htmlFor="zm-duration">Duration (minutes) *</label>
                <input id="zm-duration" type="number" min={1} max={1440} value={form.duration} onChange={set('duration')} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zm-pass">Passcode</label>
                <input id="zm-pass" value={form.passcode} onChange={set('passcode')} maxLength={10} placeholder="Blank = Zoom picks one" />
              </div>
              <div className="form-group">
                <label htmlFor="zm-rec">Auto recording</label>
                <select id="zm-rec" value={form.auto_recording} onChange={set('auto_recording')}>
                  <option value="none">Off</option>
                  <option value="local">On the host's computer</option>
                  <option value="cloud">Zoom cloud (paid plans)</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="zm-agenda">Description</label>
              <textarea id="zm-agenda" rows={3} value={form.agenda} onChange={set('agenda')} maxLength={2000} />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={form.waiting_room} onChange={set('waiting_room')} /> Waiting room
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={form.join_before_host} onChange={set('join_before_host')} /> Let people join before the host
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" checked={form.mute_upon_entry} onChange={set('mute_upon_entry')} /> Mute people when they join
              </label>
            </div>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create meeting'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
