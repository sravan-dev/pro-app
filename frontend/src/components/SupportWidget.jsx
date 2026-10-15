import React, { useState } from 'react';
import { api } from '../api';

// "Support" tab stuck to the right edge of the public pages. Opens a form whose
// subject + description are emailed to tech support, with the sender's email
// as reply-to so support can answer directly.
export default function SupportWidget({ defaultEmail = '' }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', description: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState(''); // reply address once sent

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const openForm = () => {
    setForm((f) => ({ ...f, email: f.email || defaultEmail }));
    setError('');
    setSentTo('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.sendSupportRequest(form);
      setSentTo(form.email.trim());
      setForm({ name: form.name, email: form.email, subject: '', description: '', website: '' });
    } catch (err) {
      setError(err.message || 'Could not send your message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="support-tab" onClick={openForm} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        Support
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="modal support-modal" role="dialog" aria-modal="true" aria-labelledby="support-title">
            <h3 id="support-title">Contact support</h3>
            {sentTo ? (
              <>
                <div className="alert alert-success">
                  Thanks — your message was sent. We&apos;ll reply to <strong>{sentTo}</strong>.
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Close</button>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <p className="support-intro">Having trouble signing in or using the app? Tell us and our tech team will get back to you by email.</p>
                {error && <div className="alert alert-error">{error}</div>}

                {/* Honeypot — hidden from people, filled in by bots. */}
                <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="register-hp" aria-hidden="true" />

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="support-name">Your name</label>
                    <input id="support-name" value={form.name} onChange={set('name')} maxLength={120} autoComplete="name" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="support-email">Your email *</label>
                    <input id="support-email" type="email" value={form.email} onChange={set('email')} maxLength={255} autoComplete="email" required />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="support-subject">Subject *</label>
                  <input id="support-subject" value={form.subject} onChange={set('subject')} maxLength={150} placeholder="e.g. Can't sign in" required autoFocus />
                </div>
                <div className="form-group">
                  <label htmlFor="support-description">Description *</label>
                  <textarea id="support-description" value={form.description} onChange={set('description')} maxLength={5000} rows={5} placeholder="Describe the problem and what you were trying to do" required />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
