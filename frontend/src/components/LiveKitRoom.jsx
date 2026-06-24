import React, { useState, useEffect, useRef } from 'react';
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
  const room = useRoomContext();
  const stageBodyRef = useRef(null);

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

  // ---- Session recording (host) ----------------------------------------
  // Records the MEETING AREA ONLY (no screen picker): the participant video
  // tiles are composited onto a canvas and the room audio (host mic + every
  // remote participant) is mixed in, then recorded to .webm and uploaded to
  // the server's recordings folder via /api/upload-recording on stop.
  const [recState, setRecState] = useState('idle'); // idle | recording | uploading
  const [recNotice, setRecNotice] = useState(''); // surfaced recording success/failure
  const recRef = useRef(null);
  const recCleanupRef = useRef(null);

  const stopRecording = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  };

  const startRecording = async () => {
    try {
      const container = stageBodyRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 720;
      const cctx = canvas.getContext('2d');

      // Composite the rendered <video> tiles into a grid every frame.
      let raf = 0;
      const draw = () => {
        const vids = container
          ? Array.from(container.querySelectorAll('video')).filter((v) => v.videoWidth > 0)
          : [];
        const n = Math.max(vids.length, 1);
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const cw = canvas.width / cols, ch = canvas.height / rows;
        cctx.fillStyle = '#0f172a';
        cctx.fillRect(0, 0, canvas.width, canvas.height);
        vids.forEach((v, i) => {
          const gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch;
          const vr = v.videoWidth / v.videoHeight, cr = cw / ch;
          let dw = cw, dh = ch, dx = gx, dy = gy;
          if (vr > cr) { dh = cw / vr; dy = gy + (ch - dh) / 2; } else { dw = ch * vr; dx = gx + (cw - dw) / 2; }
          try { cctx.drawImage(v, dx, dy, dw, dh); } catch { /* not ready */ }
        });
        raf = requestAnimationFrame(draw);
      };
      draw();

      // Mix all audio: host mic + every remote participant (and any that join).
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = actx.createMediaStreamDestination();
      const seen = new Set();
      const connect = (mst) => {
        if (!mst || seen.has(mst.id)) return;
        seen.add(mst.id);
        try { actx.createMediaStreamSource(new MediaStream([mst])).connect(dest); } catch { /* ignore */ }
      };
      let micStream = null;
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); connect(micStream.getAudioTracks()[0]); } catch { /* mic optional */ }
      const connectRemotes = () => {
        room?.remoteParticipants?.forEach((p) => {
          p.trackPublications.forEach((pub) => { if (pub.kind === 'audio' && pub.audioTrack) connect(pub.audioTrack.mediaStreamTrack); });
        });
      };
      connectRemotes();
      const onSub = () => connectRemotes();
      room?.on(RoomEvent.TrackSubscribed, onSub);

      const stream = new MediaStream([
        canvas.captureStream(30).getVideoTracks()[0],
        ...dest.stream.getAudioTracks(),
      ]);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((m) => window.MediaRecorder?.isTypeSupported(m)) || 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        recCleanupRef.current?.();
        const blob = new Blob(chunks, { type: 'video/webm' });
        if (!blob.size) {
          // Nothing was captured — don't create an empty, unplayable record.
          setRecState('idle');
          setRecNotice('Recording was empty and was not saved. Make sure at least one camera is on before recording.');
          return;
        }
        setRecState('uploading');
        try {
          await api.uploadRecording(session.session_id, blob);
          setRecNotice('Recording saved.');
        } catch (e) {
          setRecNotice(`Recording failed to upload${e?.message ? `: ${e.message}` : ''}. It was not saved.`);
        }
        setRecState('idle');
      };

      recCleanupRef.current = () => {
        cancelAnimationFrame(raf);
        room?.off(RoomEvent.TrackSubscribed, onSub);
        micStream?.getTracks().forEach((t) => t.stop());
        actx.close().catch(() => {});
      };

      recRef.current = rec;
      rec.start(1000);
      setRecState('recording');
    } catch { setRecState('idle'); }
  };

  // Stop & flush if the host leaves mid-recording.
  useEffect(() => () => { try { stopRecording(); } catch {} }, []);

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

      <div ref={stageBodyRef} style={{ flex: 1, minHeight: 0, padding: '8px', overflowY: 'auto' }}>
        {/* Screen share gets the prominent (but still capped) slot. */}
        {screenShares.map((t) => (
          <ParticipantTile
            key={`ss-${t.participant.identity}`}
            trackRef={t}
            style={{ width: '100%', maxHeight: '48vh', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}
          />
        ))}

        {/* Small, wrapping gallery — one capped tile per participant. */}
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
        {recNotice && (
          <span
            onClick={() => setRecNotice('')}
            title="Dismiss"
            style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
              background: recNotice === 'Recording saved.' ? '#16a34a' : '#dc2626', color: '#fff', maxWidth: '340px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {recNotice}
          </span>
        )}
        {isHost && (
          recState === 'uploading' ? (
            <button className="btn-control" disabled title="Saving recording…">⏳</button>
          ) : (
            <button
              className={`btn-control ${recState === 'recording' ? 'active' : ''}`}
              onClick={recState === 'recording' ? stopRecording : startRecording}
              title={recState === 'recording' ? 'Stop & save recording' : 'Record session'}
            >
              {recState === 'recording' ? '⏹' : '⏺'}
            </button>
          )
        )}
        <button className="btn-control btn-leave" onClick={onLeave} title="Leave session">📞</button>
      </div>
    </div>
  );
}
