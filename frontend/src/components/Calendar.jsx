import React, { useState } from 'react';

export default function Calendar({ sessions = [], onSessionClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getSessionsForDay = (day) => {
    return sessions.filter((s) => {
      const d = new Date(s.start_time);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  };

  const today = new Date();
  const isToday = (day) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prevMonth} className="btn btn-ghost">&lt;</button>
        <h3>{monthNames[month]} {year}</h3>
        <button onClick={nextMonth} className="btn btn-ghost">&gt;</button>
      </div>
      <div className="calendar-grid">
        {dayNames.map((d) => (
          <div key={d} className="calendar-day-name">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="calendar-cell empty" />;
          const daySessions = getSessionsForDay(day);
          return (
            <div key={day} className={`calendar-cell ${isToday(day) ? 'today' : ''} ${daySessions.length ? 'has-sessions' : ''}`}>
              <span className="calendar-day-number">{day}</span>
              {daySessions.map((s) => (
                <div
                  key={s.session_id}
                  className={`calendar-event ${s.status}`}
                  onClick={() => onSessionClick?.(s)}
                  title={s.course_name}
                >
                  {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {s.course_name?.substring(0, 15)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
