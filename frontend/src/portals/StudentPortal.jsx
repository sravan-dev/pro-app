import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import CourseCard from '../components/CourseCard';
import SessionCard from '../components/SessionCard';
import Calendar from '../components/Calendar';
import DataTable from '../components/DataTable';
import SessionRoom from '../components/SessionRoom';
import usePersistedTab from '../hooks/usePersistedTab';
import { MainSkeleton } from '../components/Skeleton';

export default function StudentPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('tab:student');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [viewingCourse, setViewingCourse] = useState(null);
  const [viewMaterials, setViewMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState('');
  const [bookTutors, setBookTutors] = useState([]);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [tutorSlots, setTutorSlots] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [bookingMsg, setBookingMsg] = useState('');
  const [bookingId, setBookingId] = useState(null);

  const loadBookingData = () => {
    api.getAvailabilityTutors().then(setBookTutors).catch(() => {});
    api.getMyBookings().then(setMyBookings).catch(() => {});
  };

  useEffect(() => {
    if (activeTab !== 'booktutor') return;
    loadBookingData();
    // Keep booking statuses fresh (e.g. a tutor starting the session) while the
    // tab is open, mirroring the dashboard's 30s poll.
    const interval = setInterval(() => api.getMyBookings().then(setMyBookings).catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const openTutorSlots = async (tutor) => {
    setSelectedTutor(tutor);
    setTutorSlots([]);
    try {
      setTutorSlots(await api.getAvailability(tutor.id));
    } catch (err) {
      setBookingMsg(err.message);
    }
  };

  const handleBookSlot = async (slot) => {
    setBookingId(slot.id);
    setBookingMsg('');
    try {
      await api.bookSlot(slot.id);
      setBookingMsg('Booked! Find it under "My Bookings" below.');
      setTutorSlots((s) => s.filter((x) => x.id !== slot.id));
      loadBookingData();
    } catch (err) {
      setBookingMsg(err.message || 'Failed to book');
    } finally {
      setBookingId(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [portalData, sessions] = await Promise.all([
          api.portalData(),
          api.getSessions(),
        ]);
        setData(portalData);
        setAllSessions(sessions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const openCourseMaterials = async (course) => {
    setViewingCourse(course);
    setViewMaterials([]);
    setMaterialsError('');
    setMaterialsLoading(true);
    try {
      const r = await api.getCourseMaterials(course.id);
      setViewMaterials(r.materials || []);
    } catch (err) {
      setMaterialsError(err.message);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const handleJoinSession = async (session) => {
    try {
      const result = await api.joinSession(session.session_id);
      setActiveSession({ ...session, ...result });
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return (
    <div className="portal-layout portal-student">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton kpis={4} /></main>
    </div>
  );

  if (activeSession) {
    return (
      <div className="portal-layout portal-student">
        <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveSession(null); setActiveTab(tab); }} />
        <main className="portal-content">
          <SessionRoom session={activeSession} onLeave={() => setActiveSession(null)} />
        </main>
      </div>
    );
  }

  const courses = data?.courses || [];
  const upcomingSessions = data?.upcoming_sessions || [];
  const liveSessions = data?.live_sessions || [];
  const attendance = data?.attendance_stats || { total_sessions: 0, attended: 0 };
  const avgProgress = courses.length ? Math.round(courses.reduce((s, c) => s + (c.progress_percentage || 0), 0) / courses.length) : 0;
  const attendanceRate = attendance.total_sessions ? Math.round((attendance.attended / attendance.total_sessions) * 100) : 100;
  const avgGrade = courses.filter((c) => c.grade).map((c) => c.grade).join(', ') || 'N/A';

  const gradeColumns = [
    { key: 'course', label: 'Course', accessor: 'name' },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
    { key: 'progress', label: 'Progress', accessor: 'progress_percentage', render: (r) => (
      <div className="progress-bar-inline"><div className="progress-fill" style={{ width: `${r.progress_percentage}%` }} /><span>{Math.round(r.progress_percentage)}%</span></div>
    )},
    { key: 'grade', label: 'Grade', accessor: 'grade', render: (r) => <span className={`grade-badge grade-${(r.grade || 'na')[0]?.toLowerCase()}`}>{r.grade || 'N/A'}</span> },
    { key: 'status', label: 'Status', accessor: 'enrollment_status', render: (r) => <span className={`status-dot status-${r.enrollment_status}`}>{r.enrollment_status}</span> },
  ];

  return (
    <div className="portal-layout portal-student">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <h2>Welcome back, {user?.name?.split(' ')[0]}!</h2>

            {liveSessions.length > 0 && (
              <div className="section" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 0 4px rgba(239,68,68,0.2)' }} />
                  Live Now ({liveSessions.length})
                </h3>
                <div className="card-grid">
                  {liveSessions.map((s) => (
                    <div
                      key={s.session_id}
                      onClick={() => handleJoinSession(s)}
                      style={{ cursor: 'pointer', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1rem', borderLeft: '4px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '4px' }}
                    >
                      <strong>{s.course_name}</strong>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{s.tutor_name || 'Tutor'}</span>
                      <span style={{ fontSize: '0.8rem', color: '#10B981' }}>● {s.active_participants} in room</span>
                      <button className="btn btn-sm btn-primary" style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }} onClick={(e) => { e.stopPropagation(); handleJoinSession(s); }}>Join →</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="kpi-grid">
              <KPICard title="Enrolled Courses" value={courses.length} icon="book" color="#3B82F6" />
              <KPICard title="Avg Progress" value={`${avgProgress}%`} icon="trending-up" color="#10B981" />
              <KPICard title="Attendance Rate" value={`${attendanceRate}%`} icon="check-circle" color="#8B5CF6" />
              <KPICard title="Upcoming Sessions" value={upcomingSessions.length} icon="calendar" color="#F59E0B" />
            </div>

            <div className="section">
              <h3>My Courses</h3>
              <div className="card-grid">
                {courses.slice(0, 4).map((c) => <CourseCard key={c.id} course={c} onClick={() => openCourseMaterials(c)} />)}
              </div>
            </div>

            {upcomingSessions.length > 0 && (
              <div className="section">
                <h3>Upcoming Sessions</h3>
                <div className="card-grid">
                  {upcomingSessions.slice(0, 3).map((s) => (
                    <SessionCard key={s.session_id} session={s} onJoin={handleJoinSession} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="portal-page">
            <h2>My Courses</h2>
            <div className="card-grid">
              {courses.map((c) => <CourseCard key={c.id} course={c} onClick={() => openCourseMaterials(c)} />)}
            </div>
            {courses.length === 0 && <p className="empty-state">No courses enrolled yet.</p>}
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="portal-page">
            <h2>Sessions</h2>
            <Calendar sessions={allSessions} onSessionClick={handleJoinSession} />
            <div className="section">
              <h3>All Sessions</h3>
              <div className="card-grid">
                {allSessions.map((s) => (
                  <SessionCard key={s.session_id} session={s} onJoin={handleJoinSession} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'booktutor' && (
          <div className="portal-page">
            <h2>Book a Tutor</h2>
            {bookingMsg && <div className="alert alert-info" onClick={() => setBookingMsg('')}>{bookingMsg}</div>}

            {!selectedTutor ? (
              <div className="section">
                <h3>Available Tutors</h3>
                {bookTutors.length === 0 ? (
                  <p className="empty-state">No tutors have open slots right now. Check back later.</p>
                ) : (
                  <div className="card-grid">
                    {bookTutors.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => openTutorSlots(t)}
                        style={{ cursor: 'pointer', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <div className="avatar" style={{ width: '44px', height: '44px', fontSize: '16px', backgroundColor: t.avatar_color || '#4F46E5', backgroundImage: t.avatar_url ? `url(${t.avatar_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', color: t.avatar_url ? 'transparent' : '#fff' }}>
                          {!t.avatar_url && t.name?.[0]}
                        </div>
                        <div>
                          <strong>{t.name}</strong>
                          {t.specialization && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{t.specialization}</div>}
                          <div style={{ fontSize: '0.8rem', color: '#10B981' }}>{t.open_slots} open slot{t.open_slots === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="section">
                <button className="btn btn-ghost" onClick={() => { setSelectedTutor(null); setTutorSlots([]); }} style={{ marginBottom: '1rem' }}>← Back to Tutors</button>
                <h3>{selectedTutor.name} — Open Slots</h3>
                {tutorSlots.length === 0 ? (
                  <p className="empty-state">No open slots for this tutor anymore.</p>
                ) : (
                  <div className="card-grid">
                    {tutorSlots.map((s) => (
                      <div key={s.id} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong>{new Date(s.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                          {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {s.note && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{s.note}</span>}
                        <button className="btn btn-sm btn-primary" style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }} disabled={bookingId === s.id} onClick={() => handleBookSlot(s)}>
                          {bookingId === s.id ? 'Booking…' : 'Book'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="section">
              <h3>My Bookings</h3>
              {myBookings.length === 0 ? (
                <p className="empty-state">You haven't booked any sessions yet.</p>
              ) : (
                <DataTable
                  columns={[
                    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name', render: (r) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="avatar-sm" style={{ backgroundColor: r.tutor_color }}>{r.tutor_name?.[0]}</div>
                        {r.tutor_name}
                      </div>
                    )},
                    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleDateString() },
                    { key: 'time', label: 'Time', accessor: 'start_time', render: (r) => `${new Date(r.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(r.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
                    { key: 'note', label: 'Note', accessor: 'note', render: (r) => r.note || '—' },
                    { key: 'status', label: 'Status', accessor: 'session_status', render: (r) => <span className={`status-badge status-${r.session_status}`}>{r.session_status}</span> },
                    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                      (r.session_status === 'scheduled' || r.session_status === 'live') &&
                        <button className="btn btn-sm btn-primary" onClick={() => handleJoinSession({ session_id: r.session_id, start_time: r.start_time, end_time: r.end_time })}>
                          {r.session_status === 'live' ? 'Join' : 'Start'}
                        </button>
                    )},
                  ]}
                  data={myBookings}
                  searchable={false}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'grades' && (
          <div className="portal-page">
            <h2>Grades & Performance</h2>
            <DataTable columns={gradeColumns} data={courses} searchable={false} />
          </div>
        )}

        {viewingCourse && (
          <div className="modal-overlay" onClick={() => setViewingCourse(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
              <h3>{viewingCourse.name} — Course Materials</h3>
              <p style={{ color: '#666', fontSize: '13px', marginTop: '-4px' }}>by {viewingCourse.tutor_name}</p>
              {materialsLoading && <p>Loading...</p>}
              {materialsError && <p style={{ color: '#dc2626' }}>{materialsError}</p>}
              {!materialsLoading && !materialsError && viewMaterials.length === 0 && (
                <p style={{ color: '#888', padding: '16px 0' }}>No materials available yet.</p>
              )}
              {viewMaterials.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0', maxHeight: '420px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
                  {viewMaterials.map((m) => (
                    <li key={m.id} style={{ padding: '12px 14px', borderBottom: '1px solid #eee' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        {m.title} <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: 400 }}>[{m.type}]</span>
                      </div>
                      {m.description && <div style={{ fontSize: '13px', color: '#555', marginBottom: '6px' }}>{m.description}</div>}
                      {m.type === 'file' && m.file_path && (
                        <a href={m.file_path} target="_blank" rel="noreferrer" download style={{ color: '#3B82F6', fontSize: '13px' }}>
                          ⬇ Download {m.original_name || 'file'}
                        </a>
                      )}
                      {m.type === 'link' && m.url && (
                        <a href={m.url} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', fontSize: '13px', wordBreak: 'break-all' }}>
                          🔗 {m.url}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => setViewingCourse(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
