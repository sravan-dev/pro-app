import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ForgotPasswordModal from './ForgotPasswordModal';

const REMEMBER_KEY = 'login:remember-email';

export default function Login() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => {
    try { return !!localStorage.getItem(REMEMBER_KEY); } catch { return false; }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* ignore storage errors */ }
      const portalRoutes = {
        student: '/student',
        tutor: '/tutor',
        advisor: '/advisor',
        manager: '/manager',
        superadmin: '/admin',
      };
      navigate(portalRoutes[user.role] || '/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="auth-shell">
        {/* Left: form */}
        <div className="auth-left">
          <div className="auth-brand">
            <img src="/logo.png" alt="Tiju's Academy" />
          </div>

          <h1 className="auth-heading">Holla,<br />Welcome Back</h1>
          <p className="auth-sub">Hey, welcome back to your special place</p>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="alert alert-error">{error}</div>}

            <input
              id="email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              aria-label="Email address"
              required
              autoFocus
            />

            <div style={{ position: 'relative' }}>
              <input
                id="password"
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                required
                style={{ paddingRight: '4rem', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="auth-show-pw"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="auth-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <button type="button" className="auth-forgot" onClick={() => setShowForgot(true)}>Forgot Password?</button>
            </div>

            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-footer">
            Don&apos;t have an account? <span className="auth-footer-muted">Contact your administrator</span>
          </p>
        </div>

        {/* Right: illustration */}
        <div className="auth-right">
          <AuthIllustration />
        </div>
      </div>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}

/* Decorative "secure login" illustration — phone with fingerprint, lock,
   clouds and a confirmation bubble, rendered on the brand gradient panel. */
function AuthIllustration() {
  return (
    <svg className="auth-illustration" viewBox="0 0 460 460" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* clouds */}
      <g fill="#FFFFFF" opacity="0.92">
        <path d="M60 120c0-15 12-27 27-27 4 0 8 1 11 3 5-12 17-20 30-20 18 0 33 14 33 32 0 1 0 3-1 4 12 2 21 12 21 25H60c-9 0-16-7-16-16 0-9 7-15 16-16z" opacity="0.85" />
        <path d="M300 70c0-12 10-22 22-22 3 0 6 1 9 2 4-9 13-16 24-16 15 0 27 12 27 27v3c10 1 17 10 17 20H300c-7 0-13-6-13-13s6-12 13-13z" opacity="0.7" />
        <path d="M330 360c0-11 9-20 20-20 3 0 5 0 8 1 3-8 12-14 21-14 14 0 25 11 25 25v2c9 1 15 8 15 18h-89c-7 0-12-5-12-12s5-11 12-11z" opacity="0.8" />
      </g>

      {/* lock */}
      <g transform="translate(330 200)">
        <rect x="0" y="34" width="84" height="70" rx="14" fill="#FFFFFF" />
        <path d="M16 34v-14a26 26 0 0 1 52 0v14" stroke="#FFFFFF" strokeWidth="11" fill="none" strokeLinecap="round" />
        <circle cx="42" cy="62" r="9" fill="var(--color-primary)" />
        <rect x="38" y="62" width="8" height="22" rx="4" fill="var(--color-primary)" />
      </g>

      {/* phone */}
      <g transform="translate(120 110)">
        <rect x="0" y="0" width="190" height="290" rx="32" fill="#1F2937" />
        <rect x="12" y="12" width="166" height="266" rx="24" fill="url(#screen)" />
        <rect x="74" y="24" width="42" height="7" rx="3.5" fill="#1F2937" opacity="0.6" />
        {/* fingerprint */}
        <g transform="translate(60 95)" stroke="#FFFFFF" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.95">
          <path d="M35 8a35 35 0 0 1 35 35v18" />
          <path d="M35 8A35 35 0 0 0 0 43v18" />
          <path d="M18 43a17 17 0 0 1 34 0v22" />
          <path d="M35 43v30" />
          <path d="M52 50v18" />
          <path d="M18 55v14" />
        </g>
        <rect x="40" y="210" width="110" height="10" rx="5" fill="#FFFFFF" opacity="0.55" />
        <rect x="40" y="210" width="64" height="10" rx="5" fill="#FFFFFF" />
      </g>

      {/* confirmation bubble */}
      <g transform="translate(70 150)">
        <path d="M14 0h60a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H40l-18 18v-18h-8A14 14 0 0 1 0 44V14A14 14 0 0 1 14 0z" fill="#FFFFFF" />
        <path d="M30 30l9 9 18-19" stroke="var(--color-primary)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <defs>
        <linearGradient id="screen" x1="12" y1="12" x2="178" y2="278" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-primary-light)" />
          <stop offset="1" stopColor="var(--color-primary-dark)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
