import React from 'react';

export default function SessionCard({ session, onJoin, showJoin = true }) {
  const startDate = new Date(session.start_time);
  const endDate = new Date(session.end_time);
  const now = new Date();
  const isUpcoming = startDate > now;
  const isLive = session.status === 'live' || (startDate <= now && endDate >= now);
  const isPast = session.status === 'completed' || endDate < now;

  const formatTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className={`session-card ${isLive ? 'live' : isPast ? 'past' : 'upcoming'}`}>
      <div className="session-card-status">
        <span className={`status-badge ${isLive ? 'status-live' : isPast ? 'status-completed' : 'status-scheduled'}`}>
          {isLive ? '● LIVE' : isPast ? 'Completed' : 'Upcoming'}
        </span>
      </div>
      <h4 className="session-course">{session.course_name}</h4>
      {session.tutor_name && <p className="session-tutor">with {session.tutor_name}</p>}
      <div className="session-time">
        <span className="session-date">{formatDate(startDate)}</span>
        <span className="session-hours">{formatTime(startDate)} - {formatTime(endDate)}</span>
      </div>
      {showJoin && (isLive || isUpcoming) && onJoin && (
        <button
          className={`btn ${isLive ? 'btn-danger' : 'btn-primary'} btn-sm`}
          onClick={() => onJoin(session)}
        >
          {isLive ? 'Join Now' : 'Join Session'}
        </button>
      )}
    </div>
  );
}
