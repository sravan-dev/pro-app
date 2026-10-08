import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import KPICard from './KPICard';

// Admin → Tutors → click a tutor: their full profile. Actions reuse the
// handlers from the Tutors table (Edit / Invite / Blacklist).
const muted = { color: 'var(--color-text-secondary)' };
const fmtDate = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString() : '—');
const fmtDateTime = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString() : '—');
const statusCol = (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span>;

export default function TutorProfile({ tutorId, onBack, onEdit, onInvite, onBlacklist, onUnblacklist }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTutorDetail(tutorId).then(setData).catch((err) => setError(err.message || 'Failed to load tutor'));
  }, [tutorId]);

  const back = <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back to Tutors</button>;
  if (error) return <div className="portal-page">{back}<div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="portal-page">{back}<div className="spinner" /><p>Loading tutor…</p></div>;

  const { profile: p, stats, courses, students, sessions, application: app } = data;
  const blacklisted = p.status === 'blacklisted';

  return (
    <div className="portal-page">
      {back}

      <div className="page-header" style={{ alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            className="avatar"
            style={{
              width: 64, height: 64, fontSize: 24,
              backgroundColor: p.avatar_color || '#4F46E5',
              backgroundImage: p.avatar_url ? `url(${p.avatar_url})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              color: p.avatar_url ? 'transparent' : '#fff',
            }}
          >
            {!p.avatar_url && p.name?.[0]}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{p.name}</h2>
            <div style={muted}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
            <span className={`status-dot status-${p.status}`}>{p.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" style={{ color: '#10B981' }} onClick={() => onInvite(p)}>Invite</button>
          <button className="btn btn-ghost" onClick={() => onEdit({ ...p, role: 'tutor' })}>Edit</button>
          {blacklisted
            ? <button className="btn btn-ghost" style={{ fontWeight: 600 }} onClick={() => onUnblacklist(p)}>Remove blacklist</button>
            : <button className="btn btn-ghost" style={{ fontWeight: 600, color: '#111827' }} onClick={() => onBlacklist(p)}>Blacklist</button>}
        </div>
      </div>

      {blacklisted && (
        <div className="alert alert-error" style={{ cursor: 'default' }}>
          <strong>Blacklisted</strong>{p.blacklisted_at && ` on ${fmtDate(p.blacklisted_at)}`}{p.blacklisted_by_name && ` by ${p.blacklisted_by_name}`}: {p.blacklist_reason || 'no reason recorded'}
        </div>
      )}

      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <KPICard title="Courses" value={stats.courses} icon="book" color="#3B82F6" />
        <KPICard title="Students" value={stats.students} icon="users" color="#10B981" />
        <KPICard title="Sessions" value={`${stats.completed_sessions} / ${stats.sessions}`} icon="video" color="#8B5CF6" />
        <KPICard title="Rating" value={stats.rating != null ? `${stats.rating} ★ (${stats.rating_count})` : '—'} icon="star" color="#F59E0B" />
      </div>

      <div className="section" style={{ marginTop: '1.5rem' }}>
        <h3>Details</h3>
        <Info rows={[
          ['Team', p.team_name],
          ['Specialization', p.specialization],
          ['Gender', p.gender],
          ['Pay', p.payout_type === 'shift' ? 'Per hour, by shift rate' : `₹${p.payout_rate} / ${p.payout_type}`],
          ['Joined', fmtDate(p.created_at)],
        ]} />
      </div>

      {app && (
        <div className="section" style={{ marginTop: '1.5rem' }}>
          <h3>Application</h3>
          <Info rows={[
            ['Applied for', `${app.position} · ${fmtDate(app.created_at)}`],
            ['Experience', app.total_experience],
            ['Last employer', [app.current_designation, app.current_employer].filter(Boolean).join(', ')],
            ['Expected CTC', app.expected_ctc],
            ['Notice period', app.notice_period],
            ['Qualifications', app.education.map((e) => [e.qualification, e.institution, e.year].filter(Boolean).join(', ')).join('\n')],
          ]} />
          {app.has_resume && (
            <a className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} href={api.tutorApplicationFileUrl(app.id, 'resume')} target="_blank" rel="noreferrer">Open CV</a>
          )}
        </div>
      )}

      <div className="section" style={{ marginTop: '1.5rem' }}>
        <h3>Courses</h3>
        {courses.length === 0 ? <p style={muted}>No courses.</p> : (
          <DataTable
            columns={[
              { key: 'name', label: 'Course', accessor: 'name' },
              { key: 'category', label: 'Category', accessor: 'category' },
              { key: 'students', label: 'Students', accessor: 'student_count' },
              { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
            ]}
            data={courses}
            searchable={false}
          />
        )}
      </div>

      <div className="section" style={{ marginTop: '1.5rem' }}>
        <h3>Students</h3>
        {students.length === 0 ? <p style={muted}>No students assigned.</p> : (
          <DataTable
            columns={[
              { key: 'name', label: 'Student', accessor: 'name' },
              { key: 'email', label: 'Email', accessor: 'email' },
              { key: 'relation', label: 'Tutor role', accessor: 'relation' },
              { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
            ]}
            data={students}
            searchable={students.length > 10}
            pageSize={10}
          />
        )}
      </div>

      <div className="section" style={{ marginTop: '1.5rem' }}>
        <h3>Recent sessions</h3>
        {sessions.length === 0 ? <p style={muted}>No sessions.</p> : (
          <DataTable
            columns={[
              { key: 'course', label: 'Course', accessor: 'course_name' },
              { key: 'student', label: 'Student', accessor: 'student_name', render: (r) => r.student_name || <span style={muted}>Group</span> },
              { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => fmtDateTime(r.start_time) },
              { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
            ]}
            data={sessions}
            searchable={false}
            pageSize={10}
          />
        )}
      </div>
    </div>
  );
}

function Info({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 180px) 1fr', gap: '0.4rem 1rem', fontSize: '0.9rem', background: 'var(--color-surface)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)' }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <div style={muted}>{k}</div>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v || '—'}</div>
        </React.Fragment>
      ))}
    </div>
  );
}
