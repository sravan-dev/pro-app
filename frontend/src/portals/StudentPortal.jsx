import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import CourseCard from '../components/CourseCard';
import SessionCard from '../components/SessionCard';
import Calendar from '../components/Calendar';
import DataTable from '../components/DataTable';
import VideoRoom from '../components/VideoRoom';

export default function StudentPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [allSessions, setAllSessions] = useState([]);

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
          <VideoRoom session={activeSession} onLeave={() => setActiveSession(null)} />
        </main>
      </div>
    );
  }

  const courses = data?.courses || [];
  const upcomingSessions = data?.upcoming_sessions || [];
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
            <div className="kpi-grid">
              <KPICard title="Enrolled Courses" value={courses.length} icon="book" color="#3B82F6" />
              <KPICard title="Avg Progress" value={`${avgProgress}%`} icon="trending-up" color="#10B981" />
              <KPICard title="Attendance Rate" value={`${attendanceRate}%`} icon="check-circle" color="#8B5CF6" />
              <KPICard title="Upcoming Sessions" value={upcomingSessions.length} icon="calendar" color="#F59E0B" />
            </div>

            <div className="section">
              <h3>My Courses</h3>
              <div className="card-grid">
                {courses.slice(0, 4).map((c) => <CourseCard key={c.id} course={c} />)}
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
              {courses.map((c) => <CourseCard key={c.id} course={c} />)}
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
      </main>
    </div>
  );
}
