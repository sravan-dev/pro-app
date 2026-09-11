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
import Whiteboard from './Whiteboard';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const HOST_ROLES = ['tutor', 'advisor', 'manager', 'superadmin'];

// Webinar-style room backed by a LiveKit SFU. Scales to 50-100+ because every
// participant subscribes to the few presenters' streams from the server instead
// of meshing peer-to-peer. Hosts (tutors/admins) publish; students join
// view-only and can raise a hand to be promoted onto the stage by a host.
// getUserMedia is unavailable outside a secure context, so the mic can never
// be published over plain http — worth saying so rather than looking broken.
const insecureOrigin = () => typeof window !== 'undefined' && !window.isSecureContext;

// LiveKit reports device problems as a failure kind; turn that into something
// a student can act on.
const deviceFailureMessage = (failure) => {
  // LiveKit reports 'PermissionDenied' / 'NotFound' / 'DeviceInUse'; a raw
  // getUserMedia rejection arrives as 'NotAllowedError' and friends.
  const kind = String(failure || '');
  if (/PermissionDenied|NotAllowed|SecurityError/i.test(kind)) return 'Microphone/camera blocked. Allow access in the browser address bar, then press the mic button again.';
  if (/NotFound|DevicesNotFound|OverconstrainedError/i.test(kind)) return 'No microphone or camera found on this device.';
  if (/DeviceInUse|NotReadable|TrackStart/i.test(kind)) return 'Your microphone is in use by another app. Close it, then press the mic button again.';
  return 'Could not start your microphone or camera. Check browser permissions and press the mic button again.';
};

export default function LiveKitRoom({ session, onLeave }) {
  const [conn, setConn] = useState(null);
  const [error, setError] = useState('');
  const [deviceError, setDeviceError] = useState(() => (insecureOrigin()
    ? 'This page is not on a secure (https) connection, so the browser will not allow the microphone or camera.'
    : ''));

  // 'waiting' | 'denied' while a student sits in the waiting room.
  const [lobby, setLobby] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timer = null;
    setLobby(null);
    // Students without a host's go-ahead get { lobby } instead of a token; keep
    // asking until they are admitted. Only the first request knocks afresh.
    const fetchToken = (fresh) => {
      api.getLiveKitToken(session.session_id, fresh)
        .then((c) => {
          if (!mounted) return;
          if (c.lobby) {
            setLobby(c.lobby);
            if (c.lobby === 'waiting') timer = setTimeout(() => fetchToken(false), 3000);
            return;
          }
          setLobby(null);
          setConn(c);
        })
        .catch((e) => { if (mounted) setError(e.message || 'Failed to connect'); });
    };
    fetchToken(true);
    return () => { mounted = false; clearTimeout(timer); };
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
  if (lobby) {
    const waiting = lobby === 'waiting';
    return (
      <div className="video-room" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', gap: '0.75rem' }}>
        {waiting && <div className="spinner" />}
        <h3 style={{ color: '#fff', margin: 0 }}>{session.course_name || 'Live Session'}</h3>
        <p style={{ color: '#cbd5e1', margin: 0 }}>
          {waiting
            ? 'You are in the waiting room. The host will let you in shortly.'
            : 'The host did not admit you to this session.'}
        </p>
        <button className="btn btn-ghost" style={{ color: '#fff', marginTop: '0.5rem' }} onClick={handleLeave}>
          {waiting ? 'Leave waiting room' : '← Back'}
        </button>
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
      // The join-time publish is where a denied prompt or busy mic usually
      // fails; without this the student just sees a mic button that does
      // nothing.
      onMediaDeviceFailure={(failure) => setDeviceError(deviceFailureMessage(failure))}
      onDisconnected={handleLeave}
      data-lk-theme="default"
      style={{ height: '100%' }}
    >
      <Stage
        session={session}
        initialCanPublish={conn.can_publish}
        serverUrl={conn.url}
        onLeave={handleLeave}
        deviceError={deviceError}
        setDeviceError={setDeviceError}
      />
      <RoomAudioRenderer />
    </LKRoom>
  );
}

function Stage({ session, initialCanPublish, serverUrl, onLeave, deviceError, setDeviceError }) {
  const { user } = useAuth();
  const isHost = HOST_ROLES.includes(user?.role);
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, lastMicrophoneError } = useLocalParticipant();
  const room = useRoomContext();
  const stageBodyRef = useRef(null);

  // Reactive: a student promoted mid-session gets canPublish flipped by the
  // server, which updates localParticipant.permissions and re-renders this.
  const canPublish = localParticipant?.permissions?.canPublish ?? initialCanPublish;

  // The mic can fail to publish at join time (denied prompt, device busy) and
  // the toolbar toggle then looks inert. This retries and says what went wrong.
  const enableMic = async () => {
    setDeviceError?.('');
    try {
      await localParticipant?.setMicrophoneEnabled(true);
    } catch (e) {
      setDeviceError?.(deviceFailureMessage(e?.name || e?.message || ''));
    }
  };

  // A publish rejected by the browser leaves the error on the hook rather than
  // throwing where the toolbar can show it.
  useEffect(() => {
    if (lastMicrophoneError) setDeviceError?.(deviceFailureMessage(lastMicrophoneError.name || lastMicrophoneError.message || ''));
  }, [lastMicrophoneError]);

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

  // Waiting room: hosts see who is knocking and let them in or turn them away.
  const [waiting, setWaiting] = useState([]);
  const [lobbyBusy, setLobbyBusy] = useState(null); // user_id or 'all' being decided
  const [lobbyError, setLobbyError] = useState('');
  useEffect(() => {
    if (!isHost) return undefined;
    let mounted = true;
    const load = () => api.getLiveKitLobby(session.session_id)
      .then((rows) => { if (mounted) { setWaiting(rows); setLobbyError(''); } })
      .catch((e) => { if (mounted) setLobbyError(e.message || 'Could not load waiting room'); });
    load();
    const t = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, [isHost, session.session_id]);
  const decideLobby = async (userId, admit) => {
    setLobbyBusy(userId);
    try {
      await api.decideLiveKitLobby({ session_id: session.session_id, user_id: userId, admit });
      setWaiting((list) => (userId === 'all' ? [] : list.filter((w) => w.user_id !== userId)));
    } catch (e) { setLobbyError(e.message || 'Failed'); }
    finally { setLobbyBusy(null); }
  };

  // The whiteboard is opened for the whole room by a host, on its own topic so
  // the message still arrives at clients that have the board hidden.
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

  // Someone arriving after the board was opened missed the announcement, so a
  // host repeats it for them.
  useEffect(() => {
    if (!room || !isHost) return undefined;
    const onJoin = () => { if (wbOpen) toggleWhiteboard(true); };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => room.off(RoomEvent.ParticipantConnected, onJoin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isHost, wbOpen]);

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

  // Hosts can switch a participant's mic OFF through the server, but LiveKit
  // will not switch anyone's mic ON remotely — that stays the participant's
  // own choice — so an unmute is a request they accept.
  const [participantBusy, setParticipantBusy] = useState('');
  const [unmuteAsked, setUnmuteAsked] = useState(false);
  const { send: sendMicCtl } = useDataChannel('micctl', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      if (data.t === 'ask-unmute' && data.identity === localParticipant?.identity) setUnmuteAsked(true);
    } catch { /* ignore malformed */ }
  });

  // useParticipants does not re-render on mute/permission changes, so the
  // host's panel is nudged when one happens.
  const [, bumpRoster] = useState(0);
  useEffect(() => {
    if (!room) return undefined;
    const bump = () => bumpRoster((n) => n + 1);
    const events = [
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
      RoomEvent.ParticipantPermissionsChanged,
    ];
    events.forEach((e) => room.on(e, bump));
    return () => events.forEach((e) => room.off(e, bump));
  }, [room]);

  const muteParticipant = async (identity) => {
    setParticipantBusy(identity);
    try { await api.livekitMuteParticipant({ session_id: session.session_id, identity }); }
    catch (e) { setDeviceError?.(e?.message || 'Could not mute that participant.'); }
    finally { setParticipantBusy(''); }
  };

  const askUnmute = (identity) => {
    try { sendMicCtl(new TextEncoder().encode(JSON.stringify({ t: 'ask-unmute', identity })), { reliable: true }); }
    catch { /* not connected yet */ }
  };

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

  // Warn before the browser tab/window is closed or reloaded while in a class —
  // closing loses the live session (and any in-progress recording).
  useEffect(() => {
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Confirm before leaving the class. If a recording is still running, warn
  // that leaving discards it (they should press ⏹ to save it first).
  const confirmLeave = () => {
    if (recState === 'recording') {
      if (!window.confirm('You are still recording. Stop the recording (⏹) first to save it.\n\nLeave anyway and discard the recording?')) return;
    } else if (!window.confirm('Leave this session?')) {
      return;
    }
    onLeave?.();
  };

  const handCount = Object.keys(raisedHands).length;

  return (
    <div className="video-room" style={{ height: '100%' }}>
      <div className="video-room-header">
        <h3>{session.course_name || 'Live Session'}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            title={serverUrl}
            style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', background: '#F59E0B', color: '#111' }}
          >
            LiveKit · Webinar{serverUrl ? ` · ${serverUrl}` : ''}
          </span>
          <span className="participants-count">{participants.length} in room</span>
        </div>
      </div>

      <div className="video-body">
      <div ref={stageBodyRef} className="video-stage" style={{ flex: 1, minWidth: 0, minHeight: 0, padding: '8px', overflowY: 'auto' }}>
        {wbOpen && (
          <Whiteboard
            canDraw={canPublish}
            canClear={isHost}
            onClose={isHost ? () => toggleWhiteboard(false) : null}
          />
        )}

        {/* Screen share gets the prominent (but still capped) slot. */}
        {screenShares.map((t) => (
          <ParticipantTile
            key={`ss-${t.participant.identity}`}
            trackRef={t}
            style={{ width: '100%', maxHeight: '48vh', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}
          />
        ))}

        {/* Small, wrapping gallery — one c\apped tile per participant. */}
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

      {isHost && (
        <aside className="waiting-panel">
          <div className="waiting-panel-head">
            <span>Waiting room{waiting.length ? ` (${waiting.length})` : ''}</span>
            {waiting.length > 1 && (
              <button className="btn btn-sm btn-primary" disabled={lobbyBusy !== null} onClick={() => decideLobby('all', true)}>Admit all</button>
            )}
          </div>
          {lobbyError && <p className="waiting-panel-empty" style={{ color: '#fca5a5' }}>{lobbyError}</p>}
          {waiting.length === 0 ? (
            <p className="waiting-panel-empty">No one is waiting.</p>
          ) : waiting.map((w) => (
            <div key={w.user_id} className="waiting-row">
              <span className="waiting-name" title={w.name}>{w.name || `User ${w.user_id}`}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-primary" disabled={lobbyBusy !== null} onClick={() => decideLobby(w.user_id, true)}>Admit</button>
                <button className="btn btn-sm btn-ghost text-danger" disabled={lobbyBusy !== null} onClick={() => decideLobby(w.user_id, false)}>Deny</button>
              </div>
            </div>
          ))}
        </aside>
      )}
      </div>

      {isHost && participants.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '6px 12px', background: 'rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Mic & stage:</span>
          {participants
            .filter((p) => p.identity !== localParticipant?.identity)
            .map((p) => {
              const onStage = p.permissions?.canPublish !== false;
              return (
                <span key={p.identity} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#e5e7eb' }}>
                  <span>{p.name || p.identity}{p.isMicrophoneEnabled ? ' 🎤' : ' 🔇'}</span>
                  {p.isMicrophoneEnabled ? (
                    <button className="btn btn-sm btn-ghost" disabled={participantBusy === p.identity} onClick={() => muteParticipant(p.identity)}>Mute</button>
                  ) : (
                    <button className="btn btn-sm btn-ghost" disabled={!onStage} onClick={() => askUnmute(p.identity)} title={onStage ? 'Ask them to turn their mic on' : 'Put them on stage first'}>Ask to unmute</button>
                  )}
                  <button
                    className={`btn btn-sm ${onStage ? 'btn-ghost text-danger' : 'btn-primary'}`}
                    onClick={() => setStageAccess(p.identity, !onStage)}
                  >
                    {onStage ? 'Revoke mic' : 'Allow mic'}
                  </button>
                </span>
              );
            })}
        </div>
      )}

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
          /* Screen share for anyone on stage, students included: a promoted
             student needs to show work, not just talk. */
          <>
            <ControlBar
              variation="minimal"
              controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false, settings: false }}
            />
            {!isMicrophoneEnabled && (
              <button className="btn-control" onClick={enableMic} title="Turn on your microphone">🎤 Unmute</button>
            )}
          </>
        ) : (
          <button
            className={`btn-control ${handRaised ? 'active' : ''}`}
            onClick={() => broadcastHand(!handRaised)}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
          >
            ✋
          </button>
        )}
        {unmuteAsked && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, padding: '4px 10px',
            borderRadius: '999px', background: '#2563eb', color: '#fff' }}>
            The host asked you to unmute
            <button className="btn btn-sm btn-primary" onClick={async () => { await enableMic(); setUnmuteAsked(false); }}>Unmute</button>
            <button className="btn btn-sm btn-ghost" style={{ color: '#fff' }} onClick={() => setUnmuteAsked(false)}>Dismiss</button>
          </span>
        )}
        {deviceError && (
          <span
            onClick={() => setDeviceError?.('')}
            title="Dismiss"
            style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
              background: '#dc2626', color: '#fff', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {deviceError}
          </span>
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
          <button
            className={`btn-control ${wbOpen ? 'active' : ''}`}
            onClick={() => toggleWhiteboard(!wbOpen)}
            title={wbOpen ? 'Close whiteboard for everyone' : 'Open whiteboard for everyone'}
          >
            🖊
          </button>
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
        <button className="btn-control btn-leave" onClick={confirmLeave} title="Leave session">📞</button>
        <span
          title={`${participants.length} participant(s) in this session`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '14px', fontWeight: 600, padding: '6px 14px',
            borderRadius: '999px', background: '#374151', color: '#e5e7eb' }}
        >
          👥 {participants.length}
        </span>
      </div>
    </div>
  );
}
