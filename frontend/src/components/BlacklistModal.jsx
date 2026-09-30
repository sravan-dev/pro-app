import React, { useState } from 'react';
import { api } from '../api';

// Blacklist popup — temporarily blocks a user from signing in. A reason is
// required and is kept on the account so the next admin knows why.
// Removing them from the blacklist makes the account active again.
export default function BlacklistModal({ user, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Please enter a reason'); return; }
    setBusy(true);
    setError('');
    try {
      await api.blacklistUser(user.id, reason.trim());
      onDone(`${user.name} blacklisted`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={submit}>
        <h3>Blacklist {user.name}</h3>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {user.name} won&apos;t be able to sign in, and is signed out straight away, until you remove them from the blacklist.
        </p>
        <div className="form-group">
          <label htmlFor="blacklist-reason">Reason for blacklisting *</label>
          <textarea
            id="blacklist-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Missed three scheduled sessions without notice"
            maxLength={2000}
            required
            autoFocus
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={busy || !reason.trim()}>{busy ? 'Blacklisting…' : 'Blacklist'}</button>
        </div>
      </form>
    </div>
  );
}
