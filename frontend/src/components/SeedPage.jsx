import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// /seed — superadmin-only page that runs the tutor seed (backend/seeds/tutors.js)
// for hosts where the import script can't be run from a terminal. Preview first;
// "Create accounts" skips any email that already exists, so it is safe to re-run.
export default function SeedPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (dryRun) => {
    if (!dryRun && !window.confirm('Create the tutor accounts now?')) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api.seedTutors(dryRun));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cell = { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border, #e5e7eb)', textAlign: 'left' };

  return (
    <div style={{ padding: '2rem 1rem', maxWidth: 760, margin: '0 auto' }}>
      <div className="portal-page">
        <h2>Seed Tutors</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.75rem' }}>
          Creates the tutor accounts from the import list. Emails that already exist are skipped and never changed.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(true)}>Preview</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}>Create accounts</button>
          <Link className="btn btn-ghost" to="/admin">Back to admin</Link>
        </div>

        {busy && <p>Working…</p>}
        {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

        {result && !busy && (
          <div>
            <p style={{ fontWeight: 600 }}>
              {result.dryRun
                ? `Preview: ${result.created.length} tutor(s) would be created, ${result.existing.length} already exist.`
                : `${result.created.length} tutor(s) created, ${result.existing.length} already existed.`}
            </p>
            {!result.dryRun && result.created.length > 0 && (
              <p>
                Shared first-time password: <code>{result.password}</code>. Each tutor must set their own password at first login.
              </p>
            )}

            {result.created.length > 0 && (
              <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th style={cell}>{result.dryRun ? 'Would create' : 'Created'}</th><th style={cell}>Email</th></tr>
                  </thead>
                  <tbody>
                    {result.created.map((t) => (
                      <tr key={t.email}><td style={cell}>{t.name}</td><td style={cell}>{t.email}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.existing.length > 0 && (
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Already exist (left untouched): {result.existing.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
