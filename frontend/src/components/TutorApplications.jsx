import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Tutor Management → Applications — tutor applications submitted from the public
// /register page. `embedded` drops the page wrapper/heading when shown inside
// the Tutor Management page. Review, set a status, keep notes, or delete.
const STATUSES = ['new', 'shortlisted', 'rejected', 'hired'];
const STATUS_STYLE = {
  new: { background: '#DBEAFE', color: '#1E40AF' },
  shortlisted: { background: '#FEF3C7', color: '#92400E' },
  rejected: { background: '#F3F4F6', color: '#6B7280' },
  hired: { background: '#D1FAE5', color: '#065F46' },
};
const SOURCE_LABELS = {
  indeed_naukri: 'Indeed / Naukri', linkedin: 'LinkedIn', social_media: 'Social Media',
  walk_in: 'Walk-in / Advertisement', referral: 'Employee Referral', other: 'Others',
};
const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleString() : '—');

function StatusBadge({ status }) {
  return <span className="status-badge" style={STATUS_STYLE[status] || STATUS_STYLE.new}>{status}</span>;
}

export default function TutorApplications({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = () => {
    setLoading(true);
    return api.getTutorApplications()
      .then((r) => { setRows(r); setError(''); return r; })
      .catch((err) => { setError(err.message || 'Failed to load applications'); return null; })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'name', label: 'Applicant', accessor: 'full_name', render: (r) => <strong>{r.full_name}</strong> },
    { key: 'position', label: 'Position', accessor: 'position' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'phone', label: 'Phone', accessor: 'phone' },
    { key: 'exp', label: 'Experience', accessor: 'total_experience', render: (r) => r.total_experience || '—' },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'date', label: 'Submitted', accessor: 'created_at', render: (r) => fmtDate(r.created_at) },
  ];

  const newCount = rows.filter((r) => r.status === 'new').length;

  return (
    <div className={embedded ? '' : 'portal-page'}>
      <div className="page-header" style={embedded ? { marginBottom: '1rem' } : undefined}>
        <div>
          {!embedded && <h2 style={{ marginBottom: 4 }}>Tutor Applications</h2>}
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Submitted from the public form at <a href="/register" target="_blank" rel="noreferrer">/register</a>
            {newCount > 0 && ` · ${newCount} new`}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>
      {error && <div style={{ color: '#dc2626', margin: '8px 0' }}>{error}</div>}
      {loading && !rows.length ? <div className="spinner" /> : (
        <DataTable columns={columns} data={rows} pageSize={15} onRowClick={setSelected} />
      )}

      {selected && (
        <ApplicationModal
          app={selected}
          onClose={() => setSelected(null)}
          onChanged={async (deleted) => {
            const fresh = await load();
            if (deleted || !fresh) setSelected(null);
            else setSelected(fresh.find((r) => r.id === selected.id) || null);
          }}
        />
      )}
    </div>
  );
}

function ApplicationModal({ app, onClose, onChanged }) {
  const [notes, setNotes] = useState(app.admin_notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (changes) => {
    setBusy(true);
    setError('');
    try {
      await api.updateTutorApplication(app.id, changes);
      await onChanged(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${app.full_name}'s application? Their photo and CV are deleted too.`)) return;
    setBusy(true);
    try {
      await api.deleteTutorApplication(app.id);
      await onChanged(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const source = SOURCE_LABELS[app.job_source] || app.job_source || '—';
  const sectionTitle = { fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', margin: '1.25rem 0 0.5rem' };
  const cell = { padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--color-border)', textAlign: 'left', fontSize: '0.85rem' };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 820 }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          {app.has_photo && (
            <img src={api.tutorApplicationFileUrl(app.id, 'photo')} alt="" style={{ width: 84, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginBottom: 4 }}>{app.full_name}</h3>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              {app.position} · submitted {fmtDate(app.created_at)}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={app.status} />
              {app.has_resume && (
                <a className="btn btn-sm btn-ghost" href={api.tutorApplicationFileUrl(app.id, 'resume')} target="_blank" rel="noreferrer">Open CV</a>
              )}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={sectionTitle}>Personal details</div>
        <Info rows={[
          ['Email', app.email], ['Contact number(s)', app.phone], ['Blood group', app.blood_group],
          ['Emergency contact', [app.emergency_name, app.emergency_relationship && `(${app.emergency_relationship})`, app.emergency_phone].filter(Boolean).join(' ')],
          ['Job source', app.job_source_detail ? `${source}: ${app.job_source_detail}` : source],
          ['Permanent address', app.permanent_address], ['Current address', app.current_address],
        ]} />

        <div style={sectionTitle}>Reason for applying</div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{app.reason || '—'}</p>
        <div style={sectionTitle}>Motivation to work with Tiju&apos;s Academy</div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{app.motivation || '—'}</p>

        <div style={sectionTitle}>Education</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Qualification', 'Institution', 'Year', '% scored'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {app.education.map((e, i) => (
                <tr key={i}><td style={cell}>{e.qualification}</td><td style={cell}>{e.institution}</td><td style={cell}>{e.year}</td><td style={cell}>{e.score}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={sectionTitle}>Employment</div>
        <Info rows={[
          ['Total experience', app.total_experience], ['Current / last employer', app.current_employer],
          ['Current / last designation', app.current_designation], ['Current / last CTC', app.current_ctc],
          ['Expected CTC', app.expected_ctc], ['Notice period', app.notice_period],
          ['Job description', app.job_description],
        ]} />

        {app.references.length > 0 && (
          <>
            <div style={sectionTitle}>Professional references</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Name', 'Designation', 'Company', 'Email', 'Contact'].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>
                  {app.references.map((r, i) => (
                    <tr key={i}><td style={cell}>{r.name}</td><td style={cell}>{r.designation}</td><td style={cell}>{r.company}</td><td style={cell}>{r.email}</td><td style={cell}>{r.phone}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={sectionTitle}>Declaration</div>
        <p style={{ margin: 0 }}>Signed <strong>{app.signature}</strong> at {app.place} on {fmtDate(app.created_at).split(',')[0]}.</p>

        <div style={sectionTitle}>Review</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {STATUSES.map((s) => (
            <button key={s} className={`btn btn-sm ${app.status === s ? 'btn-primary' : 'btn-ghost'}`} disabled={busy || app.status === s} onClick={() => save({ status: s })} style={{ textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
        <textarea rows={3} style={{ width: '100%' }} placeholder="Internal notes (not visible to the applicant)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost text-danger" disabled={busy} onClick={remove}>Delete</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" disabled={busy || notes === (app.admin_notes || '')} onClick={() => save({ admin_notes: notes })}>Save notes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) 1fr', gap: '0.35rem 1rem', fontSize: '0.9rem' }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <div style={{ color: 'var(--color-text-secondary)' }}>{k}</div>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v || '—'}</div>
        </React.Fragment>
      ))}
    </div>
  );
}
