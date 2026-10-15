import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  ParticipantTile,
  ControlBar,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useDataChannel,
  useRoomContext,
} from '@livekit/components-react';
import { Track, RoomEvent } from 'livekit-client';
import Whiteboard from './Whiteboard';
import '@livekit/components-styles';
import { api } from '../api';

// Public, account-less meeting page. Anyone with the link enters their name (and
// the 5-digit passcode, if the meeting has one), then joins a LiveKit room
// directly — no login, no user account. The passcode is verified server-side,
// which mints the LiveKit token.
export default function MeetingPage() {
  const { code } = useParams();
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [conn, setConn] = useState(null);
  const needsPasscode = !!info?.passcode_required;

  // Once joined, this tab remembers the name (and passcode) so a reload drops
  // straight back into the meeting. Leaving clears it.
  const savedKey = `meeting:${code}`;
  const saveJoin = (v) => {
    try {
      if (v) sessionStorage.setItem(savedKey, JSON.stringify(v));
      else sessionStorage.removeItem(savedKey);
    } catch { /* storage blocked: no auto-rejoin */ }
  };
  const autoJoinTried = useRef(false);

  useEffect(() => {
    let mounted = true;
    api.getMeetingInfo(code)
      .then((i) => { if (mounted) setInfo(i); })
      .catch((e) => { if (mounted) setInfoError(e.message || 'Meeting not found'); });
    return () => { mounted = false; };
  }, [code]);

  const joinWith = async (n, p) => {
    setJoining(true);
    setError('');
    try {
      const c = await api.getMeetingToken(code, p.trim(), n.trim() || 'Guest');
      saveJoin({ name: n, passcode: p });
      setConn(c);
    } catch (err) {
      saveJoin(null);
      setError(err.message || 'Could not join');
    } finally {
      setJoining(false);
    }
  };

  const join = (e) => {
    e.preventDefault();
    joinWith(name, passcode);
  };

  const leave = () => {
    saveJoin(null);
    setConn(null);
  };

  useEffect(() => {
    if (!info?.active || autoJoinTried.current) return;
    autoJoinTried.current = true;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(savedKey) || 'null'); } catch { /* none */ }
    if (!saved) return;
    setName(saved.name || '');
    setPasscode(saved.passcode || '');
    joinWith(saved.name || '', saved.passcode || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

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
          <MeetingStage title={conn.title} onLeave={leave} />
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
            {needsPasscode ? 'Enter your name and the 5-digit passcode to join' : 'Enter your name to join'}
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
            {needsPasscode && (
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
            )}
            <button className="btn btn-primary btn-block" type="submit" disabled={joining || (needsPasscode && passcode.length !== 5)}>
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

  // Meetings are symmetric, so anyone can open the whiteboard and everyone can
  // draw on it. Opening it is announced on its own topic, which reaches the
  // clients that currently have the board hidden.
  const [wbOpen, setWbOpen] = useState(false);
  const { send: sendWbCtl } = useDataChannel('wbctl', (msg) => {
    try { setWbOpen(!!JSON.parse(new TextDecoder().decode(msg.payload)).open); }
    catch { /* ignore malformed */ }
  });
  const toggleWhiteboard = (open) => {
    setWbOpen(open);
    try { sendWbCtl(new TextEncoder().encode(JSON.stringify({ open })), { reliable: true }); }
    catch { /* not connected yet */ }
  };

  // Someone arriving after the board was opened missed the announcement, so it
  // is repeated for them.
  const room = useRoomContext();
  useEffect(() => {
    if (!room) return undefined;
    const onJoin = () => { if (wbOpen) toggleWhiteboard(true); };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => room.off(RoomEvent.ParticipantConnected, onJoin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, wbOpen]);

  const cameraTiles = participants.map((p) => {
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
  });

  // Full screen on the shared screen's tile (toggles back out on a second press).
  const toggleFullscreen = (el) => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };

  return (
    <div className="video-room" style={{ height: '100%' }}>
      <div className="video-room-header">
        <h3>{title || 'Meeting'}</h3>
        <span className="participants-count">{participants.length} in room</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '8px', overflowY: 'auto' }}>
        {wbOpen && <Whiteboard onClose={() => toggleWhiteboard(false)} />}

        {screenShares.length > 0 ? (
          /* While someone shares, the share fills the stage (letterboxed, so a
             portrait phone screen shows whole) and the camera tiles dock to a
             narrow strip on the left. */
          <div className="share-layout">
            <div className="share-strip">{cameraTiles}</div>
            <div className="share-main">
              {screenShares.map((t) => (
                <div key={`ss-${t.participant.identity}`} className="share-tile">
                  <ParticipantTile trackRef={t} style={{ width: '100%', height: '100%' }} />
                  <button
                    type="button"
                    className="share-fullscreen"
                    onClick={(e) => toggleFullscreen(e.currentTarget.parentElement)}
                    title="Full screen"
                    aria-label="Full screen"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="meeting-gallery">{cameraTiles}</div>
        )}
      </div>

      <div className="video-controls">
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false, settings: false }}
        />
        <button
          className={`btn-control ${wbOpen ? 'active' : ''}`}
          onClick={() => toggleWhiteboard(!wbOpen)}
          title={wbOpen ? 'Close whiteboard for everyone' : 'Open whiteboard for everyone'}
        >
          🖊
        </button>
        <button className="btn-control btn-leave" onClick={onLeave} title="Leave meeting">📞</button>
      </div>
    </div>
  );
}
