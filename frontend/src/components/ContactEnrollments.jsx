import React, { useState, useEffect } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Shared "Enrolls" tab — lists contact enrollment intimations created when a
// superadmin enrolls a HubSpot contact. Shown to managers & advisors.
export default function ContactEnrollments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.getContactEnrollments()
      .then((r) => { setRows(r); setError(''); })
      .catch((err) => setError(err.message || 'Failed to load enrollments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'name', label: 'Contact', accessor: 'contact_name', render: (r) => <strong>{r.contact_name || '—'}</strong> },
    { key: 'email', label: 'Email', accessor: 'contact_email', render: (r) => r.contact_email || '—' },
    { key: 'phone', label: 'Phone', accessor: 'contact_phone', render: (r) => r.contact_phone || '—' },
    { key: 'company', label: 'Company', accessor: 'contact_company', render: (r) => r.contact_company || '—' },
    { key: 'stage', label: 'Stage', accessor: 'contact_stage', render: (r) => r.contact_stage
      ? <span style={{ padding: '2px 10px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', color: '#6366F1', fontSize: 12, fontWeight: 600 }}>{r.contact_stage}</span>
      : '—' },
    { key: 'by', label: 'Enrolled By', accessor: 'enrolled_by_name', render: (r) => r.enrolled_by_name || '—' },
    { key: 'date', label: 'Date', accessor: 'created_at', render: (r) => r.created_at ? new Date(r.created_at.replace(' ', 'T')).toLocaleString() : '—' },
  ];

  return (
    <div className="portal-page">
      <div className="page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>Enrolls</h2>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            New enrollments from the HubSpot Contacts module.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>↻ Refresh</button>
      </div>
      {error && <div style={{ color: '#dc2626', margin: '8px 0' }}>{error}</div>}
      {loading ? <div className="spinner" /> : <DataTable columns={columns} data={rows} pageSize={15} />}
    </div>
  );
}
