import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import Calendar from '../components/Calendar';
import SessionCard from '../components/SessionCard';
import VideoRoom from '../components/VideoRoom';

export default function TutorPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({ course_id: '', start_time: '', end_time: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const d = await api.portalData();
        setData(d);
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

  const handleCreateSession = async (e) => {
    e.preventDefault();
    try {
      await api.createSession(sessionForm);
      setMessage('Session created!');
      setShowSessionForm(false);
      const d = await api.portalData();
      setData(d);
    } catch (err) {
      setMessage(err.message);
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
      <div className="portal-layout portal-tutor">
        <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveSession(null); setActiveTab(tab); }} />
        <main className="portal-content">
          <VideoRoom session={activeSession} onLeave={() => setActiveSession(null)} />
        </main>
      </div>
    );
  }

  const courses = data?.courses || [];
  const students = data?.students || [];
  const sessions = data?.sessions || [];
  const teachingStats = data?.teaching_stats || { total_sessions: 0, total_hours: 0 };
  const uniqueStudents = [...new Set(students.map((s) => s.id))].length;
  const upcomingSessions = sessions.filter((s) => s.status === 'scheduled');

  const studentColumns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'course', label: 'Course', accessor: 'course_name' },
    { key: 'progress', label: 'Progress', accessor: 'progress_percentage', render: (r) => (
      <div className="progress-bar-inline"><div className="progress-fill" style={{ width: `${r.progress_percentage}%` }} /><span>{Math.round(r.progress_percentage)}%</span></div>
    )},
    { key: 'grade', label: 'Grade', accessor: 'grade', render: (r) => r.grade || '-' },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span> },
  ];

  const attendanceColumns = [
    { key: 'course', label: 'Course', accessor: 'course_name' },
    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleDateString() },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      r.status !== 'completed' && <button className="btn btn-sm btn-primary" onClick={() => handleJoinSession(r)}>Start</button>
    )},
  ];

  const payoutRate = 500; // per hour rate
  const totalHours = Math.round(teachingStats.total_hours || 0);
  const totalPayout = totalHours * payoutRate;

  return (
    <div className="portal-layout portal-tutor">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {message && <div className="alert alert-info" onClick={() => setMessage('')}>{message}</div>}

        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <h2>Welcome, {user?.name?.split(' ')[0]}!</h2>
            <div className="kpi-grid">
              <KPICard title="My Students" value={uniqueStudents} icon="users" color="#3B82F6" />
              <KPICard title="My Courses" value={courses.length} icon="book" color="#10B981" />
              <KPICard title="Sessions Completed" value={teachingStats.total_sessions} icon="video" color="#8B5CF6" />
              <KPICard title="Teaching Hours" value={`${totalHours}h`} icon="clock" color="#F59E0B" />
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

        {activeTab === 'students' && (
          <div className="portal-page">
            <h2>My Students</h2>
            <DataTable columns={studentColumns} data={students} />
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Sessions</h2>
              <button className="btn btn-primary" onClick={() => setShowSessionForm(true)}>+ Schedule Session</button>
            </div>

            {showSessionForm && (
              <div className="modal-overlay" onClick={() => setShowSessionForm(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Schedule New Session</h3>
                  <form onSubmit={handleCreateSession}>
                    <div className="form-group">
                      <label>Course</label>
                      <select value={sessionForm.course_id} onChange={(e) => setSessionForm({ ...sessionForm, course_id: e.target.value })} required>
                        <option value="">Select course...</option>
                        {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Start Time</label>
                      <input type="datetime-local" value={sessionForm.start_time} onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>End Time</label>
                      <input type="datetime-local" value={sessionForm.end_time} onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} required />
                    </div>
                    <div className="form-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowSessionForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary">Create</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <Calendar sessions={sessions} onSessionClick={handleJoinSession} />

            <div className="section">
              <h3>All Sessions</h3>
              <DataTable columns={attendanceColumns} data={sessions} searchable={false} />
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="portal-page">
            <h2>Attendance Records</h2>
            <DataTable columns={attendanceColumns} data={sessions.filter((s) => s.status === 'completed')} searchable={false} />
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="portal-page">
            <h2>Payouts & Earnings</h2>
            <div className="kpi-grid">
              <KPICard title="Total Hours" value={`${totalHours}h`} icon="clock" color="#3B82F6" />
              <KPICard title="Rate / Hour" value={`$${payoutRate}`} icon="dollar" color="#10B981" />
              <KPICard title="Total Earned" value={`$${totalPayout.toLocaleString()}`} icon="dollar" color="#F59E0B" />
              <KPICard title="Sessions Done" value={teachingStats.total_sessions} icon="check-circle" color="#8B5CF6" />
            </div>

            <div className="section">
              <h3>Session History</h3>
              <DataTable
                columns={[
                  { key: 'course', label: 'Course', accessor: 'course_name' },
                  { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleDateString() },
                  { key: 'duration', label: 'Duration', accessor: (r) => {
                    const start = new Date(r.start_time);
                    const end = new Date(r.end_time);
                    return `${Math.round((end - start) / 60000)} min`;
                  }},
                  { key: 'payout', label: 'Payout', accessor: (r) => {
                    const hours = (new Date(r.end_time) - new Date(r.start_time)) / 3600000;
                    return `$${Math.round(hours * payoutRate)}`;
                  }},
                ]}
                data={sessions.filter((s) => s.status === 'completed')}
                searchable={false}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
