import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import Calendar from '../components/Calendar';
import SessionCard from '../components/SessionCard';
import SessionRoom from '../components/SessionRoom';
import usePersistedTab from '../hooks/usePersistedTab';
import { MainSkeleton } from '../components/Skeleton';

export default function TutorPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('tab:tutor');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({ course_id: '', start_time: '', end_time: '' });
  const [message, setMessage] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [attendance, setAttendance] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [playUrl, setPlayUrl] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [availSlots, setAvailSlots] = useState([]);
  const [showAvailForm, setShowAvailForm] = useState(false);
  const [availForm, setAvailForm] = useState({ start_time: '', end_time: '', note: '' });

  const loadRecordings = () => api.getMeetingRecords().then(setRecordings).catch(() => {});
  const loadAvailability = () => api.getAvailability().then(setAvailSlots).catch(() => {});

  const deleteRecording = async (id) => {
    if (!window.confirm('Delete this recording? This permanently removes the file.')) return;
    try { await api.deleteMeetingRecord(id); setRecordings((r) => r.filter((x) => x.record_id !== id)); }
    catch (err) { setMessage(err.message || 'Failed to delete recording'); }
  };

  const openStudentDetail = async (student) => {
    setStudentDetail(null);
    setStudentDetailLoading(true);
    try {
      const detail = await api.getStudentDetail(student.id);
      setStudentDetail(detail);
    } catch (err) {
      setMessage(err.message || 'Failed to load student');
    } finally {
      setStudentDetailLoading(false);
    }
  };

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

  useEffect(() => {
    api.getAppSettings().then((s) => setCurrency(s.currency || 'INR')).catch(() => {});
  }, []);

  // Prefetch the lazy tab data in the background on mount so the first sidebar
  // click lands on already-loaded content instead of waiting on a fresh request.
  useEffect(() => {
    api.getAttendanceLogs().then(setAttendance).catch(() => {});
    loadRecordings();
    loadAvailability();
  }, []);

  // Revalidate the tab's data when it's opened. Existing data stays on screen
  // during the refresh (stale-while-revalidate), so there's no blank flash.
  useEffect(() => {
    if (activeTab === 'attendance') api.getAttendanceLogs().then(setAttendance).catch(() => {});
    if (activeTab === 'recordings') loadRecordings();
    if (activeTab === 'availability') loadAvailability();
  }, [activeTab]);

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

  const handleEndSession = async (session) => {
    if (!window.confirm('End this session for everyone? It will be marked completed.')) return;
    try {
      await api.endSession(session.session_id);
      setMessage('Session ended.');
      const d = await api.portalData();
      setData(d);
    } catch (err) {
      setMessage(err.message || 'Failed to end session');
    }
  };

  const handleCreateAvailability = async (e) => {
    e.preventDefault();
    try {
      await api.createAvailability(availForm);
      setMessage('Availability added!');
      setShowAvailForm(false);
      setAvailForm({ start_time: '', end_time: '', note: '' });
      loadAvailability();
    } catch (err) {
      setMessage(err.message || 'Failed to add availability');
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!window.confirm('Remove this availability slot?')) return;
    try {
      await api.deleteAvailability(slot.id);
      setAvailSlots((s) => s.filter((x) => x.id !== slot.id));
    } catch (err) {
      setMessage(err.message || 'Failed to remove slot');
    }
  };

  if (loading) return (
    <div className="portal-layout portal-tutor">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton kpis={4} /></main>
    </div>
  );

  if (activeSession) {
    return (
      <div className="portal-layout portal-tutor">
        <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveSession(null); setActiveTab(tab); }} />
        <main className="portal-content">
          <SessionRoom session={activeSession} onLeave={() => setActiveSession(null)} />
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
      r.status !== 'completed' && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-sm btn-primary" onClick={() => handleJoinSession(r)}>{r.status === 'live' ? 'Join' : 'Start'}</button>
          {r.status === 'live' && <button className="btn btn-sm btn-danger" onClick={() => handleEndSession(r)}>End</button>}
        </div>
      )
    )},
  ];

  const formatMoney = (n) => `${currency} ${Math.round(n || 0).toLocaleString()}`;

  // Payout rate/type are configured per tutor by the admin (Settings → Users).
  const payoutInfo = data?.payout || { payout_rate: 0, payout_type: 'monthly' };
  const payoutRate = payoutInfo.payout_rate || 0;
  const payoutType = payoutInfo.payout_type || 'monthly';
  const payoutUnitLabel = ({
    per_hour: 'per hour', per_session: 'per session', per_course: 'per course', monthly: 'per month',
  })[payoutType] || payoutType;

  const totalHours = Math.round(teachingStats.total_hours || 0);
  let totalPayout = 0;
  if (payoutType === 'per_hour') totalPayout = (teachingStats.total_hours || 0) * payoutRate;
  else if (payoutType === 'per_session') totalPayout = (teachingStats.total_sessions || 0) * payoutRate;
  else if (payoutType === 'per_course') totalPayout = courses.length * payoutRate;
  else totalPayout = payoutRate; // monthly flat rate

  return (
    <div className="portal-layout portal-tutor">
      <Sidebar activeTab={activeTab} onTabChange={(tab) => { setStudentDetail(null); setActiveTab(tab); }} />
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

        {activeTab === 'students' && !studentDetail && !studentDetailLoading && (
          <div className="portal-page">
            <h2>My Students</h2>
            <DataTable columns={studentColumns} data={students} onRowClick={openStudentDetail} />
          </div>
        )}

        {activeTab === 'students' && studentDetailLoading && (
          <div className="portal-page"><div className="spinner" /><p>Loading student…</p></div>
        )}

        {activeTab === 'students' && studentDetail && (
          <div className="portal-page">
            <button className="btn btn-ghost" onClick={() => setStudentDetail(null)} style={{ marginBottom: '1rem' }}>← Back to Students</button>

            <div className="page-header" style={{ alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  className="avatar"
                  style={{
                    width: '64px', height: '64px', fontSize: '24px',
                    backgroundColor: studentDetail.profile.avatar_color || '#4F46E5',
                    backgroundImage: studentDetail.profile.avatar_url ? `url(${studentDetail.profile.avatar_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    color: studentDetail.profile.avatar_url ? 'transparent' : '#fff',
                  }}
                >
                  {!studentDetail.profile.avatar_url && studentDetail.profile.name?.[0]}
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>{studentDetail.profile.name}</h2>
                  <div style={{ color: 'var(--color-text-secondary)' }}>{studentDetail.profile.email}</div>
                  <span className={`status-badge status-${studentDetail.profile.status}`}>{studentDetail.profile.status}</span>
                </div>
              </div>
            </div>

            <div className="kpi-grid" style={{ marginTop: '1rem' }}>
              <KPICard title="Enrolled Courses" value={studentDetail.stats.enrolled_courses} icon="book" color="#3B82F6" />
              <KPICard title="Avg Progress" value={`${studentDetail.stats.avg_progress}%`} icon="percent" color="#10B981" />
              <KPICard title="Sessions" value={studentDetail.stats.total_sessions} icon="video" color="#8B5CF6" />
              <KPICard title="Sessions Attended" value={studentDetail.stats.sessions_attended} icon="check-circle" color="#F59E0B" />
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Enrolled Courses</h3>
              {studentDetail.enrollments.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No enrollments.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'category', label: 'Category', accessor: 'category' },
                    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
                    { key: 'progress', label: 'Progress', accessor: 'progress_percentage', render: (r) => `${Math.round(r.progress_percentage || 0)}%` },
                    { key: 'grade', label: 'Grade', accessor: 'grade', render: (r) => r.grade || '-' },
                    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
                  ]}
                  data={studentDetail.enrollments}
                  searchable={false}
                />
              )}
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Sessions</h3>
              {studentDetail.sessions.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No sessions.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
                    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleString() },
                    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
                  ]}
                  data={studentDetail.sessions}
                  searchable={false}
                  pageSize={10}
                />
              )}
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Attendance</h3>
              {studentDetail.attendance.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No attendance records.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => r.start_time ? new Date(r.start_time).toLocaleDateString() : '-' },
                    { key: 'join', label: 'Joined', accessor: 'join_time', render: (r) => r.join_time ? new Date(r.join_time).toLocaleTimeString() : '-' },
                    { key: 'leave', label: 'Left', accessor: 'leave_time', render: (r) => r.leave_time ? new Date(r.leave_time).toLocaleTimeString() : '—' },
                    { key: 'duration', label: 'Duration', accessor: 'duration_minutes', render: (r) => r.duration_minutes ? `${r.duration_minutes} min` : '—' },
                  ]}
                  data={studentDetail.attendance}
                  searchable={false}
                  pageSize={10}
                />
              )}
            </div>
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

        {activeTab === 'availability' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>My Availability</h2>
              <button className="btn btn-primary" onClick={() => setShowAvailForm(true)}>+ Add Slot</button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Publish the times you're free. Students can book an open slot, which creates a 1-on-1 session you both can join.
            </p>

            {showAvailForm && (
              <div className="modal-overlay" onClick={() => setShowAvailForm(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Add Availability Slot</h3>
                  <form onSubmit={handleCreateAvailability}>
                    <div className="form-group">
                      <label>Start Time</label>
                      <input type="datetime-local" value={availForm.start_time} onChange={(e) => setAvailForm({ ...availForm, start_time: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>End Time</label>
                      <input type="datetime-local" value={availForm.end_time} onChange={(e) => setAvailForm({ ...availForm, end_time: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Note (optional)</label>
                      <input type="text" maxLength={255} placeholder="e.g. Doubt-clearing, Algebra" value={availForm.note} onChange={(e) => setAvailForm({ ...availForm, note: e.target.value })} />
                    </div>
                    <div className="form-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowAvailForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary">Add</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {availSlots.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No slots yet. Add one so students can book you.</p>
            ) : (
              <DataTable
                columns={[
                  { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleDateString() },
                  { key: 'time', label: 'Time', accessor: 'start_time', render: (r) => `${new Date(r.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(r.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
                  { key: 'note', label: 'Note', accessor: 'note', render: (r) => r.note || '—' },
                  { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status === 'open' ? 'active' : r.status === 'booked' ? 'live' : 'inactive'}`}>{r.status}</span> },
                  { key: 'booked_by', label: 'Booked By', accessor: 'student_name', render: (r) => r.student_name || '—' },
                  { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                    r.status === 'booked'
                      ? <button className="btn btn-sm btn-primary" onClick={() => handleJoinSession({ session_id: r.session_id, start_time: r.start_time, end_time: r.end_time })}>Join</button>
                      : <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSlot(r)}>Remove</button>
                  )},
                ]}
                data={availSlots}
                searchable={false}
              />
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="portal-page">
            <h2>Attendance Records</h2>
            {attendance.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No attendance recorded yet. Records appear once students join your sessions.</p>
            ) : (
              <DataTable
                columns={[
                  { key: 'student', label: 'Student', accessor: 'student_name', render: (r) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.student_name?.[0]}</div>
                      {r.student_name}
                    </div>
                  )},
                  { key: 'course', label: 'Course', accessor: 'course_name' },
                  { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => r.start_time ? new Date(r.start_time).toLocaleDateString() : '-' },
                  { key: 'join', label: 'Joined', accessor: 'join_time', render: (r) => r.join_time ? new Date(r.join_time).toLocaleTimeString() : '-' },
                  { key: 'leave', label: 'Left', accessor: 'leave_time', render: (r) => r.leave_time ? new Date(r.leave_time).toLocaleTimeString() : '—' },
                  { key: 'duration', label: 'Duration', accessor: 'duration_minutes', render: (r) => r.duration_minutes ? `${r.duration_minutes} min` : '—' },
                ]}
                data={attendance}
                searchable={true}
              />
            )}
          </div>
        )}

        {activeTab === 'payouts' && (
          <div className="portal-page">
            <h2>Payouts & Earnings</h2>
            <div className="kpi-grid">
              <KPICard title="Total Hours" value={`${totalHours}h`} icon="clock" color="#3B82F6" />
              <KPICard title="Payout Rate" value={formatMoney(payoutRate)} subtitle={payoutUnitLabel} icon="dollar" color="#10B981" />
              <KPICard title="Total Earned" value={formatMoney(totalPayout)} subtitle={payoutType === 'monthly' ? 'current month' : undefined} icon="dollar" color="#F59E0B" />
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
                    if (payoutType === 'per_hour') {
                      const hours = (new Date(r.end_time) - new Date(r.start_time)) / 3600000;
                      return formatMoney(hours * payoutRate);
                    }
                    if (payoutType === 'per_session') return formatMoney(payoutRate);
                    return '—';
                  }},
                ]}
                data={sessions.filter((s) => s.conducted || s.status === 'completed')}
                searchable={false}
              />
            </div>
          </div>
        )}

        {activeTab === 'recordings' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Recordings</h2>
              <button className="btn btn-ghost" onClick={loadRecordings}>↻ Refresh</button>
            </div>
            {recordings.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>
                No recordings yet. Click the ⏺ Record button during a LiveKit session to capture and save one here.
              </p>
            ) : (
              <DataTable
                columns={[
                  { key: 'course', label: 'Course', accessor: 'course_name' },
                  { key: 'date', label: 'Recorded', accessor: 'creation_date', render: (r) => r.creation_date ? new Date(r.creation_date).toLocaleString() : '-' },
                  { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => setPlayUrl(r.playback_url)}>▶ Play</button>
                      <a className="btn btn-sm btn-ghost" href={r.playback_url} download>⬇ Download</a>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteRecording(r.record_id)}>🗑 Delete</button>
                    </div>
                  )},
                ]}
                data={recordings}
                searchable={false}
              />
            )}

            {playUrl && (
              <div className="modal-overlay" onClick={() => setPlayUrl(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '860px', width: '100%' }}>
                  <div className="page-header" style={{ alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Recording</h3>
                    <button className="btn btn-ghost" onClick={() => setPlayUrl(null)}>✕ Close</button>
                  </div>
                  <video src={playUrl} controls autoPlay style={{ width: '100%', borderRadius: '8px', background: '#000' }} />
                  <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                    <a className="btn btn-ghost" href={playUrl} download>⬇ Download</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
