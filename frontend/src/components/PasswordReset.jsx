import React, { useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { api } from '../api';

export default function PasswordReset() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The "forgot password" request flow now lives in a modal on the login page.
  // This route only handles the emailed reset link (which carries a token).
  if (!token) return <Navigate to="/login" replace />;

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setMessage('Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="modal auth-modal">
        <div className="auth-modal-head">
          <img src="/logo.png" alt="Tiju's Academy" className="auth-modal-logo" />
          <h3>Set New Password</h3>
          <p className="auth-modal-sub">Choose a new password for your account.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <form onSubmit={handleResetPassword} className="auth-modal-form">
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            required
            minLength={6}
            autoFocus
          />
          <input
            className="auth-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            aria-label="Confirm password"
            required
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </div>
    </div>
  );
}
