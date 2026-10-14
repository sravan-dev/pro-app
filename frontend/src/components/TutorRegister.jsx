import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import TutorApplicationFields, { EMPTY_EDU, EMPTY_REF } from './TutorApplicationFields';

// /register — public tutor application form (the paper "Job Application Form"
// as a web page). Anyone can submit; nothing is created until a superadmin
// reviews it under Admin → Applications.
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

        <TutorApplicationFields
          form={form}
          set={set}
          education={education}
          setEducation={setEducation}
          references={references}
          setReferences={setReferences}
          sameAddress={sameAddress}
          setSameAddress={setSameAddress}
          declared={declared}
          setDeclared={setDeclared}
          photoInput={<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile(setPhoto, 5)} />}
          resumeInput={<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={pickFile(setResume, 5)} />}
        />

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
