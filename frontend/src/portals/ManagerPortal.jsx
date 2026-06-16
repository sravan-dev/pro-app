import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import ContactEnrollments from '../components/ContactEnrollments';
import usePersistedTab from '../hooks/usePersistedTab';
import { MainSkeleton } from '../components/Skeleton';

export default function ManagerPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('tab:manager');
  const [data, setData] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [portalData, reportData] = await Promise.all([
          api.portalData(),
          api.reports(),
        ]);
        setData(portalData);
        setReports(reportData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div className="portal-layout portal-manager">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton kpis={4} /></main>
    </div>
  );

  const stats = data?.stats || {};
  const tutors = data?.tutors || [];
  const courses = data?.courses || [];

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

        {activeTab === 'enrolls' && <ContactEnrollments />}

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
      </main>
    </div>
  );
}
