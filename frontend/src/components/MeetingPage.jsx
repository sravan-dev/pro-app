import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  ParticipantTile,
  ControlBar,
  useTracks,
  useParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '../api';

// Public, account-less meeting page. Anyone with the link enters their name and
// the 5-digit passcode, then joins a LiveKit room directly — no login, no user
// account. The passcode is verified server-side, which mints the LiveKit token.
export default function MeetingPage() {
  const { code } = useParams();
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [conn, setConn] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getMeetingInfo(code)
      .then((i) => { if (mounted) setInfo(i); })
      .catch((e) => { if (mounted) setInfoError(e.message || 'Meeting not found'); });
    return () => { mounted = false; };
  }, [code]);

  const join = async (e) => {
    e.preventDefault();
    setJoining(true);
    setError('');
    try {
      const c = await api.getMeetingToken(code, passcode.trim(), name.trim() || 'Guest');
      setConn(c);
    } catch (err) {
      setError(err.message || 'Could not join');
    } finally {
      setJoining(false);
    }
  };

  if (conn) {
    return (
      <div style={{ height: '100vh' }}>
        <LKRoom
          serverUrl={conn.url}
          token={conn.token}
          connect
          video
          audio
          onDisconnected={() => setConn(null)}
          data-lk-theme="default"
          style={{ height: '100%' }}
        >
          <MeetingStage title={conn.title} onLeave={() => setConn(null)} />
          <RoomAudioRenderer />
        </LKRoom>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Tiju's Academy" className="login-logo" />
          <h2 style={{ margin: '0.5rem 0' }}>{info?.title || 'Join Meeting'}</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            Enter your name and the 5-digit passcode to join
          </p>
        </div>

        {infoError && <div className="alert alert-error">{infoError}</div>}
        {info && !info.active && <div className="alert alert-error">This meeting has ended.</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {info?.active && (
          <form onSubmit={join} style={{ padding: '1rem 0' }}>
            <div className="form-group">
              <label>Your Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" autoFocus />
            </div>
            <div className="form-group">
              <label>Passcode *</label>
              <input
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                inputMode="numeric"
                placeholder="5-digit code"
                required
                style={{ letterSpacing: '0.3em', fontSize: '1.1rem' }}
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={joining || passcode.length !== 5}>
              {joining ? 'Joining…' : 'Join Meeting'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Simple symmetric stage: every participant can publish camera/mic/screen.
function MeetingStage({ title, onLeave }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const trackRefs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screenShares = trackRefs.filter((t) => t.source === Track.Source.ScreenShare);
  const cameraByIdentity = {};
  trackRefs.forEach((t) => {
    if (t.source === Track.Source.Camera) cameraByIdentity[t.participant.identity] = t;
  });

  return (
    <div className="video-room" style={{ height: '100%' }}>
      <div className="video-room-header">
        <h3>{title || 'Meeting'}</h3>
        <span className="participants-count">{participants.length} in room</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '8px', overflowY: 'auto' }}>
        {screenShares.map((t) => (
          <ParticipantTile
            key={`ss-${t.participant.identity}`}
            trackRef={t}
            style={{ width: '100%', maxHeight: '48vh', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}
          />
        ))}
        <div className="meeting-gallery">
          {participants.map((p) => {
            const ref = cameraByIdentity[p.identity] || { participant: p, source: Track.Source.Camera };
            const isMe = p.identity === localParticipant?.identity;
            return (
              <div key={p.identity} className="meeting-tile">
                <ParticipantTile
                  trackRef={ref}
                  style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', outline: isMe ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)' }}
                />
                {isMe && (
                  <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(99,102,241,0.9)', borderRadius: 4, padding: '1px 5px' }}>You</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="video-controls">
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false, settings: false }}
        />
        <button className="btn-control btn-leave" onClick={onLeave} title="Leave meeting">📞</button>
      </div>
    </div>
  );
}
