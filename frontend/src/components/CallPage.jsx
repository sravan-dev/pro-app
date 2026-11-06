import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import SessionRoom from './SessionRoom';

export default function CallPage() {
  const { sessionId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  // The Tijus LMS Android app opens /call/<id>?autojoin=1 and exposes
  // window.TijusApp so hanging up closes the app's class screen.
  const [searchParams] = useSearchParams();
  // Only the app may skip the Join button; in a browser a crafted link must not
  // pull someone into a call (camera/mic) without their click.
  const inApp = typeof window !== 'undefined' && !!window.TijusApp;
  const autoJoin = inApp && searchParams.get('autojoin') === '1';
  const autoTried = useRef(false);
  const leave = () => {
    if (window.TijusApp && typeof window.TijusApp.leave === 'function') window.TijusApp.leave();
    else navigate('/');
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
  }, [user, authLoading, navigate]);

  const joinCall = async () => {
    setJoining(true);
    setError('');
    try {
      const result = await api.joinSession(parseInt(sessionId));
      setActiveSession({ session_id: parseInt(sessionId), ...result.session, ...result });
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user || !autoJoin || autoTried.current) return;
    autoTried.current = true;
    joinCall();
  }, [authLoading, user, autoJoin]);

  if (authLoading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  if (activeSession) {
    return (
      <div style={{ height: '100vh' }}>
        <SessionRoom session={activeSession} onLeave={leave} />
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Tiju's Academy" className="login-logo" />
          <h2 style={{ margin: '0.5rem 0' }}>Video Call</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            You've been invited to join a video call
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
          <p style={{ marginBottom: '0.5rem' }}>
            Logged in as <strong>{user?.name}</strong>
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={joinCall}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join Call'}
          </button>
        </div>
      </div>
    </div>
  );
}
