import React, { useState, useEffect, useRef } from 'react';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  ParticipantTile,
  ControlBar,
  TrackToggle,
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
import { Icon, CallTimer, RoomTitle, Avatar, formatRoomDate } from './roomUi';

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

// Elapsed/remaining time as mm:ss (h:mm:ss once past an hour).
const formatClock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Whether the session has a usable schedule window (ad-hoc rooms don't).
const hasSchedule = (startTime, endTime) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

// How far the class is through its scheduled window. start_time/end_time are
// plain 'YYYY-MM-DDTHH:MM' strings in the academy's local zone — the same way
// the rest of the app reads them — so `new Date(...)` parses them as local.
// Turns amber in the last five minutes and red once the class runs over, so a
// tutor mid-explanation can see the clock without checking the schedule.
function ClassProgress({ startTime, endTime }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ad-hoc rooms carry no schedule; they just don't get a timer.
  if (!hasSchedule(startTime, endTime)) return null;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  const total = end - start;
  const elapsed = now - start;
  const remaining = total - elapsed;

  const state = elapsed < 0 ? 'early'
    : remaining < 0 ? 'over'
    : remaining <= 5 * 60 * 1000 ? 'ending'
    : 'running';

  const label = state === 'early' ? `Starts in ${formatClock(-elapsed)}`
    : state === 'over' ? `Over by ${formatClock(-remaining)}`
    : `${formatClock(elapsed)} / ${formatClock(total)}`;

  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tooltip = `Scheduled ${clock(start)} – ${clock(end)}`
    + (state === 'running' || state === 'ending' ? ` · ${formatClock(remaining)} left` : '');

  return (
    <div className={`class-progress ${state}`} title={tooltip}>
      <span className="class-progress-bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="class-progress-label">{label}</span>
    </div>
  );
}

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

  const title = session.course_name || 'Live Session';
  if (error) {
    return (
      <div className="video-room vr vr-state">
        <div className="vr-card vr-state-card">
          <RoomTitle kicker="Live class" title={title} />
          <div className="vr-alert vr-alert-error">{error}</div>
          <button className="btn btn-ghost" onClick={onLeave}>← Back</button>
        </div>
      </div>
    );
  }
  if (lobby) {
    const waiting = lobby === 'waiting';
    return (
      <div className="video-room vr vr-state">
        <div className="vr-card vr-state-card">
          {waiting && <div className="spinner" />}
          <RoomTitle kicker={waiting ? 'Waiting room' : 'Not admitted'} title={title} />
          <p className="vr-state-text">
            {waiting
              ? 'You are in the waiting room. The host will let you in shortly.'
              : 'The host did not admit you to this session.'}
          </p>
          <button className="btn btn-ghost" onClick={handleLeave}>
            {waiting ? 'Leave waiting room' : '← Back'}
          </button>
        </div>
      </div>
    );
  }
  if (!conn) {
    return (
      <div className="video-room vr vr-state">
        <div className="vr-card vr-state-card">
          <div className="spinner" />
          <RoomTitle kicker="Live class" title={title} />
          <p className="vr-state-text">Connecting to session…</p>
        </div>
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
  const stageRef = useRef(null);

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
  // A presenter sharing the screen this room is on sees the share inside the
  // share, endlessly. Their own share is covered by default (still rendered,
  // so the recording keeps it); they can reveal it with Show preview.
  const isOwnShare = (t) => t.participant.identity === localParticipant?.identity;
  const iAmSharing = screenShares.some(isOwnShare);
  const [showOwnShare, setShowOwnShare] = useState(false);
  useEffect(() => { if (!iAmSharing) setShowOwnShare(false); }, [iAmSharing]);
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
      };
      draw();
      // Tick from a worker, not requestAnimationFrame: rAF stops and page
      // timers are throttled while the browser is minimized or the tab is in
      // the background, which froze the recorded video. Worker timers keep
      // running, so the recording stays live while the host is elsewhere.
      const tickUrl = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' }));
      const ticker = new Worker(tickUrl);
      ticker.onmessage = draw;

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
        ticker.terminate();
        URL.revokeObjectURL(tickUrl);
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

  // One camera tile per participant: live video if they publish, otherwise a
  // name placeholder. Rendered in the gallery, or the left strip during a share.
  const cameraTiles = participants.map((p) => {
    const ref = cameraByIdentity[p.identity] || { participant: p, source: Track.Source.Camera };
    const isMe = p.identity === localParticipant?.identity;
    return (
      <div key={p.identity} className="meeting-tile vr-tile">
        <ParticipantTile trackRef={ref} style={{ width: '100%', height: '100%' }} />
        {isMe && <span className="vr-you-badge">You</span>}
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

  const scheduled = hasSchedule(session.start_time, session.end_time);
  const serverHost = (() => { try { return new URL(serverUrl).host; } catch { return serverUrl; } })();

  return (
    <div className="video-room vr" style={{ height: '100%' }}>
      <div className="video-body vr-body">
        <section className="vr-stage vr-card" ref={stageRef}>
          <header className="vr-stage-head">
            <RoomTitle
              kicker="Live class"
              title={session.course_name || 'Live Session'}
              subtitle={`${formatRoomDate(session.start_time)}${session.tutor_name ? ` · ${session.tutor_name}` : ''}`}
            />
            <div className="vr-timer">
              <div className="vr-timer-label">
                <span className="vr-live-dot" /> {recState === 'recording' ? 'Recording' : (scheduled ? 'Class time' : 'In call')}
              </div>
              {scheduled
                ? <ClassProgress startTime={session.start_time} endTime={session.end_time} />
                : <div className="vr-timer-value"><CallTimer /></div>}
            </div>
          </header>

          {(unmuteAsked || deviceError || recNotice) && (
            <div className="vr-notices">
              {unmuteAsked && (
                <div className="vr-alert vr-alert-info" role="status">
                  <span>The host asked you to unmute.</span>
                  <span className="vr-alert-actions">
                    <button type="button" className="vr-mini-btn is-primary" onClick={async () => { await enableMic(); setUnmuteAsked(false); }}>Unmute</button>
                    <button type="button" className="vr-mini-btn" onClick={() => setUnmuteAsked(false)}>Dismiss</button>
                  </span>
                </div>
              )}
              {deviceError && (
                <div className="vr-alert vr-alert-error" role="alert">
                  <span>{deviceError}</span>
                  <button type="button" className="vr-alert-close" onClick={() => setDeviceError?.('')} title="Dismiss" aria-label="Dismiss"><Icon name="x" size={16} /></button>
                </div>
              )}
              {recNotice && (
                <div className={`vr-alert ${recNotice === 'Recording saved.' ? 'vr-alert-success' : 'vr-alert-error'}`} role="status">
                  <span>{recNotice}</span>
                  <button type="button" className="vr-alert-close" onClick={() => setRecNotice('')} title="Dismiss" aria-label="Dismiss"><Icon name="x" size={16} /></button>
                </div>
              )}
            </div>
          )}

          <div ref={stageBodyRef} className="video-stage vr-stage-body">
            {wbOpen && (
              <Whiteboard
                canDraw={canPublish}
                canClear={isHost}
                onClose={isHost ? () => toggleWhiteboard(false) : null}
              />
            )}

            {screenShares.length > 0 ? (
              /* While someone shares, the share takes the stage and the camera
                 tiles dock to a narrow strip on the left. */
              <div className="share-layout">
                <div className="share-strip">{cameraTiles}</div>
                <div className="share-main">
                  {screenShares.map((t) => {
                    const mine = isOwnShare(t);
                    // Sharing the whole monitor always loops (and flickers as each
                    // copy is re-encoded), so only a window or tab share may preview.
                    const surface = mine ? t.publication?.track?.mediaStreamTrack?.getSettings?.().displaySurface : null;
                    const canPreview = surface === 'window' || surface === 'browser';
                    const covered = mine && (!showOwnShare || !canPreview);
                    return (
                      <div key={`ss-${t.participant.identity}`} className="share-tile">
                        <ParticipantTile trackRef={t} style={{ width: '100%', height: '100%' }} />
                        {covered ? (
                          <div className="share-self-cover">
                            <strong>You are sharing your screen</strong>
                            <span>
                              {canPreview
                                ? "Everyone in the session can see it. Your own copy is hidden so it doesn't repeat inside itself."
                                : 'Everyone in the session can see it. A preview of your entire screen would repeat inside itself and flicker, so it stays hidden. Share a single window or tab if you want to preview it.'}
                            </span>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              {canPreview && (
                                <button type="button" className="btn btn-sm btn-ghost" style={{ color: '#fff' }} onClick={() => setShowOwnShare(true)}>Show preview</button>
                              )}
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => localParticipant?.setScreenShareEnabled(false)}>Stop sharing</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {mine && (
                              <button type="button" className="share-hide-preview" onClick={() => setShowOwnShare(false)}>Hide preview</button>
                            )}
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
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* One tile per participant; columns follow the head count. */
              <div className="meeting-gallery vr-grid" data-count={Math.min(participants.length, 7)}>{cameraTiles}</div>
            )}
          </div>

          <div className="vr-controls">
            <button type="button" className="vr-btn vr-controls-side" onClick={() => stageRef.current && toggleFullscreen(stageRef.current)} title="Full screen" aria-label="Full screen">
              <Icon name="expand" />
            </button>
            {canPublish ? (
              /* Screen share for anyone on stage, students included: a promoted
                 student needs to show work, not just talk. */
              <>
                <ControlBar
                  variation="minimal"
                  controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: false, settings: false }}
                />
                {/* Our own share button: ControlBar's offers this very tab in the
                    picker, and sharing the class tab only shows it inside itself. */}
                <TrackToggle
                  source={Track.Source.ScreenShare}
                  captureOptions={{ audio: true, selfBrowserSurface: 'exclude' }}
                  showIcon
                  title="Share screen"
                />
                {!isMicrophoneEnabled && (
                  <button type="button" className="vr-pill-btn" onClick={enableMic} title="Turn on your microphone">
                    <Icon name="mic" size={18} /> Unmute
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className={`vr-btn${handRaised ? ' is-on' : ''}`}
                onClick={() => broadcastHand(!handRaised)}
                title={handRaised ? 'Lower hand' : 'Raise hand'}
                aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
                aria-pressed={handRaised}
              >
                <Icon name="hand" />
              </button>
            )}
            {isHost && (
              <button
                type="button"
                className={`vr-btn${wbOpen ? ' is-on' : ''}`}
                onClick={() => toggleWhiteboard(!wbOpen)}
                title={wbOpen ? 'Close whiteboard for everyone' : 'Open whiteboard for everyone'}
                aria-label={wbOpen ? 'Close whiteboard' : 'Open whiteboard'}
                aria-pressed={wbOpen}
              >
                <Icon name="pen" />
              </button>
            )}
            {isHost && (
              recState === 'uploading' ? (
                <button type="button" className="vr-btn" disabled title="Saving recording…" aria-label="Saving recording">
                  <Icon name="loader" className="vr-spin" />
                </button>
              ) : (
                <button
                  type="button"
                  className={`vr-btn${recState === 'recording' ? ' is-off' : ''}`}
                  onClick={recState === 'recording' ? stopRecording : startRecording}
                  title={recState === 'recording' ? 'Stop & save recording' : 'Record session'}
                  aria-label={recState === 'recording' ? 'Stop and save recording' : 'Record session'}
                >
                  <Icon name={recState === 'recording' ? 'stop' : 'record'} />
                </button>
              )
            )}
            <button type="button" className="vr-leave" onClick={confirmLeave} title="Leave session">
              <Icon name="phoneOff" size={18} /><span className="vr-leave-text">Leave class</span>
            </button>
          </div>
        </section>

        <aside className="vr-side">
          {isHost && handCount > 0 && (
            <div className="vr-card vr-side-card vr-side-card-hands">
              <div className="vr-side-head">
                <h4 className="vr-side-title"><Icon name="hand" size={18} /> Raised hands</h4>
                <span className="vr-count">{handCount}</span>
              </div>
              <ul className="vr-people">
                {Object.entries(raisedHands).map(([identity, name], i) => (
                  <li key={identity} className="vr-person">
                    <Avatar name={name} index={i} />
                    <div className="vr-person-main"><div className="vr-person-name">{name}</div></div>
                    <button type="button" className="vr-mini-btn is-primary" onClick={() => setStageAccess(identity, true)}>Promote</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isHost && (
            <div className="vr-card vr-side-card">
              <div className="vr-side-head">
                <h4 className="vr-side-title"><Icon name="door" size={18} /> Waiting room</h4>
                {waiting.length > 1 ? (
                  <button type="button" className="vr-mini-btn is-primary" disabled={lobbyBusy !== null} onClick={() => decideLobby('all', true)}>Admit all</button>
                ) : (
                  <span className="vr-count">{waiting.length}</span>
                )}
              </div>
              {lobbyError && <p className="vr-side-empty is-error">{lobbyError}</p>}
              {waiting.length === 0 ? (
                <p className="vr-side-empty">No one is waiting.</p>
              ) : (
                <ul className="vr-people">
                  {waiting.map((w, i) => (
                    <li key={w.user_id} className="vr-person">
                      <Avatar name={w.name} index={i} />
                      <div className="vr-person-main"><div className="vr-person-name" title={w.name}>{w.name || `User ${w.user_id}`}</div></div>
                      <div className="vr-person-actions">
                        <button type="button" className="vr-mini-btn is-primary" disabled={lobbyBusy !== null} onClick={() => decideLobby(w.user_id, true)}>Admit</button>
                        <button type="button" className="vr-mini-btn is-danger" disabled={lobbyBusy !== null} onClick={() => decideLobby(w.user_id, false)}>Deny</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="vr-card vr-side-card">
            <div className="vr-side-head">
              <h4 className="vr-side-title"><Icon name="users" size={18} /> In session</h4>
              <span className="vr-count">{participants.length}</span>
            </div>
            <ul className="vr-people">
              {participants.map((p, i) => {
                const isMe = p.identity === localParticipant?.identity;
                const onStage = p.permissions?.canPublish !== false;
                const micOn = p.isMicrophoneEnabled;
                return (
                  <li key={p.identity} className="vr-person">
                    <Avatar name={p.name || p.identity} index={i} />
                    <div className="vr-person-main">
                      <div className="vr-person-name">
                        {p.name || p.identity}
                        {isMe && <span className="vr-you">You</span>}
                      </div>
                      <div className="vr-person-role">
                        {onStage ? 'On stage' : 'Viewer'}
                        {raisedHands[p.identity] && <span className="vr-hand-chip">Hand up</span>}
                      </div>
                    </div>
                    <span className={`vr-mic-state${micOn ? '' : ' is-off'}`} title={micOn ? 'Mic on' : 'Mic off'}>
                      <Icon name={micOn ? 'mic' : 'micOff'} size={16} />
                    </span>
                    {isHost && !isMe && (
                      <div className="vr-person-actions vr-person-actions-row">
                        {micOn ? (
                          <button type="button" className="vr-mini-btn" disabled={participantBusy === p.identity} onClick={() => muteParticipant(p.identity)}>Mute</button>
                        ) : (
                          <button type="button" className="vr-mini-btn" disabled={!onStage} onClick={() => askUnmute(p.identity)} title={onStage ? 'Ask them to turn their mic on' : 'Put them on stage first'}>Ask to unmute</button>
                        )}
                        <button type="button" className={`vr-mini-btn ${onStage ? 'is-danger' : 'is-primary'}`} onClick={() => setStageAccess(p.identity, !onStage)}>
                          {onStage ? 'Revoke mic' : 'Allow mic'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="vr-card vr-side-card">
            <div className="vr-side-head">
              <h4 className="vr-side-title"><Icon name="signal" size={18} /> Connection</h4>
            </div>
            <div className="vr-meta">
              <div className="vr-meta-row">Provider <span className="vr-pill vr-pill-livekit">LiveKit · Webinar</span></div>
              {serverHost && <div className="vr-meta-row">Server <strong className="vr-meta-value" title={serverUrl}>{serverHost}</strong></div>}
              <div className="vr-meta-row">You are <strong>{canPublish ? 'On stage' : 'Viewer'}</strong></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
