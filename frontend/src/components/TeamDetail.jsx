import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import KPICard from './KPICard';

// Admin → Teams → click a team: the team's hierarchy.
// Manager → advisors → the students each advisor handles, plus the team's
// tutors with their assigned students and a full student table.
const muted = { color: 'var(--color-text-secondary)' };
const statusCol = (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span>;

function Avatar({ person, size = 36 }) {
  return (
    <div
      className="avatar"
      style={{
        width: size, height: size, fontSize: size * 0.4, flexShrink: 0,
        backgroundColor: person.avatar_color || '#4F46E5',
        backgroundImage: person.avatar_url ? `url(${person.avatar_url})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
        color: person.avatar_url ? 'transparent' : '#fff',
      }}
    >
      {!person.avatar_url && person.name?.[0]}
    </div>
  );
}

function PersonNode({ person, role, count, countLabel }) {
  return (
    <div className="team-node-head">
      <Avatar person={person} />
      <div style={{ minWidth: 0 }}>
        <div className="team-node-role">{role}</div>
        <div className="team-node-name">{person.name}</div>
        <div className="team-node-meta">{person.email}{person.phone ? ` · ${person.phone}` : ''}</div>
      </div>
      {count != null && <span className="team-node-count" title={countLabel}>{count}</span>}
    </div>
  );
}

function StudentList({ students }) {
  if (!students.length) return <div className="team-node-empty">No students</div>;
  return (
    <ul className="team-student-list">
      {students.map((s) => (
        <li key={s.id}>
          <Avatar person={s} size={24} />
          <span className="team-student-name">{s.name}</span>
          {s.avg_progress != null && <span className="team-student-progress">{s.avg_progress}%</span>}
        </li>
      ))}
    </ul>
  );
}

function Branch({ person, role, students, emptyRole }) {
  const [open, setOpen] = useState(students.length > 0 && students.length <= 8);
  return (
    <div className="team-node">
      {person
        ? <PersonNode person={person} role={role} count={students.length} countLabel="Students" />
        : (
          <div className="team-node-head">
            <div className="avatar" style={{ width: 36, height: 36, background: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>?</div>
            <div>
              <div className="team-node-role">{role}</div>
              <div className="team-node-name">{emptyRole}</div>
            </div>
            <span className="team-node-count">{students.length}</span>
          </div>
        )}
      {students.length > 0 && (
        <button className="team-node-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide students' : `Show ${students.length} student${students.length === 1 ? '' : 's'}`}
        </button>
      )}
      {(open || !students.length) && <StudentList students={students} />}
    </div>
  );
}

export default function TeamDetail({ teamId, onBack, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTeamDetail(teamId).then(setData).catch((err) => setError(err.message || 'Failed to load team'));
  }, [teamId]);

  const back = <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back to Teams</button>;
  if (error) return <div className="portal-page">{back}<div className="alert alert-error">{error}</div></div>;
  if (!data) return <div className="portal-page">{back}<div className="spinner" /><p>Loading team…</p></div>;

  const { team, manager, advisors, tutors, students } = data;
  const byAdvisor = (id) => students.filter((s) => s.advisor_id === id);
  const byTutor = (id) => students.filter((s) => s.assigned_tutor_id === id);
  const advisorIds = new Set(advisors.map((a) => a.id));
  const noAdvisor = students.filter((s) => !s.advisor_id || !advisorIds.has(s.advisor_id));
  const tutorIds = new Set(tutors.map((t) => t.id));
  const noTutor = students.filter((s) => !s.assigned_tutor_id || !tutorIds.has(s.assigned_tutor_id));

  const studentColumns = [
    { key: 'name', label: 'Student', accessor: 'name', render: (r) => <strong>{r.name}</strong> },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'advisor', label: 'Advisor', accessor: 'advisor_name', render: (r) => r.advisor_name || <span style={muted}>—</span> },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name', render: (r) => r.tutor_name || <span style={muted}>—</span> },
    { key: 'courses', label: 'Courses', accessor: 'course_names', render: (r) => r.course_names || <span style={muted}>—</span> },
    { key: 'progress', label: 'Progress', accessor: 'avg_progress', render: (r) => (r.avg_progress != null ? `${r.avg_progress}%` : '—') },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
  ];

  return (
    <div className="portal-page">
      {back}

      <div className="page-header" style={{ alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{team.name}</h2>
          <span className={`status-dot status-${team.status}`}>{team.status}</span>
        </div>
        {onEdit && <button className="btn btn-ghost" onClick={() => onEdit(team)}>Edit Team</button>}
      </div>

      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <KPICard title="Advisors" value={advisors.length} icon="users" color="#8B5CF6" />
        <KPICard title="Tutors" value={tutors.length} icon="book" color="#10B981" />
        <KPICard title="Students" value={students.length} icon="award" color="#3B82F6" />
        <KPICard title="Without advisor" value={noAdvisor.length} icon="alert" color="#F59E0B" />
      </div>

      <div className="section">
        <h3>Hierarchy</h3>
        <div className="team-tree">
          <div className="team-tree-root">
            <div className="team-node team-node-manager">
              {manager
                ? <PersonNode person={manager} role="Manager" />
                : <div className="team-node-head"><div><div className="team-node-role">Manager</div><div className="team-node-name" style={muted}>Unassigned</div></div></div>}
            </div>
          </div>

          <div className="team-tree-level-label">Advisors &amp; their students</div>
          <div className="team-tree-children">
            {advisors.map((a) => (
              <Branch key={a.id} person={a} role="Advisor" students={byAdvisor(a.id)} />
            ))}
            {noAdvisor.length > 0 && <Branch role="Advisor" emptyRole="No advisor assigned" students={noAdvisor} />}
            {!advisors.length && !noAdvisor.length && <div style={muted}>No advisors in this team yet.</div>}
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Tutors &amp; assigned students</h3>
        <div className="team-tree-children team-tree-flat">
          {tutors.map((t) => (
            <Branch key={t.id} person={t} role={t.specialization ? `Tutor · ${t.specialization}` : 'Tutor'} students={byTutor(t.id)} />
          ))}
          {noTutor.length > 0 && <Branch role="Tutor" emptyRole="No tutor assigned" students={noTutor} />}
          {!tutors.length && !noTutor.length && <div style={muted}>No tutors in this team yet.</div>}
        </div>
      </div>

      <div className="section">
        <h3>All students</h3>
        <DataTable columns={studentColumns} data={students} pageSize={15} />
      </div>
    </div>
  );
}
