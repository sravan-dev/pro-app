import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import usePersistedTab from '../hooks/usePersistedTab';
import { MainSkeleton } from '../components/Skeleton';

export default function AdvisorPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = usePersistedTab('tab:advisor');
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
    <div className="portal-layout portal-advisor">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton kpis={4} /></main>
    </div>
  );

  const students = data?.students || [];
  const atRisk = data?.at_risk || [];
  const totalStudents = students.length;
  const avgProgress = students.length
    ? Math.round(students.reduce((s, st) => s + parseFloat(st.avg_progress || 0), 0) / students.length)
    : 0;

  const studentColumns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'courses', label: 'Courses', accessor: 'enrolled_courses' },
    { key: 'progress', label: 'Avg Progress', accessor: 'avg_progress', render: (r) => (
      <div className="progress-bar-inline">
        <div className="progress-fill" style={{ width: `${r.avg_progress || 0}%`, backgroundColor: (r.avg_progress || 0) < 40 ? '#EF4444' : '#10B981' }} />
        <span>{Math.round(r.avg_progress || 0)}%</span>
      </div>
    )},
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => (
      <span className={`status-dot ${(r.avg_progress || 0) < 40 ? 'status-at-risk' : 'status-active'}`}>
        {(r.avg_progress || 0) < 40 ? 'At Risk' : r.status}
      </span>
    )},
  ];

  return (
    <div className="portal-layout portal-advisor">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <h2>Advisor Dashboard</h2>
            <div className="kpi-grid">
              <KPICard title="Total Students" value={totalStudents} icon="users" color="#3B82F6" />
              <KPICard title="At-Risk Students" value={atRisk.length} icon="alert" color="#EF4444" />
              <KPICard title="Avg Progress" value={`${avgProgress}%`} icon="trending-up" color="#10B981" />
              <KPICard title="Total Courses" value={data?.courses?.length || 0} icon="book" color="#8B5CF6" />
            </div>

            {atRisk.length > 0 && (
              <div className="section">
                <h3>At-Risk Students (Progress &lt; 40%)</h3>
                <div className="at-risk-list">
                  {atRisk.map((s) => (
                    <div key={s.id} className="at-risk-card">
                      <div className="avatar-sm" style={{ backgroundColor: s.avatar_color }}>{s.name?.[0]}</div>
                      <div>
                        <strong>{s.name}</strong>
                        <p>{s.email}</p>
                      </div>
                      <div className="at-risk-progress">
                        <span className="text-danger">{Math.round(s.avg_progress)}% avg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'students' && (
          <div className="portal-page">
            <h2>All Students</h2>
            <DataTable columns={studentColumns} data={students} pageSize={15} />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="portal-page">
            <h2>Reports & Analytics</h2>
            {reports && (
              <>
                <div className="kpi-grid">
                  <KPICard title="Active Students" value={reports.active_students} icon="users" color="#10B981" />
                  <KPICard title="Active Enrollments" value={reports.active_enrollments} icon="layers" color="#3B82F6" />
                  <KPICard title="Completed" value={reports.completed_enrollments} icon="check-circle" color="#8B5CF6" />
                  <KPICard title="Avg Progress" value={`${reports.avg_progress}%`} icon="trending-up" color="#F59E0B" />
                  <KPICard title="Attendance Rate" value={`${reports.avg_attendance_rate}%`} icon="percent" color="#06B6D4" />
                  <KPICard title="Sessions Done" value={reports.completed_sessions} icon="video" color="#EC4899" />
                </div>

                <div className="section">
                  <h3>Courses by Category</h3>
                  <div className="stats-bars">
                    {reports.courses_by_category?.map((c) => (
                      <div key={c.category} className="stats-bar-item">
                        <span className="stats-bar-label">{c.category}</span>
                        <div className="stats-bar"><div className="stats-bar-fill" style={{ width: `${(c.count / (reports.total_courses || 1)) * 100}%` }} /></div>
                        <span className="stats-bar-value">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section">
                  <h3>Grade Distribution</h3>
                  <div className="grade-chips">
                    {reports.grade_distribution?.map((g) => (
                      <div key={g.grade} className="grade-chip">
                        <span className="grade-label">{g.grade}</span>
                        <span className="grade-count">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
