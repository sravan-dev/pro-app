import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    <div className="signin-page">
      <header className="signin-top">
        <span className="signin-appname">Tijus <strong>SmS</strong></span>
        <BrandDots />
      </header>

      <main className="signin-main">
        <div className="signin-art">
          <SignInIllustration />
        </div>

        <div className="signin-card">
          <img src="/logo.png" alt="Tiju's Academy" className="signin-logo" />
          <h1 className="signin-title" lang="de">Hallo!</h1>
          <p className="signin-sub">Please enter your email and password</p>

          <form onSubmit={handleSubmit} className="signin-form">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="signin-field">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="username"
                required
                autoFocus
              />
              <span className="signin-field-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
                </svg>
              </span>
            </div>

            <div className="signin-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="signin-field-icon signin-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>

            <div className="signin-row">
              <label className="signin-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
              <button type="button" className="signin-link" onClick={() => setShowForgot(true)}>Forgot Password?</button>
            </div>

            <button type="submit" className="signin-submit" disabled={loading}>
              <span>{loading ? 'Signing in…' : 'Login'}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          <div className="signin-card-foot">
            <p>Want to teach with us? <Link to="/register">Apply as a tutor</Link></p>
            <p>Don&apos;t have an account? Contact your administrator</p>
          </div>
        </div>
      </main>

      <footer className="signin-footer">
        <div className="signin-tagline">
          <BrandDots />
          <span>Partner for your future of OET / IELTS coaching</span>
        </div>
        <div className="signin-legal">
          © {new Date().getFullYear()} Tiju&apos;s Academy · <a href="https://tijusacademy.com" target="_blank" rel="noreferrer">tijusacademy.com</a>
        </div>
      </footer>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}

/* The brand's four growing dots — yellow, blue, green, red ("loading to success"). */
function BrandDots() {
  return (
    <span className="signin-dots" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

/* Decorative classroom scene: a tutor at a whiteboard with a growing chart, a
   laptop running a live class, and a stack of books with a graduation cap. */
function SignInIllustration() {
  const lav = '#8F8BD8';
  const lavLight = '#B9B6F0';
  const lavPale = '#E4E2FA';
  const ink = '#1B1935';
  const skin = '#F2B89A';
  return (
    <svg className="signin-illustration" viewBox="0 0 600 460" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft backdrop shapes */}
      <circle cx="300" cy="230" r="205" fill="#38357F" />
      <path d="M470 70c0-12 10-22 22-22 3 0 6 1 8 2 4-9 13-15 24-15 15 0 27 12 27 27v2c9 1 16 9 16 18h-86c-6 0-11-5-11-12z" fill="#45428F" />
      <path d="M40 150c0-10 8-18 18-18 2 0 5 0 7 1 3-8 11-13 20-13 12 0 22 10 22 22v2c8 1 13 7 13 15H49c-5 0-9-4-9-9z" fill="#45428F" />

      {/* ground */}
      <ellipse cx="300" cy="418" rx="270" ry="16" fill="#26235F" />

      {/* whiteboard with a growing chart */}
      <g>
        <path d="M95 222l-14 190M265 222l14 190" stroke={lav} strokeWidth="6" strokeLinecap="round" />
        <rect x="60" y="66" width="240" height="160" rx="10" fill="#FFFFFF" />
        <rect x="60" y="66" width="240" height="160" rx="10" stroke={lavLight} strokeWidth="4" />
        <rect x="84" y="88" width="96" height="9" rx="4.5" fill={lavLight} />
        <rect x="84" y="104" width="62" height="7" rx="3.5" fill={lavPale} />
        <line x1="84" y1="204" x2="276" y2="204" stroke={lavPale} strokeWidth="3" />
        <rect x="100" y="172" width="26" height="32" rx="5" fill="#F3D011" />
        <rect x="140" y="156" width="26" height="48" rx="5" fill="#01A1E4" />
        <rect x="180" y="138" width="26" height="66" rx="5" fill="#77DD77" />
        <rect x="220" y="116" width="26" height="88" rx="5" fill="#FF0D00" />
        <path d="M108 160l40-18 40-16 42-22" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
      </g>

      {/* tutor pointing at the board */}
      <g>
        <rect x="306" y="236" width="14" height="164" rx="7" fill={ink} />
        <rect x="324" y="236" width="14" height="164" rx="7" fill={ink} />
        <path d="M300 402h24v6a4 4 0 0 1-4 4h-24a4 4 0 0 1 4-10z" fill={ink} />
        <path d="M322 402h24a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-24z" fill={ink} />
        <rect x="298" y="168" width="48" height="80" rx="18" fill="#01A1E4" />
        <path d="M306 186l-34-30" stroke="#01A1E4" strokeWidth="13" strokeLinecap="round" />
        <circle cx="268" cy="152" r="7" fill={skin} />
        <path d="M340 188l8 52" stroke="#01A1E4" strokeWidth="13" strokeLinecap="round" />
        <circle cx="349" cy="246" r="7" fill={skin} />
        <rect x="314" y="152" width="16" height="20" rx="6" fill={skin} />
        <circle cx="322" cy="140" r="20" fill={skin} />
        <path d="M302 140c0-14 9-24 22-24 11 0 19 7 20 18-7 1-15-2-20-8-4 8-12 13-22 14z" fill={ink} />
      </g>

      {/* laptop running a live class */}
      <g>
        <rect x="360" y="246" width="200" height="132" rx="10" fill={ink} />
        <rect x="370" y="256" width="180" height="112" rx="6" fill={lavPale} />
        {[[376, 262, lav], [462, 262, lavLight], [376, 314, lavLight], [462, 314, lav]].map(([x, y, c]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="82" height="48" rx="5" fill="#FFFFFF" />
            <circle cx={x + 41} cy={y + 20} r="9" fill={c} />
            <path d={`M${x + 25} ${y + 46}c0-10 7-16 16-16s16 6 16 16`} fill={c} />
          </g>
        ))}
        <rect x="498" y="232" width="52" height="20" rx="10" fill="#FF0D00" />
        <circle cx="510" cy="242" r="4" fill="#FFFFFF" />
        <rect x="518" y="239" width="24" height="6" rx="3" fill="#FFFFFF" />
        <path d="M344 378h232l14 18H330z" fill={lavLight} />
        <rect x="430" y="380" width="60" height="5" rx="2.5" fill={lav} />
      </g>

      {/* chat bubble */}
      <g>
        <path d="M402 168h86a14 14 0 0 1 14 14v26a14 14 0 0 1-14 14h-52l-18 16v-16h-16a14 14 0 0 1-14-14v-26a14 14 0 0 1 14-14z" fill="#FFFFFF" />
        <circle cx="422" cy="195" r="6" fill="#F3D011" />
        <circle cx="445" cy="195" r="6" fill="#01A1E4" />
        <circle cx="468" cy="195" r="6" fill="#77DD77" />
      </g>

      {/* stack of books with a graduation cap */}
      <g>
        <rect x="96" y="380" width="150" height="30" rx="6" fill={lav} />
        <rect x="104" y="388" width="134" height="4" rx="2" fill={lavPale} />
        <rect x="110" y="350" width="130" height="30" rx="6" fill={lavLight} />
        <rect x="118" y="358" width="114" height="4" rx="2" fill="#FFFFFF" />
        <rect x="102" y="322" width="138" height="28" rx="6" fill="#FFFFFF" />
        <rect x="110" y="330" width="122" height="4" rx="2" fill={lavPale} />
        <path d="M171 282l52 20-52 20-52-20z" fill={ink} />
        <path d="M143 312v14c0 6 13 11 28 11s28-5 28-11v-14l-28 10z" fill={ink} />
        <path d="M223 302v26" stroke="#F3D011" strokeWidth="4" strokeLinecap="round" />
        <circle cx="223" cy="331" r="5" fill="#F3D011" />
      </g>

      {/* paper plane + sparkles */}
      <path d="M470 110l70-26-26 66-16-24z" fill="#FFFFFF" />
      <path d="M498 126l42-42" stroke={lavLight} strokeWidth="3" />
      <g fill="#FFFFFF">
        <path d="M340 60l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
        <path d="M560 300l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" opacity="0.8" />
        <path d="M40 300l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" opacity="0.6" />
      </g>
    </svg>
  );
}
