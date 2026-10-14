import React, { useState, useEffect } from 'react';
import { api } from '../api';
import TutorApplicationFields, { EMPTY_EDU, EMPTY_REF } from './TutorApplicationFields';

// Tutor → My Profile: their tutor application (/register) details, so they can
// fill in whatever they missed — or all of it, if an admin added them. Partial
// answers save; the banner lists what is still missing. Name, email and the
// position applied for are read-only (the admin changes those).
const LOCKED = ['position', 'full_name', 'email'];
const EDITABLE = [
  'phone', 'blood_group', 'emergency_name', 'emergency_phone', 'emergency_relationship',
  'job_source', 'job_source_detail', 'permanent_address', 'current_address', 'reason', 'motivation',
  'total_experience', 'current_employer', 'current_designation', 'current_ctc', 'expected_ctc',
  'notice_period', 'job_description', 'signature', 'place',
];
const ACCEPT = {
  photo: 'image/png,image/jpeg,image/webp',
  resume: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const muted = { color: 'var(--color-text-secondary)' };

export default function TutorMyProfile() {
  const [details, setDetails] = useState(null); // as last loaded/saved: missing, has_photo, has_resume
  const [form, setForm] = useState(null);
  const [education, setEducation] = useState([{ ...EMPTY_EDU }]);
  const [references, setReferences] = useState([{ ...EMPTY_REF }]);
  const [sameAddress, setSameAddress] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [resume, setResume] = useState(null);
  const [fileKey, setFileKey] = useState(0); // bump to clear the file inputs after saving
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const show = (d) => {
    setDetails(d);
    setForm(Object.fromEntries([...LOCKED, ...EDITABLE].map((k) => [k, d[k] || ''])));
    setEducation(d.education.length ? d.education : [{ ...EMPTY_EDU }]);
    setReferences(d.references.length ? d.references : [{ ...EMPTY_REF }]);
    setSameAddress(!!d.permanent_address && d.permanent_address === d.current_address);
  };

  useEffect(() => {
    api.getMyProfileDetails().then(show).catch((err) => setError(err.message || 'Could not load your profile'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setNotice(''); setForm((f) => ({ ...f, [k]: e.target.value })); };

  const pickFile = (setter) => (e) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > 5 * 1024 * 1024) {
      setError(`${f.name} is larger than 5 MB`);
      e.target.value = '';
      setter(null);
      return;
    }
    setError('');
    setter(f);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!declared) { setError('Please tick the declaration to save'); return; }
    setSaving(true);
    try {
      const fields = Object.fromEntries(EDITABLE.map((k) => [k, form[k]]));
      let saved = await api.saveMyProfileDetails({
        ...fields,
        current_address: sameAddress ? form.permanent_address : form.current_address,
        education,
        references,
        declaration: true,
      });
      if (photo || resume) {
        const fd = new FormData();
        if (photo) fd.append('photo', photo);
        if (resume) fd.append('resume', resume);
        const r = await api.uploadMyProfileFiles(fd);
        saved = { ...saved, has_photo: r.has_photo, has_resume: r.has_resume };
      }
      show(saved);
      setPhoto(null);
      setResume(null);
      setFileKey((k) => k + 1);
      setNotice(saved.missing.length
        ? `Saved. ${saved.missing.length} detail${saved.missing.length === 1 ? ' is' : 's are'} still missing (listed at the top).`
        : 'Saved. Your profile is complete.');
    } catch (err) {
      setError(err.message || 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return <div className="portal-page">{error ? <div className="alert alert-error">{error}</div> : <div className="spinner" />}</div>;
  }

  // A saved photo/CV opens in a new tab; picking a file replaces it on save.
  const fileInput = (kind, has, label, setter) => (
    <>
      {has && (
        <span className="register-hint">
          <a href={api.myProfileFileUrl(kind)} target="_blank" rel="noreferrer">View your {label}</a> · choose a file to replace it
        </span>
      )}
      <input key={`${kind}-${fileKey}`} type="file" accept={ACCEPT[kind]} onChange={pickFile(setter)} />
    </>
  );

  return (
    <div className="portal-page">
      <div className="page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>My Profile</h2>
          <p style={{ ...muted, margin: 0 }}>Your details from the tutor application form. Fill in anything missing and keep them up to date.</p>
        </div>
      </div>

      {details.missing.length > 0 ? (
        <div className="alert alert-info" style={{ cursor: 'default' }}>
          <strong>Still missing:</strong> {details.missing.join(', ')}.
        </div>
      ) : (
        <div className="alert alert-success" style={{ cursor: 'default' }}>Your profile is complete. Thank you!</div>
      )}

      <form className="register-card" onSubmit={save} style={{ margin: 0 }}>
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
          photoInput={fileInput('photo', details.has_photo, 'photo', setPhoto)}
          resumeInput={fileInput('resume', details.has_resume, 'CV', setResume)}
          strict={false}
          locked={LOCKED}
          lockedHint="From your account. Ask the academy to change it."
        />

        {error && <div className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>{error}</div>}
        {notice && <div className="alert alert-success" style={{ marginTop: '1rem', cursor: 'default' }}>{notice}</div>}

        <div className="register-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
