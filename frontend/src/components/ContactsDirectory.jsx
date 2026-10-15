import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

const PAGE_SIZE = 100;
const contactName = (c) => (c.name && c.name !== '—' ? c.name : '');

// HubSpot or Kajabi contact list — read-only, paged 100 at a time server-side —
// with an Enroll action. A contact whose email matches a student goes straight
// to the course picker; otherwise a student account is created first. Every
// enrollment also intimates managers & advisors (in-app + email).
// `onOpenSettings` (superadmin only) links the "not connected" notice to
// Settings; `onEnrolled` lets the parent refresh its own lists.
export default function ContactsDirectory({ source, title, onMessage, onOpenSettings, onEnrolled }) {
  const isHubspot = source === 'hubspot';
  const label = isHubspot ? 'HubSpot' : 'Kajabi';

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(null);
  const [search, setSearch] = useState('');           // committed search term
  const [searchInput, setSearchInput] = useState(''); // live input box
  const [page, setPage] = useState(0);                // 0-based page index
  const [hasNext, setHasNext] = useState(false);
  const cursors = useRef(['']); // HubSpot: `after` cursor for each visited page; [0] = first page

  const [busy, setBusy] = useState(false);
  const [pendingContact, setPendingContact] = useState(null); // awaiting "create student" confirm
  const [enrollFor, setEnrollFor] = useState(null);           // { student } for the course picker
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');

  const load = useCallback((pageIndex, q) => {
    setLoading(true);
    setError('');
    const req = isHubspot
      ? api.getHubspotContacts({ after: cursors.current[pageIndex] || '', q })
      : api.getKajabiContacts({ page: pageIndex + 1, q });
    req
      .then((r) => {
        setContacts(r.contacts || []);
        if (typeof r.total === 'number') setTotal(r.total);
        if (isHubspot) {
          cursors.current[pageIndex + 1] = r.after || ''; // remember the next page's cursor
          setHasNext(!!r.after);
        } else {
          setHasNext(!!r.has_next);
        }
        setPage(pageIndex);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isHubspot]);

  useEffect(() => { load(0, ''); }, [load]);

  // Debounce the search box so we don't hit the CRM on every keystroke.
  useEffect(() => {
    const q = searchInput.trim();
    if (q === search) return undefined;
    const t = setTimeout(() => {
      setSearch(q);
      cursors.current = ['']; // cursors are query-specific — start fresh
      load(0, q);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record the intimation and notify managers & advisors. Fire-and-forget: a
  // failure here shouldn't block the enrollment itself.
  const notify = async (c) => {
    try {
      const r = await api.createContactEnrollment({
        hubspot_contact_id: c.id,
        name: contactName(c),
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || '',
        stage: c.lifecycle_stage || '',
      });
      const who = r.emailed > 0 ? `${r.emailed} of ${r.recipients} emailed` : `${r.recipients} notified in-app`;
      onMessage(`Managers & advisors intimated (${who}).`, 'success');
    } catch (err) {
      onMessage(`Enrolled, but intimation failed: ${err.message}`, 'error');
    }
  };

  const openCoursePicker = (student) => {
    setCourseId('');
    setEnrollFor({ student });
    api.getCourses().then((cs) => setCourses(cs.filter((c) => c.status !== 'archived'))).catch(() => {});
  };

  const enroll = async (c) => {
    const email = (c.email || '').trim();
    if (!email) { onMessage(`This contact has no email — add one in ${label} before enrolling.`, 'error'); return; }
    setBusy(true);
    try {
      const students = await api.getStudents();
      const student = students.find((s) => (s.email || '').toLowerCase() === email.toLowerCase());
      if (student) { notify(c); openCoursePicker(student); }
      else setPendingContact(c); // confirm modal offers to create the student
    } catch (err) {
      onMessage(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Confirmed: create a student account from the pending contact, then enroll.
  const confirmCreate = async () => {
    const c = pendingContact;
    const email = c.email.trim();
    const name = contactName(c) || email;
    setBusy(true);
    try {
      const created = await api.createUser({ name, email, phone: c.phone || '', role: 'student' });
      onMessage('Student account created', 'success');
      notify(c);
      setPendingContact(null);
      openCoursePicker({ id: created.id, name, email });
    } catch (err) {
      onMessage(err.message, 'error');
      setPendingContact(null);
    } finally {
      setBusy(false);
    }
  };

  const saveEnroll = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createEnrollment({ student_id: enrollFor.student.id, course_id: courseId });
      onMessage(`${enrollFor.student.name} enrolled`, 'success');
      setEnrollFor(null);
      onEnrolled?.();
    } catch (err) {
      onMessage(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'phone', label: 'Phone', accessor: 'phone' },
    { key: 'company', label: 'Company', accessor: 'company' },
    { key: 'lifecycle_stage', label: 'Stage', accessor: 'lifecycle_stage', render: (r) => r.lifecycle_stage ? <span className="role-badge role-advisor">{r.lifecycle_stage}</span> : '—' },
    { key: 'created_at', label: 'Created', accessor: 'created_at', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-primary" onClick={() => enroll(r)} disabled={busy}>Enroll</button>
      </div>
    ) },
  ];

  const notConnected = /not connected/i.test(error);

  return (
    <div className="portal-page">
      <div className="page-header">
        <h2>{title || `${label} Contacts`}</h2>
        {!notConnected && (
          <button className="btn btn-ghost" onClick={() => load(page, search)} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        )}
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Contact list synced from your {label} account. Use <strong>Enroll</strong> to bring a contact into the academy.
      </p>

      {notConnected ? (
        <div className="alert" style={{ background: 'rgba(245,158,11,0.12)', color: '#92400e' }}>
          {label} isn’t connected yet.{' '}
          {onOpenSettings
            ? <>Go to <button className="btn btn-ghost btn-sm" onClick={onOpenSettings}>Settings → Integrations → {label}</button> to connect it.</>
            : 'Ask an admin to connect it in Settings → Integrations.'}
        </div>
      ) : error ? (
        <div className="alert" style={{ background: 'rgba(239,68,68,0.12)', color: '#991b1b' }}>
          Failed to load contacts: {error}
        </div>
      ) : loading && contacts.length === 0 ? (
        <div><div className="spinner" /><p>Loading contacts…</p></div>
      ) : (
        <div className="data-table-container">
          <div className="data-table-toolbar">
            <input
              type="text"
              placeholder="Search name, email, phone…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="data-table-search"
            />
            <span className="data-table-count">
              {total != null ? `${total.toLocaleString()} records` : `${contacts.length} records`}
            </span>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr><td colSpan={columns.length} className="no-data">No contacts found</td></tr>
                ) : (
                  contacts.map((row) => (
                    <tr key={row.id}>
                      {columns.map((col) => (
                        <td key={col.key}>{col.render ? col.render(row) : (row[col.accessor] || '—')}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="data-table-pagination">
            <button onClick={() => load(page - 1, search)} disabled={page === 0 || loading}>Prev</button>
            <span>
              Page {page + 1}
              {total != null ? ` of ${Math.max(1, Math.ceil(total / PAGE_SIZE)).toLocaleString()}` : ''}
            </span>
            <button onClick={() => load(page + 1, search)} disabled={!hasNext || loading}>Next</button>
          </div>
        </div>
      )}

      {pendingContact && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Enroll {contactName(pendingContact) || pendingContact.email}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              This contact isn’t a student yet. A student account will be created for{' '}
              <strong>{pendingContact.email}</strong> and a welcome email with a temporary password will be sent. Continue to enroll?
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPendingContact(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCreate} disabled={busy}>
                {busy ? 'Creating…' : 'Create & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enrollFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Enroll Student</h3>
            <form onSubmit={saveEnroll}>
              <div className="form-group">
                <label>Student</label>
                <input value={`${enrollFor.student.name} (${enrollFor.student.email})`} disabled />
              </div>
              <div className="form-group">
                <label>Course *</label>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required autoFocus>
                  <option value="">Select course...</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEnrollFor(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enrolling…' : 'Enroll'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
