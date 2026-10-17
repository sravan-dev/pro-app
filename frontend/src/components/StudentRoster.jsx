import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Every student with their courses, plus row actions: Invite, Assign Tutor,
// Assign Course, Edit and Deactivate. Used by the manager portal; the server
// lets managers manage student accounts (but not delete them permanently).
export default function StudentRoster({ showMsg, onEnrolled }) {
  const [students, setStudents] = useState(null); // null until loaded
  const [loadError, setLoadError] = useState('');
  const [courses, setCourses] = useState([]);
  const [tutors, setTutors] = useState([]);

  // Assign Course modal
  const [enrollFor, setEnrollFor] = useState(null); // student being enrolled, or null (closed)
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState(''); // search box filtering the course picker
  const [busy, setBusy] = useState(false);

  // Assign Tutor modal
  const [tutorFor, setTutorFor] = useState(null); // student being assigned, or null (closed)
  const [tutorId, setTutorId] = useState('');
  const [tutorQuery, setTutorQuery] = useState(''); // search box filtering the tutor picker
  const [tutorBusy, setTutorBusy] = useState(false);

  // Edit modal
  const [editFor, setEditFor] = useState(null); // student being edited, or null (closed)
  const [editForm, setEditForm] = useState({ name: '', email: '', status: 'active' });
  const [editBusy, setEditBusy] = useState(false);

  const [inviteResult, setInviteResult] = useState(null);

  const loadStudents = useCallback(() => {
    api.getStudents()
      .then((rows) => { setStudents(rows); setLoadError(''); })
      .catch((e) => setLoadError(e.message || 'Could not load students'));
  }, []);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Fetch courses on open so the picker is always current.
  const openEnroll = (student) => {
    setEnrollFor(student);
    setCourseId('');
    setQuery('');
    api.getCourses().then(setCourses).catch(() => {});
  };

  const submitEnroll = async (e) => {
    e.preventDefault();
    if (!enrollFor || !courseId) return;
    setBusy(true);
    try {
      await api.createEnrollment({ student_id: enrollFor.id, course_id: courseId });
      const course = courses.find((c) => String(c.id) === courseId);
      showMsg?.(`${enrollFor.name} enrolled in ${course?.name || 'the course'}`, 'success');
      setEnrollFor(null);
      loadStudents();
      onEnrolled?.();
    } catch (err) {
      showMsg?.(err.message || 'Failed to enroll', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Pre-select the student's current tutor and fetch tutors so the picker is current.
  const openAssignTutor = (student) => {
    setTutorFor(student);
    setTutorId(student.assigned_tutor_id ? String(student.assigned_tutor_id) : '');
    setTutorQuery('');
    api.getTutors().then(setTutors).catch(() => {});
  };

  const submitAssignTutor = async (e) => {
    e.preventDefault();
    if (!tutorFor) return;
    setTutorBusy(true);
    try {
      await api.assignStudent({ student_id: tutorFor.id, assigned_tutor_id: tutorId || null });
      showMsg?.(tutorId ? `Tutor assigned to ${tutorFor.name}` : `Tutor removed from ${tutorFor.name}`, 'success');
      setTutorFor(null);
      loadStudents(); // refresh assigned_tutor_id so reopening pre-selects correctly
    } catch (err) {
      showMsg?.(err.message || 'Failed to assign tutor', 'error');
    } finally {
      setTutorBusy(false);
    }
  };

  const openEdit = (student) => {
    setEditFor(student);
    setEditForm({ name: student.name || '', email: student.email || '', status: student.status || 'active' });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setEditBusy(true);
    try {
      await api.updateUser({ id: editFor.id, ...editForm });
      showMsg?.('Student updated', 'success');
      setEditFor(null);
      loadStudents();
    } catch (err) {
      showMsg?.(err.message || 'Failed to update student', 'error');
    } finally {
      setEditBusy(false);
    }
  };

  const invite = async (student) => {
    try { setInviteResult({ name: student.name, ...(await api.inviteUser(student.id)) }); }
    catch (err) { showMsg?.(err.message || 'Failed to send invite', 'error'); }
  };

  const deactivate = async (student) => {
    if (!confirm(`Deactivate ${student.name}?`)) return;
    try { await api.deleteUser(student.id); showMsg?.('Student deactivated', 'success'); loadStudents(); }
    catch (err) { showMsg?.(err.message, 'error'); }
  };

  const muted = (text = '—') => <span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>;
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  const columns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'team', label: 'Team', accessor: 'team_name', render: (r) => r.team_name || muted() },
    { key: 'courses', label: 'Courses', accessor: 'enrolled_courses' },
    { key: 'course_names', label: 'Course(s)', accessor: 'course_names', render: (r) => (r.course_names
      ? <span title={r.course_names} style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{r.course_names}</span>
      : muted()) },
    { key: 'enrolled_at', label: 'Enrolled', accessor: 'enrolled_at', render: (r) => (r.enrolled_at
      ? <span style={{ whiteSpace: 'nowrap' }}>{new Date(r.enrolled_at).toLocaleDateString()}</span>
      : muted()) },
    { key: 'progress', label: 'Avg Progress', accessor: 'avg_progress', render: (r) => {
      const pct = Math.round(Number(r.avg_progress) || 0);
      return <div className="progress-bar-inline"><div className="progress-fill" style={{ width: `${pct}%` }} /><span>{pct}%</span></div>;
    } },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        {r.email && <button className="btn btn-sm btn-ghost" style={{ color: '#10B981' }} onClick={stop(() => invite(r))}>Invite</button>}
        <button className="btn btn-sm btn-danger" title={r.assigned_tutor_name ? `Tutor: ${r.assigned_tutor_name}` : 'No tutor assigned'} onClick={stop(() => openAssignTutor(r))}>Assign Tutor</button>
        <button className="btn btn-sm btn-primary" onClick={stop(() => openEnroll(r))}>Assign Course</button>
        <button className="btn btn-sm btn-ghost" onClick={stop(() => openEdit(r))}>Edit</button>
        {!['inactive', 'archived', 'dropped', 'blacklisted'].includes(r.status) && (
          <button className="btn btn-sm btn-ghost text-danger" onClick={stop(() => deactivate(r))}>Deactivate</button>
        )}
      </div>
    ) },
  ];

  // Only active courses can take students (archived ones and the hidden
  // __test_call__ draft are left out). Courses the student is already on stay
  // listed but disabled.
  const activeCourses = courses.filter((c) => c.status === 'active');
  const enrolledNames = new Set((enrollFor?.course_names || '').split(', ').filter(Boolean));
  const q = query.trim().toLowerCase();
  const matches = q
    ? activeCourses.filter((c) => [c.name, c.category].some((v) => v && String(v).toLowerCase().includes(q)))
    : activeCourses;
  const selected = activeCourses.find((c) => String(c.id) === courseId);
  const options = selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  // Enter in the search box picks the first course the student isn't on yet.
  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = matches.find((c) => !enrolledNames.has(c.name));
    if (first) setCourseId(String(first.id));
  };

  // Only active tutors are assignable. "No tutor" clears the assignment; the
  // selected tutor always stays listed so the select keeps its value.
  const activeTutors = tutors.filter((t) => t.status === 'active');
  const tq = tutorQuery.trim().toLowerCase();
  const tutorMatches = tq
    ? activeTutors.filter((t) => [t.name, t.specialization, t.email].some((v) => v && String(v).toLowerCase().includes(tq)))
    : activeTutors;
  const selectedTutor = activeTutors.find((t) => String(t.id) === tutorId);
  const tutorOptions = selectedTutor && !tutorMatches.includes(selectedTutor) ? [selectedTutor, ...tutorMatches] : tutorMatches;
  const onTutorSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (tutorMatches.length) setTutorId(String(tutorMatches[0].id));
  };

  const setEdit = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="portal-page">
      <h2>Students</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
        Invite, assign a tutor or course, edit or deactivate a student.
      </p>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {students === null && !loadError && <p className="empty-state">Loading students…</p>}
      {students && (students.length === 0
        ? <p className="empty-state">No students yet.</p>
        : <DataTable columns={columns} data={students} pageSize={15} />)}

      {enrollFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Assign Course</h3>
            <form onSubmit={submitEnroll}>
              <div className="form-group">
                <label>Student</label>
                <input value={`${enrollFor.name}${enrollFor.email ? ` (${enrollFor.email})` : ''}`} disabled />
              </div>
              <div className="form-group">
                <label>Course *</label>
                <input
                  type="search"
                  placeholder="Search courses by name or category…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  autoFocus
                />
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
                  <option value="">Select course...</option>
                  {options.map((c) => {
                    const already = enrolledNames.has(c.name);
                    return (
                      <option key={c.id} value={c.id} disabled={already}>
                        {c.name}{c.category ? ` — ${c.category}` : ''}{already ? ' (already enrolled)' : ''}
                      </option>
                    );
                  })}
                </select>
                {q && activeCourses.length > 0 && (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>
                    {matches.length === 0 ? `No courses match "${query.trim()}".` : `${matches.length} of ${activeCourses.length} courses match.`}
                  </p>
                )}
                {activeCourses.length === 0 && (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>No active courses available.</p>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEnrollFor(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy || !courseId}>{busy ? 'Assigning…' : 'Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tutorFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Assign Tutor</h3>
            <form onSubmit={submitAssignTutor}>
              <div className="form-group">
                <label>Student</label>
                <input value={`${tutorFor.name}${tutorFor.email ? ` (${tutorFor.email})` : ''}`} disabled />
              </div>
              <div className="form-group">
                <label>Tutor</label>
                <input
                  type="search"
                  placeholder="Search tutors by name, specialization or email…"
                  value={tutorQuery}
                  onChange={(e) => setTutorQuery(e.target.value)}
                  onKeyDown={onTutorSearchKeyDown}
                  autoFocus
                />
                <select value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
                  <option value="">— No tutor —</option>
                  {tutorOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.specialization ? ` — ${t.specialization}` : ''}</option>
                  ))}
                </select>
                {tq && activeTutors.length > 0 && (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>
                    {tutorMatches.length === 0 ? `No tutors match "${tutorQuery.trim()}".` : `${tutorMatches.length} of ${activeTutors.length} tutors match.`}
                  </p>
                )}
                {activeTutors.length === 0 && (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>No active tutors available.</p>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setTutorFor(null)} disabled={tutorBusy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={tutorBusy}>{tutorBusy ? 'Saving…' : 'Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Edit Student</h3>
            <form onSubmit={submitEdit}>
              <div className="form-group">
                <label>Name *</label>
                <input value={editForm.name} onChange={setEdit('name')} required />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" value={editForm.email} onChange={setEdit('email')} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                {/* Blacklisting needs a reason, so it isn't offered here. */}
                <select value={editForm.status} onChange={setEdit('status')}>
                  {[...new Set(['active', 'inactive', editFor.status].filter(Boolean))].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditFor(null)} disabled={editBusy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inviteResult && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3>Invite {inviteResult.name}</h3>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {inviteResult.emailed
                ? `A login email was sent to ${inviteResult.email}.`
                : 'Email could not be sent (SMTP not configured). Share these login details manually:'}
            </p>
            <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.9 }}>
              <div><strong>Login:</strong> {inviteResult.login_url}</div>
              <div><strong>Email:</strong> {inviteResult.email}</div>
              <div><strong>Password:</strong> <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: 4 }}>{inviteResult.password}</code></div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              They'll be asked to set their own password on first login.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => setInviteResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
