import React, { useState } from 'react';
import { api } from '../api';

// /seed → Seed Sales Teams: creates the four sales teams with their team
// managers and advisors (backend/seeds/teams.js). The shared first-time
// password is typed here; everyone must change it at first login.
const STATUS = {
  created: 'created',
  existing: 'already exists',
  team_set: 'existing account, placed in team',
  other_team: 'already in another team',
};
const cell = { padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--color-border, #e5e7eb)', textAlign: 'left' };

export default function SeedTeams() {
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (dryRun) => {
    if (!dryRun && password.length < 8) { setError('Enter a first-time password of at least 8 characters.'); return; }
    if (!dryRun && !window.confirm('Create the sales teams, managers and advisors now?')) return;
    setBusy(true); setError('');
    try { setResult(await api.seedTeams(dryRun, dryRun ? '' : password)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const verb = (s) => (result?.dryRun && s === 'created' ? 'would be created' : result?.dryRun && s === 'team_set' ? 'existing account, would be placed in team' : STATUS[s]);

  return (
    <div className="portal-page" style={{ marginTop: '2rem' }}>
      <h2>Seed Sales Teams</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.75rem' }}>
        Creates Winners, Champions, Fighters and Warriors teams, each team manager (as the team&apos;s manager) and their
        advisors. Existing accounts keep their password and role; an advisor without a team is placed in theirs.
      </p>

      <div className="form-group" style={{ maxWidth: 320, marginTop: '1rem' }}>
        <label htmlFor="seed-team-pw">First-time password for new accounts</label>
        <input id="seed-team-pw" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0 1.25rem' }}>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(true)}>Preview</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}>Create teams &amp; accounts</button>
      </div>

      {busy && <p>Working…</p>}
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {result && !busy && result.teams.map((t) => (
        <div key={t.name} style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.4rem' }}>
            {t.name} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>({t.team === 'created' ? (result.dryRun ? 'team would be created' : 'team created') : 'team exists'})</span>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[t.manager, ...t.advisors].map((p, i) => (
                <tr key={p.email}>
                  <td style={cell}>{p.name}{i === 0 ? ' (TM)' : ''}</td>
                  <td style={cell}>{p.email}</td>
                  <td style={cell}>{p.role}</td>
                  <td style={{ ...cell, color: p.status === 'other_team' ? 'var(--color-danger)' : undefined }}>
                    {verb(p.status)}{p.status === 'other_team' ? ` (${p.team})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
