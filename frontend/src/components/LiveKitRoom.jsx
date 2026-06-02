import React, { useState, useEffect } from 'react';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  ParticipantTile,
  ControlBar,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useDataChannel,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const HOST_ROLES = ['tutor', 'advisor', 'manager', 'superadmin'];

// Webinar-style room backed by a LiveKit SFU. Scales to 50-100+ because every
// participant subscribes to the few presenters' streams from the server instead
// of meshing peer-to-peer. Hosts (tutors/admins) publish; students join
// view-only and can raise a hand to be promoted onto the stage by a host.
export default function LiveKitRoom({ session, onLeave }) {
  const [conn, setConn] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.getLiveKitToken(session.session_id)
      .then((c) => { if (mounted) setConn(c); })
      .catch((e) => { if (mounted) setError(e.message || 'Failed to connect'); });
    return () => { mounted = false; };
  }, [session]);

  const handleLeave = async () => {
    try { await api.leaveSession(session.session_id); } catch {}
    onLeave?.();
  };

  if (error) {
    return (
      <div className="video-room" style={{ padding: '2rem' }}>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-ghost" onClick={onLeave} style={{ marginTop: '1rem' }}>← Back</button>
      </div>
    );
  }
  if (!conn) {
    return (
      <div className="video-room" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <p style={{ color: '#cbd5e1' }}>Connecting to session…</p>
      </div>
    );
  }

  return (
    <LKRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      video={conn.can_publish}
      audio={conn.can_publish}
      onDisconnected={handleLeave}
      data-lk-theme="default"
      style={{ height: '100%' }}
    >
      <Stage session={session} initialCanPublish={conn.can_publish} onLeave={handleLeave} />
      <RoomAudioRenderer />
    </LKRoom>
  );
}

function Stage({ session, initialCanPublish, onLeave }) {
  const { user } = useAuth();
  const isHost = HOST_ROLES.includes(user?.role);
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // Reactive: a student promoted mid-session gets canPublish flipped by the
  // server, which updates localParticipant.permissions and re-renders this.
  const canPublish = localParticipant?.permissions?.canPublish ?? initialCanPublish;

  // Published camera + screen-share tracks for everyone in the room (no
  // canPublish filter — the host wants to see every participant). A camera tile
  // is shown per participant: live video if they publish, otherwise a name
  // placeholder, so the tutor always sees who's present.
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

  // Raise-hand signalling over a data channel; hosts collect raised hands.
  const [raisedHands, setRaisedHands] = useState({});
  const [handRaised, setHandRaised] = useState(false);
  const { send } = useDataChannel('hand', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      setRaisedHands((prev) => {
        const next = { ...prev };
        if (data.raised) next[data.identity] = data.name;
        else delete next[data.identity];
        return next;
      });
    } catch { /* ignore malformed */ }
  });

  const broadcastHand = (raised) => {
    setHandRaised(raised);
    try {
      send(
        new TextEncoder().encode(JSON.stringify({ identity: localParticipant?.identity, name: user?.name, raised })),
        { reliable: true },
      );
    } catch { /* not connected yet */ }
  };

  // Once a student is promoted they no longer need a raised hand.
  useEffect(() => {
    if (canPublish && handRaised) broadcastHand(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish]);

  const setStageAccess = async (identity, can_publish) => {
    try {
      await api.livekitUpdatePermission({ session_id: session.session_id, identity, can_publish });
      if (can_publish) {
        setRaisedHands((prev) => { const n = { ...prev }; delete n[identity]; return n; });
      }
    } catch { /* surfaced via console */ }
  };

  const handCount = Object.keys(raisedHands).length;

  return (
    <div className="video-room" style={{ height: '100%' }}>
      <div className="video-room-header">
        <h3>{session.course_name || 'Live Session'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', background: '#F59E0B', color: '#111' }}>
            LiveKit · Webinar
          </span>
          <span className="participants-count">{participants.length} in room</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '8px', overflowY: 'auto' }}>
        {/* Screen share gets the prominent (but still capped) slot. */}
        {screenShares.map((t) => (
          <ParticipantTile
            key={`ss-${t.participant.identity}`}
            trackRef={t}
            style={{ width: '100%', maxHeight: '48vh', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}
          />
        ))}

        {/* Small, wrapping gallery — one capped tile per participant. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', alignContent: 'flex-start' }}>
          {participants.map((p) => {
            const ref = cameraByIdentity[p.identity] || { participant: p, source: Track.Source.Camera };
            const isMe = p.identity === localParticipant?.identity;
            return (
              <div key={p.identity} style={{ width: 'clamp(150px, 22vw, 260px)', aspectRatio: '16 / 9', position: 'relative' }}>
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

      {isHost && handCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(245,158,11,0.12)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24' }}>✋ Raised hands ({handCount}):</span>
          {Object.entries(raisedHands).map(([identity, name]) => (
            <span key={identity} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#e5e7eb' }}>
              {name}
              <button className="btn btn-sm btn-primary" onClick={() => setStageAccess(identity, true)}>Promote</button>
            </span>
          ))}
        </div>
      )}

      <div className="video-controls">
        {canPublish ? (
          <ControlBar
            variation="minimal"
            controls={{ microphone: true, camera: true, screenShare: isHost, chat: false, leave: false, settings: false }}
          />
        ) : (
          <button
            className={`btn-control ${handRaised ? 'active' : ''}`}
            onClick={() => broadcastHand(!handRaised)}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
          >
            ✋
          </button>
        )}
        <button className="btn-control btn-leave" onClick={onLeave} title="Leave session">📞</button>
      </div>
    </div>
  );
}
