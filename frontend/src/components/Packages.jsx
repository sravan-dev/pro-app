import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import { formatMoney } from '../utils/money';

// Admin + manager → Packages: priced course offerings (number of classes,
// minutes per class, validity, price). Both can add, edit and archive; only
// the superadmin can delete a package outright (canDelete).
const CLASS_TYPES = { one_to_one: '1-on-1', group: 'Group' };
const muted = { color: 'var(--color-text-secondary)' };
const emptyForm = () => ({
  name: '', course_id: '', class_type: 'one_to_one', sessions_count: 10, session_minutes: 60,
  validity_days: 30, price: 0, description: '', status: 'active',
});

export default function Packages({ showMsg, canDelete = false }) {
  const [packages, setPackages] = useState(null); // null until loaded
  const [loadError, setLoadError] = useState('');
  const [courses, setCourses] = useState([]);
  const [currency, setCurrency] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null); // fields while the modal is open, null = closed
  const [editing, setEditing] = useState(null); // package being edited, null = adding
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.getPackages()
      .then((rows) => { setPackages(rows); setLoadError(''); })
      .catch((e) => setLoadError(e.message || 'Could not load packages'));
  }, []);

  useEffect(() => {
    load();
    api.getCourses().then(setCourses).catch(() => {});
    api.getAppSettings().then((s) => setCurrency(s.currency || '')).catch(() => {});
  }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name, course_id: p.course_id ? String(p.course_id) : '', class_type: p.class_type,
      sessions_count: p.sessions_count, session_minutes: p.session_minutes, validity_days: p.validity_days,
      price: Number(p.price) || 0, description: p.description || '', status: p.status,
    });
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updatePackage({ id: editing.id, ...form });
        showMsg?.('Package updated', 'success');
      } else {
        await api.createPackage(form);
        showMsg?.('Package created', 'success');
      }
      setForm(null);
      load();
    } catch (err) {
      showMsg?.(err.message || 'Failed to save package', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (p, status) => {
    try {
      await api.updatePackage({ id: p.id, status });
      showMsg?.(status === 'archived' ? `${p.name} archived` : `${p.name} restored`, 'success');
      load();
    } catch (err) { showMsg?.(err.message, 'error'); }
  };

  const remove = async (p) => {
    if (!confirm(`Delete the package "${p.name}"? This cannot be undone.`)) return;
    try { await api.deletePackage(p.id); showMsg?.('Package deleted', 'success'); load(); }
    catch (err) { showMsg?.(err.message, 'error'); }
  };

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const columns = [
    { key: 'name', label: 'Package', accessor: 'name', render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.name}</div>
        {r.description && (
          <div title={r.description} style={{ ...muted, fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
        )}
      </div>
    ) },
    { key: 'course', label: 'Course', accessor: 'course_name', render: (r) => r.course_name || <span style={muted}>—</span> },
    { key: 'type', label: 'Type', accessor: 'class_type', render: (r) => CLASS_TYPES[r.class_type] || r.class_type },
    { key: 'classes', label: 'Classes', accessor: 'sessions_count', render: (r) => (
      <span style={{ whiteSpace: 'nowrap' }}>{r.sessions_count} × {r.session_minutes} min</span>
    ) },
    { key: 'validity', label: 'Validity', accessor: 'validity_days', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.validity_days} days</span> },
    { key: 'price', label: 'Price', accessor: (r) => Number(r.price) || 0, render: (r) => <strong style={{ whiteSpace: 'nowrap' }}>{formatMoney(r.price, currency)}</strong> },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-ghost" onClick={stop(() => openEdit(r))}>Edit</button>
        {r.status === 'archived'
          ? <button className="btn btn-sm btn-ghost" style={{ color: '#10B981' }} onClick={stop(() => setStatus(r, 'active'))}>Restore</button>
          : <button className="btn btn-sm btn-ghost text-danger" onClick={stop(() => setStatus(r, 'archived'))}>Archive</button>}
        {canDelete && <button className="btn btn-sm btn-ghost text-danger" onClick={stop(() => remove(r))}>Delete</button>}
      </div>
    ) },
  ];

  const archivedCount = (packages || []).filter((p) => p.status === 'archived').length;
  const visible = (packages || []).filter((p) => showArchived || p.status !== 'archived');

  // Course picker: active courses (the hidden __test_call__ draft left out),
  // plus the package's current course so an edit keeps its value.
  const courseOptions = courses.filter((c) => (c.status === 'active' && !c.name.startsWith('__')) || String(c.id) === form?.course_id);

  return (
    <div className="portal-page">
      <div className="page-header">
        <h2>Packages</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Package</button>
      </div>
      <p style={{ ...muted, marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Course packages with their classes, validity and price.
        {archivedCount > 0 && (
          <label style={{ marginLeft: '1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Show archived ({archivedCount})
          </label>
        )}
      </p>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {packages === null && !loadError && <p className="empty-state">Loading packages…</p>}
      {packages && (visible.length === 0
        ? <p className="empty-state">{packages.length === 0 ? 'No packages yet. Add one with + Add Package.' : 'No active packages.'}</p>
        : <DataTable columns={columns} data={visible} pageSize={15} onRowClick={openEdit} />)}

      {form && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3>{editing ? 'Edit Package' : 'Add Package'}</h3>
            <form onSubmit={save}>
              <div className="form-group">
                <label>Package name *</label>
                <input value={form.name} onChange={set('name')} placeholder="e.g. IELTS 1-on-1 — 20 classes" maxLength={200} required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Course</label>
                  <select value={form.course_id} onChange={set('course_id')}>
                    <option value="">— Not linked —</option>
                    {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class type</label>
                  <select value={form.class_type} onChange={set('class_type')}>
                    {Object.entries(CLASS_TYPES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Number of classes *</label>
                  <input type="number" min="0" step="1" value={form.sessions_count} onChange={set('sessions_count')} required />
                </div>
                <div className="form-group">
                  <label>Minutes per class *</label>
                  <input type="number" min="0" step="5" value={form.session_minutes} onChange={set('session_minutes')} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Validity (days) *</label>
                  <input type="number" min="0" step="1" value={form.validity_days} onChange={set('validity_days')} required />
                </div>
                <div className="form-group">
                  <label>Price{currency ? ` (${currency})` : ''} *</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={form.description} onChange={set('description')} rows={3} maxLength={5000} placeholder="What's included, schedule, notes…" />
              </div>
              {editing && (
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add Package'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
