import React, { useState, useEffect } from 'react';
import { api } from '../api';
import VideoRoom from './VideoRoom';
import LiveKitRoom from './LiveKitRoom';

// Picks the video backend based on the admin's provider setting:
//   - 'livekit' → SFU webinar room (scales to 50-100+)
//   - anything else → built-in WebRTC mesh (good for small 1:1 / small groups)
// All call entry points render this so the choice is made in exactly one place.
export default function SessionRoom({ session, onLeave }) {
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getAppSettings()
      .then((s) => { if (mounted) setProvider(s.video_provider === 'livekit' && s.livekit_configured ? 'livekit' : 'webrtc'); })
      .catch(() => { if (mounted) setProvider('webrtc'); });
    return () => { mounted = false; };
  }, []);

  if (!provider) {
    return (
      <div className="video-room" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <p style={{ color: '#cbd5e1' }}>Loading session…</p>
      </div>
    );
  }

  if (provider === 'livekit') return <LiveKitRoom session={session} onLeave={onLeave} />;
  return <VideoRoom session={session} onLeave={onLeave} />;
}
