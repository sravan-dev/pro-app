import React, { useState, useEffect } from 'react';
import { api } from '../api';

const meetingLink = (code) => `${window.location.origin}/m/${code}`;
const shareText = (m) => (m.passcode ? `${meetingLink(m.code)}\nPasscode: ${m.passcode}` : meetingLink(m.code));
const copiedWhat = (m) => (m.passcode ? `link + passcode ${m.passcode}` : 'link');

// Temporary meetings (link, optionally + 5-digit passcode; no account needed):
// create, list, copy, end and delete. Superadmin sees every meeting; a tutor sees only
// their own (filtered server-side). Pass `defaultHost` ({ name, email }) to
// prefill the host and offer one-click "Quick Meeting".
export default function MeetingsManager({ onMessage, defaultHost }) {
  const [meetings, setMeetings] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', name: '', email: '', passcode_required: false });

  const load = () => api.getMeetings().then(setMeetings).catch(() => {});
  useEffect(() => { load(); }, []);

  const openForm = () => {
    setForm({ title: '', name: defaultHost?.name || '', email: defaultHost?.email || '', passcode_required: false });
    setShowForm(true);
  };

  const create = async (body) => {
    setCreating(true);
    try {
      const m = await api.createMeeting(body);
      await load();
      setShowForm(false);
      try { await navigator.clipboard.writeText(shareText(m)); } catch {}
      onMessage(`Meeting created — ${copiedWhat(m)} copied to clipboard`, 'success');
    } catch (err) { onMessage(err.message, 'error'); }
    finally { setCreating(false); }
  };

  const submitForm = (e) => {
    e.preventDefault();
    create({ title: form.title.trim() || 'Meeting', name: form.name.trim(), email: form.email.trim(), passcode_required: form.passcode_required });
  };

  const quickMeeting = () => create({ title: 'Quick Meeting', name: defaultHost?.name || '', email: defaultHost?.email || '' });

  const endMeeting = async (id) => {
    if (!confirm('End this meeting? The link will stop working. It stays in the list as history.')) return;
    try {
      await api.endMeeting(id);
      await load();
      onMessage('Meeting ended', 'success');
    } catch (err) { onMessage(err.message, 'error'); }
  };

  const deleteMeeting = async (id) => {
    if (!confirm('Permanently delete this meeting from history? This cannot be undone.')) return;
    try {
      await api.deleteMeeting(id);
      await load();
      onMessage('Meeting deleted', 'success');
    } catch (err) { onMessage(err.message, 'error'); }
  };

  const copyMeeting = async (m) => {
    try {
      await navigator.clipboard.writeText(shareText(m));
      onMessage(`Copied ${copiedWhat(m)}`, 'success');
    } catch { onMessage('Copy failed — copy manually', 'error'); }
  };

  return (
    <div className="portal-page">
      <div className="page-header">
        <h2>Meetings</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {defaultHost && (
            <button className="btn btn-ghost" onClick={quickMeeting} disabled={creating}>
              {creating ? 'Creating…' : 'Quick Meeting'}
            </button>
          )}
          <button className="btn btn-primary" onClick={openForm} disabled={creating}>
            + New Meeting
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
        Create a temporary meeting link. Share the link — anyone can join directly with just their name, no account needed.
        Ended meetings stay here as history until you delete them.
      </p>
      {meetings.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
          No meetings yet. Click “New Meeting” to create one.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Host</th>
                <th>Link</th>
                <th>Passcode</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const active = m.status === 'active';
                return (
                  <tr key={m.id} style={{ opacity: active ? 1 : 0.65 }}>
                    <td><strong>{m.title}</strong></td>
                    <td style={{ fontSize: '13px' }}>
                      {m.host_name || '—'}
                      {m.host_email && <div style={{ color: '#888', fontSize: '12px' }}>{m.host_email}</div>}
                    </td>
                    <td>
                      {active ? (
                        <a href={meetingLink(m.code)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary, #4F46E5)' }}>
                          /m/{m.code}
                        </a>
                      ) : (
                        <span style={{ color: '#aaa' }}>/m/{m.code}</span>
                      )}
                    </td>
                    <td>
                      {m.passcode
                        ? <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.15em' }}>{m.passcode}</span>
                        : <span style={{ color: '#aaa' }}>None</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', background: active ? '#DCFCE7' : '#F1F5F9', color: active ? '#166534' : '#64748B' }}>
                        {active ? 'Active' : 'Ended'}
                      </span>
                    </td>
                    <td style={{ color: '#888', fontSize: '13px' }}>{new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {active && <button className="btn btn-sm btn-ghost" onClick={() => copyMeeting(m)}>Copy</button>}
                      {active && <a className="btn btn-sm btn-ghost" href={meetingLink(m.code)} target="_blank" rel="noreferrer">Open</a>}
                      {active && <button className="btn btn-sm btn-ghost" onClick={() => endMeeting(m.id)}>End</button>}
                      <button className="btn btn-sm btn-ghost text-danger" onClick={() => deleteMeeting(m.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Meeting</h3>
            <form onSubmit={submitForm}>
              <div className="form-group">
                <label>Subject *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Demo class" required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Host Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tiju" required />
                </div>
                <div className="form-group">
                  <label>Host Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal' }}>
                  <input type="checkbox" checked={form.passcode_required} onChange={(e) => setForm({ ...form, passcode_required: e.target.checked })} style={{ width: 'auto' }} />
                  Require a 5-digit passcode to join
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create Meeting'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
