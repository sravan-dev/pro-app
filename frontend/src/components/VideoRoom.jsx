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

export default function VideoRoom({ session, onLeave }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState('');

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const pollingRef = useRef(null);
  const lastIdRef = useRef(0);
  const remoteVideosRef = useRef({});
  const pendingCandidatesRef = useRef({});

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
      const container = document.getElementById('remote-videos');
      if (!container) return;

      let videoEl = remoteVideosRef.current[remoteUserId];
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.className = 'remote-video';
        videoEl.id = `video-${remoteUserId}`;
        container.appendChild(videoEl);
        remoteVideosRef.current[remoteUserId] = videoEl;
      }
      videoEl.srcObject = e.streams[0];
      videoEl.play?.().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(remoteUserId);
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

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
      videoEl.remove();
      delete remoteVideosRef.current[userId];
    }
    delete pendingCandidatesRef.current[userId];
    setParticipants((prev) => prev.filter((p) => p.id !== userId));
  };

  const handleSignal = useCallback(async (signal) => {
    const { from_user_id, type, payload } = signal;

    if (type === 'join') {
      const info = JSON.parse(payload);
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
    let mounted = true;

    const init = async () => {
      // Try to get camera+mic, fallback gracefully
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
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
    clearTimeout(pollingRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(peersRef.current).forEach((pc) => pc.close());
    try {
      await api.leaveSession(session.session_id);
    } catch {}
    onLeave?.();
  };

  return (
    <div className="video-room">
      <div className="video-room-header">
        <h3>{session.course_name || 'Live Session'}</h3>
        <span className="participants-count">{participants.length + 1} participant(s)</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="video-grid">
        <div className="video-container local">
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
          <span className="video-label">You ({user?.name})</span>
        </div>
        <div id="remote-videos" className="remote-videos-container" />
      </div>

      <div className="video-controls">
        <button className={`btn-control ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button className={`btn-control ${isVideoOff ? 'active' : ''}`} onClick={toggleVideo} title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
          {isVideoOff ? '📷' : '🎥'}
        </button>
        <button className={`btn-control ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title="Share screen">
          🖥️
        </button>
        <button className="btn-control btn-leave" onClick={handleLeave} title="Leave session">
          📞
        </button>
      </div>
    </div>
  );
}
