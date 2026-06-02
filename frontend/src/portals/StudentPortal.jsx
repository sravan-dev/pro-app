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

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;

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
