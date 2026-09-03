import React, { useState } from 'react';
import { api } from '../api';

export default function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await api.requestPasswordReset(email);
      setMessage(data.message);
      if (data.dev_token) setDevToken(data.dev_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal auth-modal">
        <div className="auth-modal-head">
          <img src="/logo.png" alt="Tiju's Academy" className="auth-modal-logo" />
          <h3>Reset Password</h3>
          <p className="auth-modal-sub">Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-modal-form">
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            required
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {devToken && (
          <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
            <strong>Dev Mode:</strong> Use this link to reset:<br />
            <a href={`/reset-password?token=${devToken}`}>/reset-password?token={devToken}</a>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Back to Login</button>
        </div>
      </div>
    </div>
  );
}
