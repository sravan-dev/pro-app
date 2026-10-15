import React from 'react';

// The sections of the tutor application form, shared by the public /register
// page and the tutor's own My Profile page so the two never drift apart. The
// parent owns the state. `strict` makes required fields required in the
// browser (the public form); My Profile saves partial answers, so it only
// marks them. `locked` lists fields shown read-only.
export const JOB_SOURCES = [
  { value: 'indeed_naukri', label: 'Indeed / Naukri' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'walk_in', label: 'Walk-in / Advertisement' },
  { value: 'referral', label: 'Employee Referral' },
  { value: 'other', label: 'Others' },
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const EMPTY_EDU = { qualification: '', institution: '', year: '', score: '' };
export const EMPTY_REF = { name: '', designation: '', company: '', email: '', phone: '' };

export default function TutorApplicationFields({
  form, set, education, setEducation, references, setReferences,
  sameAddress, setSameAddress, declared, setDeclared,
  photoInput, resumeInput, strict = true, locked = [], lockedHint,
}) {
  const setRow = (setter, i, k) => (e) => setter((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const lock = (k) => (locked.includes(k) ? { readOnly: true, disabled: true } : {});
  const lockHint = (k) => (locked.includes(k) ? lockedHint : undefined);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      <section className="register-section">
        <h2>Position &amp; Personal Details</h2>
        <div className="register-grid">
          <Field label="Position applied for" required hint={lockHint('position')}>
            <input value={form.position} onChange={set('position')} required={strict} maxLength={160} {...lock('position')} />
          </Field>
          <Field label="Full name" required hint={lockHint('full_name')}>
            <input value={form.full_name} onChange={set('full_name')} required={strict} maxLength={160} autoComplete="name" {...lock('full_name')} />
          </Field>
          <Field label="Contact number(s)" required>
            <input type="tel" value={form.phone} onChange={set('phone')} required={strict} maxLength={80} autoComplete="tel" />
          </Field>
          <Field label="Email ID" required hint={lockHint('email')}>
            <input type="email" value={form.email} onChange={set('email')} required={strict} maxLength={255} autoComplete="email" {...lock('email')} />
          </Field>
          <Field label="Blood group">
            <select value={form.blood_group} onChange={set('blood_group')}>
              <option value="">Select…</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Photo" hint="PNG, JPG or WEBP · max 5 MB">
            {photoInput}
          </Field>
          <Field label="Emergency contact name" required>
            <input value={form.emergency_name} onChange={set('emergency_name')} required={strict} maxLength={160} />
          </Field>
          <Field label="Emergency contact number" required>
            <input type="tel" value={form.emergency_phone} onChange={set('emergency_phone')} required={strict} maxLength={80} />
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
            <input value={form.job_source_detail} onChange={set('job_source_detail')} required={strict} maxLength={160} />
          </Field>
        )}
      </section>

      <section className="register-section">
        <h2>Address</h2>
        <Field label="Full permanent address" required>
          <textarea rows={3} value={form.permanent_address} onChange={set('permanent_address')} required={strict} maxLength={4000} />
        </Field>
        <label className="register-check">
          <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
          Current address is the same as permanent address
        </label>
        {!sameAddress && (
          <Field label="Full current address" required>
            <textarea rows={3} value={form.current_address} onChange={set('current_address')} required={strict} maxLength={4000} />
          </Field>
        )}
      </section>

      <section className="register-section">
        <h2>About You</h2>
        <Field label="What is the reason for applying to this position?" required>
          <textarea rows={4} value={form.reason} onChange={set('reason')} required={strict} maxLength={4000} />
        </Field>
        <Field label="What are your motivations to work with Tiju's Academy?" required>
          <textarea rows={4} value={form.motivation} onChange={set('motivation')} required={strict} maxLength={4000} />
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
          strict={strict}
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
          {resumeInput}
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
          strict={strict}
        />
      </section>

      <section className="register-section">
        <h2>Declaration <span className="req">*</span></h2>
        <label className="register-check">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} required />
          <span>
            I hereby declare that all the information given above is true and correct to the best of my knowledge and belief.
            <span className="req"> *</span>
          </span>
        </label>
        <div className="register-grid">
          <Field label="Signature (type your full name)" required>
            <input value={form.signature} onChange={set('signature')} required={strict} maxLength={160} className="register-signature" />
          </Field>
          <Field label="Date">
            <input value={today} readOnly disabled />
          </Field>
          <Field label="Place">
            <input value={form.place} onChange={set('place')} maxLength={120} />
          </Field>
        </div>
      </section>
    </>
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
function RowTable({ columns, rows, onChange, onAdd, onRemove, max, addLabel, strict }) {
  return (
    <div className="register-rows">
      {rows.map((row, i) => (
        <div key={i} className="register-row" style={{ '--cols': columns.length }}>
          {columns.map(([k, label, placeholder, required, type]) => (
            <label key={k} className="register-field">
              <span className="register-label">{label}{required && i === 0 && <span className="req"> *</span>}</span>
              <input type={type || 'text'} value={row[k]} onChange={onChange(i, k)} placeholder={placeholder || ''} required={strict && required && i === 0} maxLength={160} />
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
