import React, { useEffect, useState } from 'react';
import { api } from '../api';

// The fields every Enroll form asks for before enrolling: Main Stream and
// Course (from the course list), Package (from the Packages module) and
// booked Individual / Mock hours. Loads its own course and package lists.
// Picking a package fills in its course and, for a 1-on-1 package, its total
// hours — never overwriting anything already entered.
// `enrolledCourseNames` disables courses the student is already on; `editing`
// hides the Course picker (an existing enrollment keeps its course) and makes
// Main Stream optional, since older enrollments have none.
export const emptyEnrollDetails = () => ({ main_stream_id: '', course_id: '', package_id: '', individual_hours: '', mock_hours: '' });

const hint = { color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 };

export default function EnrollDetailsFields({ value, onChange, enrolledCourseNames = [], editing = false, autoFocus = false }) {
  const [courses, setCourses] = useState([]);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    api.getCourses().then(setCourses).catch(() => {});
    api.getPackages().then(setPackages).catch(() => {});
  }, []);

  // Active courses (the hidden __test_call__ draft left out) and active
  // packages, plus whatever is already selected so an edit keeps its value.
  const keep = (id, selected) => String(id) === String(selected);
  const courseOptions = (selected) => courses.filter((c) => (c.status === 'active' && !c.name.startsWith('__')) || keep(c.id, selected));
  const packageOptions = packages.filter((p) => p.status === 'active' || keep(p.id, value.package_id));
  const enrolled = new Set(enrolledCourseNames);

  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  const pickPackage = (e) => {
    const id = e.target.value;
    const p = packages.find((x) => String(x.id) === id);
    const hours = p && p.class_type === 'one_to_one' ? String(Math.round((p.sessions_count * p.session_minutes) / 60 * 100) / 100) : '';
    const course = p?.course_id ? courses.find((c) => c.id === p.course_id) : null;
    const fillCourse = !editing && !value.course_id && course && !enrolled.has(course.name);
    onChange({
      ...value,
      package_id: id,
      course_id: fillCourse ? String(course.id) : value.course_id,
      individual_hours: value.individual_hours !== '' ? value.individual_hours : hours,
    });
  };

  return (
    <>
      <div className={editing ? undefined : 'form-row'}>
        <div className="form-group">
          <label>Main Stream{editing ? '' : ' *'}</label>
          <select value={value.main_stream_id} onChange={set('main_stream_id')} required={!editing} autoFocus={autoFocus}>
            <option value="">{editing ? '— None —' : 'Select main stream...'}</option>
            {courseOptions(value.main_stream_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {!editing && (
          <div className="form-group">
            <label>Course *</label>
            <select value={value.course_id} onChange={set('course_id')} required>
              <option value="">Select course...</option>
              {courseOptions(value.course_id).map((c) => {
                const already = enrolled.has(c.name);
                return <option key={c.id} value={c.id} disabled={already}>{c.name}{already ? ' (already enrolled)' : ''}</option>;
              })}
            </select>
          </div>
        )}
      </div>
      <div className="form-group">
        <label>Package</label>
        <select value={value.package_id} onChange={pickPackage}>
          <option value="">— No package —</option>
          {packageOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.course_name ? ` — ${p.course_name}` : ''}</option>)}
        </select>
        {packageOptions.length === 0 && <p style={hint}>No active packages yet — add them under Packages.</p>}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Individual hours</label>
          <input type="number" min="0" step="0.5" value={value.individual_hours} onChange={set('individual_hours')} placeholder="0" />
        </div>
        <div className="form-group">
          <label>Mock hours</label>
          <input type="number" min="0" step="0.5" value={value.mock_hours} onChange={set('mock_hours')} placeholder="0" />
        </div>
      </div>
    </>
  );
}
