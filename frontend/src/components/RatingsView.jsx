import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import StarRating from './StarRating';

// Aggregated ratings view, shared by Superadmin (all) and Manager (their team).
// The backend scopes the data by role, so this component is identical for both.
export default function RatingsView() {
  const [data, setData] = useState({ people: [], detail: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // ratee id for detail panel

  const load = () => {
    setLoading(true);
    api.getRatings()
      .then((d) => { setData(d); setError(''); })
      .catch((err) => setError(err.message || 'Failed to load ratings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div> },
    { key: 'name', label: 'Person', accessor: 'name', render: (r) => <strong>{r.name}</strong> },
    { key: 'role', label: 'Role', accessor: 'role', render: (r) => <span style={{ textTransform: 'capitalize' }}>{r.role}</span> },
    { key: 'avg', label: 'Avg Rating', accessor: 'avg_stars', render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <StarRating value={Math.round(r.avg_stars)} readOnly size={16} />
        <span style={{ fontWeight: 600 }}>{Number(r.avg_stars).toFixed(2)}</span>
      </span>
    )},
    { key: 'count', label: 'Ratings', accessor: 'rating_count' },
  ];

  const detailFor = (id) => data.detail.filter((d) => d.ratee_id === id);

  return (
    <div className="portal-page">
      <div className="page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>Ratings</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Student feedback for managers, advisors and tutors.</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>
      {error && <div style={{ color: '#dc2626', margin: '8px 0' }}>{error}</div>}
      {loading ? <div className="spinner" /> : (
        <>
          <DataTable columns={columns} data={data.people} pageSize={15} onRowClick={(r) => setSelected(selected === r.id ? null : r.id)} />
          {selected && (
            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Individual ratings</h3>
              {detailFor(selected).length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>No ratings yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detailFor(selected).map((d, i) => (
                    <div key={i} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{d.student_name}</strong>
                        <StarRating value={d.stars} readOnly size={16} />
                      </div>
                      {d.comment && <p style={{ margin: '6px 0 0', color: 'var(--color-text-secondary)' }}>{d.comment}</p>}
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{d.updated_at ? new Date(d.updated_at.replace(' ', 'T')).toLocaleString() : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
