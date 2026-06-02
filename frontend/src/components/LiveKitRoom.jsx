import React, { useState, useEffect } from 'react';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  GridLayout,
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

  // Only presenters (canPublish) occupy the stage; view-only students don't.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => t.participant?.permissions?.canPublish);

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

      <div style={{ flex: 1, minHeight: 0, padding: '0.5rem', display: 'flex' }}>
        {tracks.length === 0 ? (
          <div style={{ margin: 'auto', color: '#9ca3af', textAlign: 'center' }}>
            {isHost ? 'Turn on your camera or share your screen to start the session.' : 'Waiting for the host to start the session…'}
          </div>
        ) : (
          <GridLayout tracks={tracks} style={{ height: '100%', width: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        )}
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
