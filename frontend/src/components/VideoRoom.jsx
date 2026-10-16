import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

// STUN finds the public address; TURN relays media when a direct path can't be
// established (different networks, symmetric NAT, restrictive firewalls).
// Without a TURN fallback, cross-network calls connect signaling but no video
// frames flow — the remote tile stays black.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Inline icons (Lucide paths) for the call controls.
const ICONS = {
  mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
  micOff: <><path d="m2 2 20 20" /><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" /><path d="M5 10v2a7 7 0 0 0 12 5" /><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><path d="M12 19v3" /></>,
  video: <><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
  videoOff: <><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" /><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" /><path d="m2 2 20 20" /></>,
  share: <><path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" /><path d="M8 21h8" /><path d="M12 17v4" /><path d="m17 8 5-5" /><path d="M17 3h5v5" /></>,
  phoneOff: <><path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" /><path d="M22 2 2 22" /><path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" /></>,
  expand: <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
};

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// Time since this user joined, ticking every second. Kept in its own component
// so the tick re-renders only the clock, not the whole room.
function CallTimer() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((now - start) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return <>{pad(Math.floor(secs / 3600))}:{pad(Math.floor(secs / 60) % 60)}:{pad(secs % 60)}</>;
}

export default function VideoRoom({ session, onLeave }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState({});
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [videoProvider, setVideoProvider] = useState('');
  const [zoomStatus, setZoomStatus] = useState(null);

  const setPeerDebug = (userId, patch) =>
    setDebug((d) => ({ ...d, [userId]: { ...d[userId], ...patch } }));

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const pollingRef = useRef(null);
  const lastIdRef = useRef(0);
  const remoteVideosRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const namesRef = useRef({}); // remote user id -> display name, for tile labels
  const stageRef = useRef(null);

  // ICE candidates can arrive before the remote description is set. Adding one
  // then throws and the candidate is lost, which can leave the connection unable
  // to find a working path (black tile). Buffer until the description is ready.
  const flushCandidates = async (pc, userId) => {
    const queued = pendingCandidatesRef.current[userId];
    if (!queued) return;
    delete pendingCandidatesRef.current[userId];
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch {}
    }
  };

  const createPeerConnection = useCallback((remoteUserId) => {
    if (peersRef.current[remoteUserId]) return peersRef.current[remoteUserId];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        api.sendSignal({
          session_id: session.session_id,
          type: 'ice-candidate',
          to_user_id: remoteUserId,
          payload: JSON.stringify(e.candidate),
        });
      }
    };

    pc.ontrack = (e) => {
      const track = e.track;
      console.log('[VideoRoom] ontrack', remoteUserId, track.kind,
        'enabled=', track.enabled, 'muted=', track.muted, 'state=', track.readyState,
        'streams=', e.streams.length);
      setPeerDebug(remoteUserId, { [`${track.kind}Track`]: track.muted ? 'muted' : 'live' });

      const container = document.getElementById('remote-videos');
      if (!container) return;

      let videoEl = remoteVideosRef.current[remoteUserId];
      if (!videoEl) {
        // Each remote video sits in a tile with a name label, like the local one.
        const tile = document.createElement('div');
        tile.className = 'vr-tile';
        tile.id = `tile-${remoteUserId}`;
        videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.className = 'remote-video';
        videoEl.id = `video-${remoteUserId}`;
        const label = document.createElement('span');
        label.className = 'vr-tile-name';
        label.textContent = namesRef.current[remoteUserId] || 'Participant';
        tile.append(videoEl, label);
        container.appendChild(tile);
        remoteVideosRef.current[remoteUserId] = videoEl;
      }
      videoEl.srcObject = e.streams[0];
      videoEl.play?.().catch(() => {});
      // The track often arrives "muted" (no frames yet) and unmutes once media
      // actually flows — re-kick playback then so the tile doesn't stay black.
      track.onunmute = () => {
        setPeerDebug(remoteUserId, { [`${track.kind}Track`]: 'live' });
        videoEl.play?.().catch(() => {});
      };
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[VideoRoom] iceState', remoteUserId, pc.iceConnectionState);
      setPeerDebug(remoteUserId, { ice: pc.iceConnectionState });
    };

    pc.onconnectionstatechange = () => {
      console.log('[VideoRoom] connState', remoteUserId, pc.connectionState);
      setPeerDebug(remoteUserId, { conn: pc.connectionState });
      // 'disconnected' is frequently transient (especially via TURN) and can
      // recover on its own — only tear down on terminal states.
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteUserId);
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Always negotiate BOTH audio and video, even when this peer has no
    // camera/mic. Common case: two browsers on one machine fight over a single
    // webcam, so the second one's getUserMedia fails and it joins with no video
    // track. Without a video transceiver its SDP offer carries no video m-line,
    // so it can neither send NOR RECEIVE the other side's video — both tiles
    // stay black. A recvonly transceiver keeps the m-line present so a
    // media-less participant can still see/hear everyone else.
    const localKinds = new Set(
      (localStreamRef.current?.getTracks() || []).map((t) => t.kind)
    );
    if (!localKinds.has('video')) pc.addTransceiver('video', { direction: 'recvonly' });
    if (!localKinds.has('audio')) pc.addTransceiver('audio', { direction: 'recvonly' });

    peersRef.current[remoteUserId] = pc;
    return pc;
  }, [session]);

  const removePeer = (userId) => {
    const pc = peersRef.current[userId];
    if (pc) {
      pc.close();
      delete peersRef.current[userId];
    }
    const videoEl = remoteVideosRef.current[userId];
    if (videoEl) {
      (videoEl.closest('.vr-tile') || videoEl).remove();
      delete remoteVideosRef.current[userId];
    }
    delete pendingCandidatesRef.current[userId];
    setParticipants((prev) => prev.filter((p) => p.id !== userId));
  };

  const handleSignal = useCallback(async (signal) => {
    const { from_user_id, type, payload } = signal;

    if (type === 'join') {
      const info = JSON.parse(payload);
      // A join for a peer we already hold a connection to means they refreshed
      // or rejoined — tear the stale connection down so we renegotiate cleanly
      // against their new RTCPeerConnection instead of reusing a dead one.
      if (peersRef.current[from_user_id]) removePeer(from_user_id);
      namesRef.current[from_user_id] = info.name;
      setParticipants((prev) => {
        if (prev.find((p) => p.id === from_user_id)) return prev;
        return [...prev, { id: from_user_id, name: info.name, role: info.role }];
      });

      // Both peers receive each other's "join", so initiation must be
      // deterministic — only the higher user id creates the offer. Otherwise
      // both sides offer at once (glare) and negotiation fails, leaving the
      // remote tile black. The lower id just prepares the connection to answer.
      const pc = createPeerConnection(from_user_id);
      if (user.id > from_user_id) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        api.sendSignal({
          session_id: session.session_id,
          type: 'offer',
          to_user_id: from_user_id,
          payload: JSON.stringify(offer),
        });
      }
    }

    if (type === 'offer') {
      const pc = createPeerConnection(from_user_id);
      await pc.setRemoteDescription(JSON.parse(payload));
      await flushCandidates(pc, from_user_id);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      api.sendSignal({
        session_id: session.session_id,
        type: 'answer',
        to_user_id: from_user_id,
        payload: JSON.stringify(answer),
      });
    }

    if (type === 'answer') {
      const pc = peersRef.current[from_user_id];
      if (pc) {
        await pc.setRemoteDescription(JSON.parse(payload));
        await flushCandidates(pc, from_user_id);
      }
    }

    if (type === 'ice-candidate') {
      const candidate = JSON.parse(payload);
      const pc = peersRef.current[from_user_id];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(candidate); } catch {}
      } else {
        // Remote description not set yet — queue until it is.
        (pendingCandidatesRef.current[from_user_id] ||= []).push(candidate);
      }
    }

    if (type === 'leave') {
      removePeer(from_user_id);
    }
  }, [session, createPeerConnection, user]);

  useEffect(() => {
    api.getAppSettings().then((s) => {
      const provider = s.video_provider || 'webrtc';
      setVideoProvider(provider);
      if (provider === 'zoom') {
        api.getZoomStatus().then(setZoomStatus).catch(() => setZoomStatus({ connected: false, error: 'status unavailable' }));
      }
    }).catch(() => {});
  }, []);

  // Warn before the browser tab/window is closed or reloaded while in a class.
  useEffect(() => {
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Try to get camera+mic, fallback gracefully
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setLocalVideoOn(stream.getVideoTracks().length > 0);
      } catch {
        // Try audio only
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          localStreamRef.current = stream;
          setIsVideoOff(true);
          setError('Camera unavailable. Joined with audio only.');
        } catch {
          // No media at all — join as viewer
          setIsVideoOff(true);
          setIsMuted(true);
          setError('Camera/microphone unavailable. Joined as viewer.');
        }
      }

      // Always start polling for signals regardless of media access
      const poll = async () => {
        if (!mounted) return;
        try {
          const signals = await api.pollSignals(session.session_id, lastIdRef.current);
          if (signals.length > 0) {
            lastIdRef.current = Math.max(...signals.map((s) => s.id));
            for (const sig of signals) {
              await handleSignal(sig);
            }
          }
        } catch {}
        if (mounted) {
          pollingRef.current = setTimeout(poll, 2000);
        }
      };
      poll();
    };

    init();

    return () => {
      mounted = false;
      clearTimeout(pollingRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
    };
  }, [session, handleSignal]);

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) videoTrack.stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
        localStreamRef.current.addTrack(newTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(newTrack);
        });
      } catch {}
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const oldTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(screenTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });
        screenTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } catch {}
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this session?')) return;
    clearTimeout(pollingRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(peersRef.current).forEach((pc) => pc.close());
    try {
      await api.leaveSession(session.session_id);
    } catch {}
    onLeave?.();
  };

  // A join can arrive after the peer's video tile was built — fix up its label.
  useEffect(() => {
    participants.forEach((p) => {
      const label = document.querySelector(`#tile-${p.id} .vr-tile-name`);
      if (label && p.name) label.textContent = p.name;
    });
  }, [participants]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stageRef.current?.requestFullscreen?.().catch(() => {});
  };

  const everyone = [{ id: user?.id, name: user?.name, role: user?.role, you: true }, ...participants];
  const initial = (name) => name?.trim()?.[0]?.toUpperCase() || '?';
  const startAt = session.start_time ? new Date(session.start_time) : null;
  const dateLine = (startAt && !isNaN(startAt) ? startAt : new Date())
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const showCamCover = (!localVideoOn || isVideoOff) && !isScreenSharing;
  const diagnostics = [
    `local cam: ${localVideoOn ? (isVideoOff ? 'off' : 'on') : 'none'}`,
    ...participants.map((p) => {
      const s = debug[p.id] || {};
      return `${p.name}: ice=${s.ice || '—'} conn=${s.conn || '—'} video=${s.videoTrack || '—'} audio=${s.audioTrack || '—'}`;
    }),
  ].join('\n');

  return (
    <div className="video-room vr">
      <div className="video-body vr-body">
        <section className="vr-stage vr-card" ref={stageRef}>
          <header className="vr-stage-head">
            <div style={{ minWidth: 0 }}>
              <div className="vr-kicker"><span className="vr-dots" aria-hidden="true"><i /><i /><i /><i /></span>Live class</div>
              <h3 className="vr-title">{session.course_name || 'Live Session'}</h3>
              <p className="vr-subtitle">{dateLine}{session.tutor_name ? ` · ${session.tutor_name}` : ''}</p>
            </div>
            <div className="vr-timer">
              <div className="vr-timer-label"><span className="vr-live-dot" /> In call</div>
              <div className="vr-timer-value"><CallTimer /></div>
            </div>
          </header>

          {error && <div className="vr-alert" role="status">{error}</div>}

          <div className="vr-grid" data-count={Math.min(everyone.length, 7)}>
            <div className="vr-tile">
              <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
              {showCamCover && (
                <div className="vr-tile-cover"><span className="vr-avatar vr-avatar-lg vr-ring-0">{initial(user?.name)}</span></div>
              )}
              {isMuted && <span className="vr-tile-muted" title="Your mic is off"><Icon name="micOff" size={14} /></span>}
              <span className="vr-tile-name">You · {user?.name}</span>
            </div>
            <div id="remote-videos" className="vr-remote" />
          </div>

          <div className="vr-controls">
            <button type="button" className="vr-btn vr-controls-side" onClick={toggleFullscreen} title="Full screen" aria-label="Full screen">
              <Icon name="expand" />
            </button>
            <button type="button" className={`vr-btn${isMuted ? ' is-off' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'} aria-pressed={isMuted}>
              <Icon name={isMuted ? 'micOff' : 'mic'} />
            </button>
            <button type="button" className={`vr-btn${isVideoOff ? ' is-off' : ''}`} onClick={toggleVideo} title={isVideoOff ? 'Turn on camera' : 'Turn off camera'} aria-label={isVideoOff ? 'Turn on camera' : 'Turn off camera'} aria-pressed={isVideoOff}>
              <Icon name={isVideoOff ? 'videoOff' : 'video'} />
            </button>
            <button type="button" className={`vr-btn${isScreenSharing ? ' is-on' : ''}`} onClick={toggleScreenShare} title={isScreenSharing ? 'Stop sharing' : 'Share screen'} aria-label={isScreenSharing ? 'Stop sharing' : 'Share screen'} aria-pressed={isScreenSharing}>
              <Icon name="share" />
            </button>
            <button type="button" className="vr-leave" onClick={handleLeave} title="Leave session">
              <Icon name="phoneOff" size={18} /><span className="vr-leave-text">Leave class</span>
            </button>
          </div>
        </section>

        <aside className="vr-side">
          <div className="vr-card vr-side-card">
            <div className="vr-side-head">
              <h4 className="vr-side-title"><Icon name="users" size={18} /> In session</h4>
              <span className="vr-count">{everyone.length}</span>
            </div>
            <ul className="vr-people">
              {everyone.map((p, i) => (
                <li key={p.id ?? p.name} className="vr-person">
                  <span className={`vr-avatar vr-ring-${i % 4}`}>{initial(p.name)}</span>
                  <div>
                    <div className="vr-person-name">{p.name}{p.you && <span className="vr-you">You</span>}</div>
                    {p.role && <div className="vr-person-role">{p.role}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="vr-card vr-side-card">
            <div className="vr-side-head">
              <h4 className="vr-side-title">Connection</h4>
            </div>
            <div className="vr-meta">
              {videoProvider && (
                <div className="vr-meta-row" title="Active video provider (Settings → Video / Meeting Provider)">
                  Provider
                  <span className={`vr-pill ${videoProvider === 'zoom' ? 'vr-pill-zoom' : 'vr-pill-webrtc'}`}>{videoProvider === 'zoom' ? 'Zoom' : 'WebRTC'}</span>
                </div>
              )}
              {videoProvider === 'zoom' && zoomStatus && (
                <div className="vr-meta-row" title={zoomStatus.error || (zoomStatus.connected ? 'Zoom API reachable' : 'Zoom API not connected')}>
                  Zoom API
                  <strong>
                    <span className="vr-status-dot" style={{ background: zoomStatus.connected ? '#77DD77' : (zoomStatus.configured === false ? '#C9C6D9' : '#FF0D00') }} />
                    {zoomStatus.connected ? 'Connected' : (zoomStatus.configured === false ? 'Not configured' : 'Error')}
                  </strong>
                </div>
              )}
              <div className="vr-meta-row">
                Your camera
                <strong>{localVideoOn ? (isVideoOff ? 'Off' : 'On') : 'Unavailable'}</strong>
              </div>
              <details className="vr-diag">
                <summary>Connection details</summary>
                <pre>{diagnostics}</pre>
              </details>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
