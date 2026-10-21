import React, { useEffect, useState } from 'react';
import { api } from '../api';
import SearchSelect from './SearchSelect';

// The fields every Enroll form asks for before enrolling: Main Stream and
// Course (from the course list), Course Package (a Kajabi offer, from the
// server's offers cache) and booked Individual / Mock hours. Loads its own
// course and offer lists. Picking a package fills in the course linked to it
// (Course Management) — never overwriting a course already picked.
// `enrolledCourseNames` disables courses the student is already on; `editing`
// hides the Course picker (an existing enrollment keeps its course) and makes
// Main Stream optional, since older enrollments have none.
export const emptyEnrollDetails = () => ({ main_stream_id: '', course_id: '', kajabi_offer_id: '', kajabi_offer_title: '', individual_hours: '', mock_hours: '' });

const hint = { color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 };

export default function EnrollDetailsFields({ value, onChange, enrolledCourseNames = [], editing = false, autoFocus = false }) {
  const [courses, setCourses] = useState([]);
  const [offers, setOffers] = useState({ list: null, error: '' });

  useEffect(() => {
    api.getCourses().then(setCourses).catch(() => {});
    api.getKajabiOffers().then((d) => setOffers({ list: d.offers || [], error: '' }))
      .catch((err) => setOffers({ list: null, error: err.message || 'Could not load course packages' }));
  }, []);

  // Active courses (the hidden __test_call__ draft left out), plus whatever is
  // already selected so an edit keeps its value.
  const keep = (id, selected) => String(id) === String(selected);
  const courseOptions = (selected) => courses.filter((c) => (c.status === 'active' && !c.name.startsWith('__')) || keep(c.id, selected));
  const offerList = offers.list || [];
  const packageOptions = offerList.map((o) => ({ value: o.id, label: o.title, hint: o.products.join(', ') || o.internal_title }))
    .concat(value.kajabi_offer_id && !offerList.some((o) => o.id === value.kajabi_offer_id)
      ? [{ value: value.kajabi_offer_id, label: value.kajabi_offer_title || value.kajabi_offer_id, hint: 'No longer in Kajabi' }] : []);
  const enrolled = new Set(enrolledCourseNames);

  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  // Picking a Kajabi package replaces any old LMS package on the enrollment.
  const pickPackage = (id, opt) => {
    const course = id ? courses.find((c) => c.kajabi_offer_id === id && c.status === 'active') : null;
    const fillCourse = !editing && !value.course_id && course && !enrolled.has(course.name);
    onChange({
      ...value,
      kajabi_offer_id: id,
      kajabi_offer_title: id ? opt.label : '',
      ...(value.package_id ? { package_id: '' } : {}),
      course_id: fillCourse ? String(course.id) : value.course_id,
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
        <label>Course Package</label>
        <SearchSelect
          value={value.kajabi_offer_id || ''}
          options={packageOptions}
          onChange={pickPackage}
          placeholder="Select a course package…"
          clearLabel="No package"
          loading={!offers.list && !offers.error}
          error={offers.error}
        />
        {offers.list && offers.list.length === 0 && <p style={hint}>No Kajabi offers found — sync them under Packages → Kajabi offers.</p>}
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
