import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import ContactEnrollments from '../components/ContactEnrollments';
import Tickets from '../components/Tickets';
import RatingsView from '../components/RatingsView';
import usePersistedTab from '../hooks/usePersistedTab';
import { MainSkeleton } from '../components/Skeleton';

export default function ManagerPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('tab:manager');
  const [data, setData] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  // Assignment modal
  const [assignFor, setAssignFor] = useState(null); // the student row being assigned
  const [assignForm, setAssignForm] = useState({ advisor_id: '', assigned_tutor_id: '' });
  const [assignBusy, setAssignBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const showMsg = (text, type = 'info') => { setMessage({ text, type }); setTimeout(() => setMessage(null), 4000); };

  const loadData = useCallback(async () => {
    try {
      const [portalData, reportData] = await Promise.all([api.portalData(), api.reports()]);
      setData(portalData);
      setReports(reportData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAssign = (student) => {
    setAssignFor(student);
    setAssignForm({ advisor_id: student.advisor_id || '', assigned_tutor_id: student.assigned_tutor_id || '' });
  };

  const saveAssign = async () => {
    setAssignBusy(true);
    try {
      await api.assignStudent({
        student_id: assignFor.id,
        advisor_id: assignForm.advisor_id || '',
        assigned_tutor_id: assignForm.assigned_tutor_id || '',
      });
      showMsg(`Assignment saved for ${assignFor.name}.`, 'success');
      setAssignFor(null);
      await loadData();
    } catch (err) {
      showMsg(err.message || 'Failed to save assignment', 'error');
    } finally {
      setAssignBusy(false);
    }
  };

  if (loading) return (
    <div className="portal-layout portal-manager">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton kpis={4} /></main>
    </div>
  );

  const stats = data?.stats || {};
  const tutors = data?.tutors || [];
  const courses = data?.courses || [];
  const teamStudents = data?.team_students || [];
  const teamAdvisors = data?.team_advisors || [];
  const teamTutors = data?.team_tutors || [];

  const assignColumns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Student', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'team', label: 'Team', accessor: 'team_name', render: (r) => r.team_name || '—' },
    { key: 'advisor', label: 'Advisor', accessor: 'advisor_name', render: (r) => r.advisor_name || <span style={{ color: 'var(--color-text-secondary)' }}>Unassigned</span> },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name', render: (r) => r.tutor_name || <span style={{ color: 'var(--color-text-secondary)' }}>Unassigned</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openAssign(r); }}>Assign</button>
    )},
  ];

  const tutorColumns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'specialization', label: 'Specialization', accessor: 'specialization' },
    { key: 'courses', label: 'Courses', accessor: 'course_count' },
    { key: 'students', label: 'Students', accessor: 'total_students' },
    { key: 'sessions', label: 'Sessions Done', accessor: 'sessions_completed' },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span> },
  ];

  const courseColumns = [
    { key: 'name', label: 'Course', accessor: 'name' },
    { key: 'category', label: 'Category', accessor: 'category' },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
    { key: 'students', label: 'Students', accessor: 'students_count' },
    { key: 'progress', label: 'Progress', accessor: 'progress', render: (r) => (
      <div className="progress-bar-inline"><div className="progress-fill" style={{ width: `${r.progress}%` }} /><span>{Math.round(r.progress)}%</span></div>
    )},
    { key: 'status', label: 'Status', accessor: 'status' },
  ];

  return (
    <div className="portal-layout portal-manager">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>}

        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <h2>Operations Dashboard</h2>
            <div className="kpi-grid">
              <KPICard title="Total Students" value={stats.total_students} icon="users" color="#3B82F6" />
              <KPICard title="Total Tutors" value={stats.total_tutors} icon="users" color="#10B981" />
              <KPICard title="Active Courses" value={stats.total_courses} icon="book" color="#8B5CF6" />
              <KPICard title="Enrollments" value={stats.total_enrollments} icon="layers" color="#F59E0B" />
              <KPICard title="Total Sessions" value={stats.total_sessions} icon="video" color="#06B6D4" />
              <KPICard title="Completed Sessions" value={stats.completed_sessions} icon="check-circle" color="#EC4899" />
            </div>

            {data?.enrollment_by_category && (
              <div className="section">
                <h3>Enrollment by Category</h3>
                <div className="stats-bars">
                  {data.enrollment_by_category.map((c) => (
                    <div key={c.category} className="stats-bar-item">
                      <span className="stats-bar-label">{c.category}</span>
                      <div className="stats-bar">
                        <div className="stats-bar-fill" style={{ width: `${(c.count / Math.max(...data.enrollment_by_category.map((x) => x.count), 1)) * 100}%` }} />
                      </div>
                      <span className="stats-bar-value">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="portal-page">
            <h2>Team Performance</h2>
            <DataTable columns={tutorColumns} data={tutors} />
          </div>
        )}

        {activeTab === 'myteam' && (
          <div className="portal-page">
            <h2>My Team</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Assign your team's students to an advisor and a tutor.
            </p>
            {teamStudents.length === 0 ? (
              <p className="empty-state">No students in your team yet. The superadmin assigns students to a team first.</p>
            ) : (
              <DataTable columns={assignColumns} data={teamStudents} pageSize={15} />
            )}
          </div>
        )}

        {activeTab === 'ratings' && <RatingsView />}

        {activeTab === 'enrolls' && <ContactEnrollments />}

        {activeTab === 'tickets' && <Tickets />}

        {activeTab === 'reports' && (
          <div className="portal-page">
            <h2>Operational Reports</h2>
            {reports && (
              <>
                <div className="kpi-grid">
                  <KPICard title="Total Students" value={reports.total_students} icon="users" color="#3B82F6" />
                  <KPICard title="Active Enrollments" value={reports.active_enrollments} icon="layers" color="#10B981" />
                  <KPICard title="Avg Progress" value={`${reports.avg_progress}%`} icon="trending-up" color="#F59E0B" />
                  <KPICard title="Attendance Rate" value={`${reports.avg_attendance_rate}%`} icon="percent" color="#8B5CF6" />
                </div>

                <div className="section">
                  <h3>Top Courses by Enrollment</h3>
                  <div className="stats-bars">
                    {reports.enrollments_by_course?.map((c) => (
                      <div key={c.name} className="stats-bar-item">
                        <span className="stats-bar-label">{c.name}</span>
                        <div className="stats-bar">
                          <div className="stats-bar-fill" style={{ width: `${(c.count / Math.max(...reports.enrollments_by_course.map((x) => x.count), 1)) * 100}%` }} />
                        </div>
                        <span className="stats-bar-value">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section">
                  <h3>All Courses</h3>
                  <DataTable columns={courseColumns} data={courses} />
                </div>
              </>
            )}
          </div>
        )}

        {assignFor && (
          <div className="modal-overlay" onClick={() => !assignBusy && setAssignFor(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <h3>Assign {assignFor.name}</h3>
              <div className="form-group">
                <label>Advisor</label>
                <select value={assignForm.advisor_id} onChange={(e) => setAssignForm({ ...assignForm, advisor_id: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {teamAdvisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tutor</label>
                <select value={assignForm.assigned_tutor_id} onChange={(e) => setAssignForm({ ...assignForm, assigned_tutor_id: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {teamTutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {teamAdvisors.length === 0 && teamTutors.length === 0 && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  No advisors or tutors are in your team yet — the superadmin adds them via the user form.
                </p>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setAssignFor(null)} disabled={assignBusy}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveAssign} disabled={assignBusy}>{assignBusy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
