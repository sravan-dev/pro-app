import React, { useRef } from 'react';
import SessionRoom from './SessionRoom';

// Keeps a joined session mounted while the user moves around the portal.
// Unmounting the room disconnects it, so instead of dropping it on a sidebar
// click the portal flips `minimized` and the same room shrinks into a floating
// mini-player. The SessionRoom element must stay at the same place in the tree
// in both modes, which is why the mini bar is a sibling rendered before it
// rather than a different wrapper.
export default function SessionDock({ session, minimized, onExpand, onLeave }) {
  const bodyRef = useRef(null);

  // Browser picture-in-picture keeps a video visible even outside this tab.
  // Prefer someone else's video over your own preview.
  const popOut = async () => {
    const videos = [...(bodyRef.current?.querySelectorAll('video') || [])].filter((v) => v.readyState > 0);
    const isOwn = (v) => v.classList.contains('local-video') || v.closest('[data-lk-local-participant="true"]');
    const pick = videos.find((v) => !isOwn(v)) || videos[0];
    if (!pick || !document.pictureInPictureEnabled) {
      alert('No video to pop out yet. Picture-in-picture needs a camera or screen share in the room.');
      return;
    }
    try { await pick.requestPictureInPicture(); }
    catch (e) { alert(e.message || 'Picture-in-picture is not available in this browser.'); }
  };

  return (
    <div className={`session-dock${minimized ? ' session-dock-mini' : ''}`}>
      {minimized && (
        <div className="session-dock-bar">
          <span className="session-dock-title" title={session.course_name || 'Live session'}>
            <span className="session-dock-live" /> {session.course_name || 'Live session'}
          </span>
          <button type="button" onClick={popOut} title="Pop out video (picture-in-picture)">⧉</button>
          <button type="button" onClick={onExpand} title="Back to the session">⤢ Open</button>
        </div>
      )}
      <div className="session-dock-body" ref={bodyRef}>
        <SessionRoom key={session.session_id} session={session} onLeave={onLeave} />
      </div>
    </div>
  );
}
