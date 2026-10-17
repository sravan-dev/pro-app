import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import KajabiContactDetail from './KajabiContactDetail';

const PAGE_SIZE = 100;
const contactName = (c) => (c.name && c.name !== '—' ? c.name : '');

// HubSpot or Kajabi contact list — read-only, paged 100 at a time server-side —
// with an Enroll action. Enroll always asks for confirmation first; a contact
// whose email matches a student then goes to the course picker, otherwise a
// student account is created first. Each completed enrollment also intimates
// managers & advisors (in-app + email). Clicking a Kajabi contact opens its
// full detail page (KajabiContactDetail); the list keeps its page and search.
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
  const [pending, setPending] = useState(null);     // { contact, student|null } awaiting confirmation
  const [enrollFor, setEnrollFor] = useState(null); // { student, contact } for the course picker
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [detailContact, setDetailContact] = useState(null); // Kajabi contact whose detail page is open
  const [detailKey, setDetailKey] = useState(0); // bump to reload the open detail page

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

  // Record the intimation and notify managers & advisors. Runs after the
  // enrollment is saved; a failure here doesn't undo it.
  const notify = async (c, enrolledName) => {
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
      onMessage(`${enrolledName} enrolled. Managers & advisors intimated (${who}).`, 'success');
    } catch (err) {
      onMessage(`${enrolledName} enrolled, but intimation failed: ${err.message}`, 'error');
    }
  };

  const openCoursePicker = (student, contact) => {
    setCourseId('');
    setEnrollFor({ student, contact });
    api.getCourses().then((cs) => setCourses(cs.filter((c) => c.status !== 'archived'))).catch(() => {});
  };

  // Enroll clicked: find out whether the contact is already a student, then ask
  // for confirmation before doing anything.
  const enroll = async (c) => {
    const email = (c.email || '').trim();
    if (!email) { onMessage(`This contact has no email — add one in ${label} before enrolling.`, 'error'); return; }
    setBusy(true);
    try {
      const students = await api.getStudents();
      const student = students.find((s) => (s.email || '').toLowerCase() === email.toLowerCase());
      setPending({ contact: c, student: student || null });
    } catch (err) {
      onMessage(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Confirmed: use the matching student, or create one from the contact, then
  // pick a course.
  const confirmEnroll = async () => {
    const { contact: c, student } = pending;
    if (student) { setPending(null); openCoursePicker(student, c); return; }
    const email = c.email.trim();
    const name = contactName(c) || email;
    setBusy(true);
    try {
      const created = await api.createUser({ name, email, phone: c.phone || '', role: 'student' });
      onMessage('Student account created', 'success');
      setPending(null);
      openCoursePicker({ id: created.id, name, email }, c);
    } catch (err) {
      onMessage(err.message, 'error');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const saveEnroll = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createEnrollment({ student_id: enrollFor.student.id, course_id: courseId });
      notify(enrollFor.contact, enrollFor.student.name);
      setEnrollFor(null);
      setDetailKey((k) => k + 1); // the open detail page now shows the LMS account
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
        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); enroll(r); }} disabled={busy}>Enroll</button>
      </div>
    ) },
  ];

  const notConnected = /not connected/i.test(error);

  return (
    <div className="portal-page">
      {detailContact ? (
        <KajabiContactDetail
          key={`${detailContact.id}-${detailKey}`}
          contact={detailContact}
          onBack={() => setDetailContact(null)}
          onEnroll={enroll}
          enrollBusy={busy}
        />
      ) : (<>
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
        {!isHubspot && ' Click a contact to see their full details.'}
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
                    <tr key={row.id} className={isHubspot ? undefined : 'clickable'} onClick={isHubspot ? undefined : () => setDetailContact(row)}>
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
      </>)}

      {pending && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Enroll {contactName(pending.contact) || pending.contact.email}?</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {pending.student ? (
                <>Do you really want to enroll <strong>{pending.student.name}</strong> ({pending.contact.email})? They are already a student — you’ll pick the course next.</>
              ) : (
                <>Do you really want to enroll this contact? They aren’t a student yet, so a student account will be created for{' '}
                  <strong>{pending.contact.email}</strong> and a welcome email with a temporary password will be sent. You’ll pick the course next.</>
              )}
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmEnroll} disabled={busy} autoFocus>
                {busy ? 'Creating…' : pending.student ? 'Yes, Enroll' : 'Yes, Create & Enroll'}
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
