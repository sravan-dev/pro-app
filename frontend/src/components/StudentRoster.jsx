import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Every student with their courses, plus an "Enroll" action that puts a
// student on a course. Used by the manager portal; the server lets managers
// list students and create enrollments.
export default function StudentRoster({ showMsg, onEnrolled }) {
  const [students, setStudents] = useState(null); // null until loaded
  const [loadError, setLoadError] = useState('');
  const [courses, setCourses] = useState([]);

  // Enroll modal
  const [enrollFor, setEnrollFor] = useState(null); // student being enrolled, or null (closed)
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState(''); // search box filtering the course picker
  const [busy, setBusy] = useState(false);

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

  const muted = (text = '—') => <span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>;

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
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openEnroll(r); }}>Enroll</button>
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

  return (
    <div className="portal-page">
      <h2>Students</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
        Enroll a student in a course with the Enroll button.
      </p>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {students === null && !loadError && <p className="empty-state">Loading students…</p>}
      {students && (students.length === 0
        ? <p className="empty-state">No students yet.</p>
        : <DataTable columns={columns} data={students} pageSize={15} />)}

      {enrollFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Enroll in Course</h3>
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
                <button type="submit" className="btn btn-primary" disabled={busy || !courseId}>{busy ? 'Enrolling…' : 'Enroll'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
