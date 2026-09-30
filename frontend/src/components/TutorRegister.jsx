import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// /register — public tutor application form (the paper "Job Application Form"
// as a web page). Anyone can submit; nothing is created until a superadmin
// reviews it under Admin → Applications.
const JOB_SOURCES = [
  { value: 'indeed_naukri', label: 'Indeed / Naukri' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'walk_in', label: 'Walk-in / Advertisement' },
  { value: 'referral', label: 'Employee Referral' },
  { value: 'other', label: 'Others' },
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const EMPTY_EDU = { qualification: '', institution: '', year: '', score: '' };
const EMPTY_REF = { name: '', designation: '', company: '', email: '', phone: '' };

const INITIAL = {
  position: 'Tutor', full_name: '', phone: '', email: '', blood_group: '',
  emergency_name: '', emergency_phone: '', emergency_relationship: '',
  job_source: '', job_source_detail: '',
  permanent_address: '', current_address: '', reason: '', motivation: '',
  total_experience: '', current_employer: '', current_designation: '',
  current_ctc: '', expected_ctc: '', notice_period: '', job_description: '',
  signature: '', place: '', website: '',
};

export default function TutorRegister() {
  const [form, setForm] = useState(INITIAL);
  const [education, setEducation] = useState([{ ...EMPTY_EDU }]);
  const [references, setReferences] = useState([{ ...EMPTY_REF }]);
  const [photo, setPhoto] = useState(null);
  const [resume, setResume] = useState(null);
  const [sameAddress, setSameAddress] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (setter, i, k) => (e) => setter((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const pickFile = (setter, maxMb) => (e) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > maxMb * 1024 * 1024) {
      setError(`${f.name} is larger than ${maxMb} MB`);
      e.target.value = '';
      setter(null);
      return;
    }
    setError('');
    setter(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.job_source) { setError('Please tell us where you heard about this job'); return; }
    if (!education.some((r) => r.qualification.trim())) { setError('Please add at least one education qualification'); return; }
    if (!declared) { setError('Please accept the declaration'); return; }

    const data = new FormData();
    const values = { ...form, current_address: sameAddress ? form.permanent_address : form.current_address };
    Object.entries(values).forEach(([k, v]) => data.append(k, v));
    data.append('education', JSON.stringify(education));
    data.append('references', JSON.stringify(references));
    data.append('declaration', 'true');
    if (photo) data.append('photo', photo);
    if (resume) data.append('resume', resume);

    setBusy(true);
    try {
      await api.submitTutorApplication(data);
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Could not submit your application');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="register-page">
        <div className="register-card register-done">
          <img src="/logo.png" alt="Tiju's Academy" className="register-logo" />
          <h1>Application received</h1>
          <p>Thank you, {form.full_name.split(' ')[0] || 'applicant'}. Our team will review your application and contact you at <strong>{form.email}</strong>.</p>
          <Link to="/login" className="btn btn-primary">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page">
      <form className="register-card" onSubmit={handleSubmit}>
        <header className="register-head">
          <img src="/logo.png" alt="Tiju's Academy" className="register-logo" />
          <div>
            <h1>Tijus Academy Tutor Application Form</h1>
            <p>Join Tiju&apos;s Academy as a tutor. Fields marked <span className="req">*</span> are required.</p>
          </div>
        </header>

        {/* Honeypot — hidden from people, filled in by bots. */}
        <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="register-hp" aria-hidden="true" />

        <section className="register-section">
          <h2>Position &amp; Personal Details</h2>
          <div className="register-grid">
            <Field label="Position applied for" required>
              <input value={form.position} onChange={set('position')} required maxLength={160} />
            </Field>
            <Field label="Full name" required>
              <input value={form.full_name} onChange={set('full_name')} required maxLength={160} autoComplete="name" />
            </Field>
            <Field label="Contact number(s)" required>
              <input type="tel" value={form.phone} onChange={set('phone')} required maxLength={80} autoComplete="tel" />
            </Field>
            <Field label="Email ID" required>
              <input type="email" value={form.email} onChange={set('email')} required maxLength={255} autoComplete="email" />
            </Field>
            <Field label="Blood group">
              <select value={form.blood_group} onChange={set('blood_group')}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Photo" hint="PNG, JPG or WEBP · max 5 MB">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile(setPhoto, 5)} />
            </Field>
            <Field label="Emergency contact name" required>
              <input value={form.emergency_name} onChange={set('emergency_name')} required maxLength={160} />
            </Field>
            <Field label="Emergency contact number" required>
              <input type="tel" value={form.emergency_phone} onChange={set('emergency_phone')} required maxLength={80} />
            </Field>
            <Field label="Relationship">
              <input value={form.emergency_relationship} onChange={set('emergency_relationship')} maxLength={80} />
            </Field>
          </div>
        </section>

        <section className="register-section">
          <h2>Job Source <span className="req">*</span></h2>
          <div className="register-radios" role="radiogroup" aria-label="Job source">
            {JOB_SOURCES.map((s) => (
              <label key={s.value} className={`register-radio${form.job_source === s.value ? ' active' : ''}`}>
                <input type="radio" name="job_source" value={s.value} checked={form.job_source === s.value} onChange={set('job_source')} />
                {s.label}
              </label>
            ))}
          </div>
          {(form.job_source === 'referral' || form.job_source === 'other') && (
            <Field label={form.job_source === 'referral' ? 'Employee name' : 'Please specify'} required>
              <input value={form.job_source_detail} onChange={set('job_source_detail')} required maxLength={160} />
            </Field>
          )}
        </section>

        <section className="register-section">
          <h2>Address</h2>
          <Field label="Full permanent address" required>
            <textarea rows={3} value={form.permanent_address} onChange={set('permanent_address')} required maxLength={4000} />
          </Field>
          <label className="register-check">
            <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
            Current address is the same as permanent address
          </label>
          {!sameAddress && (
            <Field label="Full current address" required>
              <textarea rows={3} value={form.current_address} onChange={set('current_address')} required maxLength={4000} />
            </Field>
          )}
        </section>

        <section className="register-section">
          <h2>About You</h2>
          <Field label="What is the reason for applying to this position?" required>
            <textarea rows={4} value={form.reason} onChange={set('reason')} required maxLength={4000} />
          </Field>
          <Field label="What are your motivations to work with Tiju's Academy?" required>
            <textarea rows={4} value={form.motivation} onChange={set('motivation')} required maxLength={4000} />
          </Field>
        </section>

        <section className="register-section">
          <h2>Education Qualification(s) <span className="register-sub">highest to lowest</span></h2>
          <RowTable
            columns={[
              ['qualification', 'Qualification', 'e.g. MA English', true],
              ['institution', 'Name of institution'],
              ['year', 'Year of passing', 'e.g. 2019'],
              ['score', '% scored', 'e.g. 78%'],
            ]}
            rows={education}
            onChange={(i, k) => setRow(setEducation, i, k)}
            onAdd={() => setEducation((r) => [...r, { ...EMPTY_EDU }])}
            onRemove={(i) => setEducation((r) => r.filter((_, j) => j !== i))}
            max={8}
            addLabel="+ Add qualification"
          />
        </section>

        <section className="register-section">
          <h2>Employment Information</h2>
          <div className="register-grid">
            <Field label="Total years of experience">
              <input value={form.total_experience} onChange={set('total_experience')} maxLength={40} placeholder="e.g. 3 years" />
            </Field>
            <Field label="Current / last employer">
              <input value={form.current_employer} onChange={set('current_employer')} maxLength={160} />
            </Field>
            <Field label="Current / last designation">
              <input value={form.current_designation} onChange={set('current_designation')} maxLength={160} />
            </Field>
            <Field label="Current / last CTC (salary)">
              <input value={form.current_ctc} onChange={set('current_ctc')} maxLength={60} />
            </Field>
            <Field label="Expected CTC (salary)">
              <input value={form.expected_ctc} onChange={set('expected_ctc')} maxLength={60} />
            </Field>
            <Field label="Notice period (if any)">
              <input value={form.notice_period} onChange={set('notice_period')} maxLength={60} />
            </Field>
          </div>
          <Field label="Present / previous job description">
            <textarea rows={3} value={form.job_description} onChange={set('job_description')} maxLength={4000} />
          </Field>
          <Field label="CV / Resume" hint="PDF or Word · max 5 MB">
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={pickFile(setResume, 5)} />
          </Field>
        </section>

        <section className="register-section">
          <h2>Professional References <span className="register-sub">for background check</span></h2>
          <RowTable
            columns={[
              ['name', 'Reference name'],
              ['designation', 'Designation'],
              ['company', 'Company name'],
              ['email', 'Email ID', '', false, 'email'],
              ['phone', 'Contact no.', '', false, 'tel'],
            ]}
            rows={references}
            onChange={(i, k) => setRow(setReferences, i, k)}
            onAdd={() => setReferences((r) => [...r, { ...EMPTY_REF }])}
            onRemove={(i) => setReferences((r) => r.filter((_, j) => j !== i))}
            max={5}
            addLabel="+ Add reference"
          />
        </section>

        <section className="register-section">
          <h2>Declaration</h2>
          <label className="register-check">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} required />
            I hereby declare that all the information given above is true and correct to the best of my knowledge and belief.
          </label>
          <div className="register-grid">
            <Field label="Signature (type your full name)" required>
              <input value={form.signature} onChange={set('signature')} required maxLength={160} className="register-signature" />
            </Field>
            <Field label="Date">
              <input value={today} readOnly disabled />
            </Field>
            <Field label="Place" required>
              <input value={form.place} onChange={set('place')} required maxLength={120} />
            </Field>
          </div>
        </section>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="register-actions">
          <Link to="/login" className="btn btn-ghost">Back to sign in</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="register-field">
      <span className="register-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="register-hint">{hint}</span>}
    </label>
  );
}

// Repeating rows (education, references). columns: [key, label, placeholder, required, type]
function RowTable({ columns, rows, onChange, onAdd, onRemove, max, addLabel }) {
  return (
    <div className="register-rows">
      {rows.map((row, i) => (
        <div key={i} className="register-row" style={{ '--cols': columns.length }}>
          {columns.map(([k, label, placeholder, required, type]) => (
            <label key={k} className="register-field">
              <span className="register-label">{label}{required && i === 0 && <span className="req"> *</span>}</span>
              <input type={type || 'text'} value={row[k]} onChange={onChange(i, k)} placeholder={placeholder || ''} required={required && i === 0} maxLength={160} />
            </label>
          ))}
          {rows.length > 1 && (
            <button type="button" className="btn btn-sm btn-ghost text-danger register-row-remove" onClick={() => onRemove(i)} aria-label="Remove row">Remove</button>
          )}
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn btn-sm btn-ghost register-add" onClick={onAdd}>{addLabel}</button>
      )}
    </div>
  );
}
