import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import DataTable from './DataTable';

const STATUS_STYLE = {
  open: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6' },
  escalated: { bg: 'rgba(245,158,11,0.15)', color: '#D97706' },
  resolved: { bg: 'rgba(16,185,129,0.12)', color: '#059669' },
  closed: { bg: 'rgba(107,114,128,0.15)', color: '#6B7280' },
};
const PRIORITY_STYLE = {
  low: { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
  medium: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6' },
  high: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
};

const Pill = ({ map, value }) => {
  const s = map[value] || map.medium || { bg: '#eee', color: '#555' };
  return (
    <span style={{ padding: '2px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
      {value || '—'}
    </span>
  );
};

const fmt = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleString() : '—');

// Shared "Tickets" tab. Students raise & track tickets; advisors, managers and
// superadmins work the queue, reply, escalate and resolve. Behaviour adapts to
// the logged-in user's role.
export default function Tickets() {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const canEscalate = user?.role === 'advisor' || user?.role === 'superadmin';
  const isStaff = !isStudent;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', category: 'general', priority: 'medium' });
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');

  const toast = (text, type = 'info') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(() => {
    setLoading(true);
    api.getTickets()
      .then((r) => { setRows(r); setError(''); })
      .catch((err) => setError(err.message || 'Failed to load tickets'))
      .finally(() => setLoading(false));
    // Let the sidebar badge recompute its actionable-ticket count.
    window.dispatchEvent(new Event('tickets:changed'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadThread = useCallback((id) => {
    setThreadLoading(true);
    api.getTicketThread(id)
      .then(setThread)
      .catch((err) => toast(err.message || 'Failed to load ticket', 'error'))
      .finally(() => setThreadLoading(false));
  }, []);

  const openThread = (id) => { setOpenId(id); setThread(null); setReply(''); loadThread(id); };
  const closeThread = () => { setOpenId(null); setThread(null); };

  const submitCreate = async () => {
    if (!form.subject.trim() || !form.message.trim()) { toast('Subject and message are required.', 'error'); return; }
    setBusy(true);
    try {
      await api.createTicket(form);
      toast('Ticket raised. Your advisor has been notified.', 'success');
      setCreating(false);
      setForm({ subject: '', message: '', category: 'general', priority: 'medium' });
      load();
    } catch (err) {
      toast(err.message || 'Failed to raise ticket', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.replyTicket(openId, reply);
      setReply('');
      loadThread(openId);
      load();
    } catch (err) {
      toast(err.message || 'Failed to post reply', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doEscalate = async () => {
    const note = window.prompt('Add an optional note for the manager:', '');
    if (note === null) return; // cancelled
    setBusy(true);
    try {
      await api.escalateTicket(openId, note);
      toast('Ticket escalated to the manager.', 'success');
      loadThread(openId);
      load();
    } catch (err) {
      toast(err.message || 'Failed to escalate', 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await api.setTicketStatus(openId, status);
      loadThread(openId);
      load();
    } catch (err) {
      toast(err.message || 'Failed to update status', 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'id', label: '#', accessor: 'id', render: (r) => <span style={{ color: 'var(--color-text-secondary)' }}>#{r.id}</span> },
    { key: 'subject', label: 'Subject', accessor: 'subject', render: (r) => <strong>{r.subject}</strong> },
    ...(isStudent ? [] : [{ key: 'student', label: 'Student', accessor: 'student_name', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="avatar-sm" style={{ backgroundColor: r.student_color }}>{r.student_name?.[0]}</div>
        {r.student_name}
      </div>
    ) }]),
    { key: 'priority', label: 'Priority', accessor: 'priority', render: (r) => <Pill map={PRIORITY_STYLE} value={r.priority} /> },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <Pill map={STATUS_STYLE} value={r.status} /> },
    ...(isStudent ? [] : [{ key: 'advisor', label: 'Advisor', accessor: 'advisor_name', render: (r) => r.advisor_name || '—' }]),
    { key: 'updated', label: 'Updated', accessor: 'updated_at', render: (r) => fmt(r.updated_at) },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); openThread(r.id); }}>Open</button>
    ) },
  ];

  const t = thread?.ticket;
  const intro = isStudent
    ? 'Raise a ticket to your advisor. They can escalate it to your team manager if needed.'
    : user?.role === 'manager'
      ? 'Tickets escalated to you and tickets raised by students in your team.'
      : user?.role === 'advisor'
        ? 'Tickets raised by your students. Reply, resolve, or escalate to the team manager.'
        : 'All support tickets across the academy.';

  return (
    <div className="portal-page">
      <div className="page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>{isStudent ? 'Support' : 'Support Tickets'}</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{intro}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
          {isStudent && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Raise a Ticket</button>}
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', margin: '8px 0' }}>{error}</div>}
      {msg && <div className={`alert alert-${msg.type}`} style={{ margin: '8px 0' }}>{msg.text}</div>}

      {loading ? <div className="spinner" /> : (
        rows.length === 0
          ? <p className="empty-state">{isStudent ? 'You haven\'t raised any tickets yet.' : 'No tickets here yet.'}</p>
          : <DataTable columns={columns} data={rows} pageSize={15} />
      )}

      {/* Create ticket (student) */}
      {creating && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3>Raise a Ticket</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: -4, fontSize: 13 }}>
              This goes to your assigned advisor.
            </p>
            <div className="form-group">
              <label>Subject</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Short summary of your issue" maxLength={255} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="general">General</option>
                  <option value="course">Course</option>
                  <option value="session">Session</option>
                  <option value="payment">Payment</option>
                  <option value="technical">Technical</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Describe your issue in detail…" style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitCreate} disabled={busy}>{busy ? 'Sending…' : 'Submit Ticket'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket thread */}
      {openId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640, width: '92%' }}>
            {threadLoading || !t ? <div className="spinner" /> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px' }}>#{t.id} · {t.subject}</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Pill map={STATUS_STYLE} value={t.status} />
                      <Pill map={PRIORITY_STYLE} value={t.priority} />
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.category}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '8px 0' }}>
                  Raised by <strong>{t.student_name}</strong>
                  {t.advisor_name && <> · Advisor: {t.advisor_name}</>}
                  {t.manager_name && <> · Manager: {t.manager_name}</>}
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-border, #eee)', borderRadius: 8, padding: 8, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {thread.messages.map((m) => (
                    m.is_system ? (
                      <div key={m.id} style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>
                        {m.body} · {fmt(m.created_at)}
                      </div>
                    ) : (
                      <div key={m.id} style={{ background: m.author_role === 'student' ? 'rgba(59,130,246,0.06)' : 'rgba(16,185,129,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <strong style={{ fontSize: 13 }}>{m.author_name} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>· {m.author_role}</span></strong>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{fmt(m.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                      </div>
                    )
                  ))}
                </div>

                {t.status !== 'closed' && (
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a reply…" style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                )}

                <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={closeThread} disabled={busy}>Close</button>
                  {isStaff && canEscalate && !t.escalated && (
                    <button type="button" className="btn btn-ghost" style={{ color: '#D97706' }} onClick={doEscalate} disabled={busy}>↑ Escalate to Manager</button>
                  )}
                  {isStaff && (t.status === 'open' || t.status === 'escalated') && (
                    <button type="button" className="btn btn-ghost" style={{ color: '#059669' }} onClick={() => changeStatus('resolved')} disabled={busy}>✓ Resolve</button>
                  )}
                  {isStaff && t.status === 'resolved' && (
                    <button type="button" className="btn btn-ghost" onClick={() => changeStatus('closed')} disabled={busy}>Close Ticket</button>
                  )}
                  {isStaff && (t.status === 'resolved' || t.status === 'closed') && (
                    <button type="button" className="btn btn-ghost" onClick={() => changeStatus('open')} disabled={busy}>Reopen</button>
                  )}
                  {t.status !== 'closed' && (
                    <button type="button" className="btn btn-primary" onClick={submitReply} disabled={busy || !reply.trim()}>{busy ? 'Posting…' : 'Send Reply'}</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
