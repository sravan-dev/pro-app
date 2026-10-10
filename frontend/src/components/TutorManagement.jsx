import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import DataTable from './DataTable';
import TutorApplications from './TutorApplications';
import TutorProfile from './TutorProfile';
import BlacklistModal from './BlacklistModal';
import usePersistedTab from '../hooks/usePersistedTab';

// Manager → Tutor Management: the same Tutors / Applications tabs the
// superadmin has, limited to tutor accounts (the server enforces that too).
const muted = { color: 'var(--color-text-secondary)' };
const avatarCol = (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div>;
const statusCol = (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span>;
const emptyForm = () => ({
  name: '', email: '', phone: '', role: 'tutor', password: '', avatar_color: '#4F46E5', gender: '',
  team_id: '', payout_type: 'shift', payout_rate: 0, shift_rates: null, course_id: '', new_course_name: '',
});

export default function TutorManagement({ showMsg }) {
  const [view, setView] = usePersistedTab('tab:manager:tutors', 'list');
  const [tutors, setTutors] = useState([]);
  const [teams, setTeams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currency, setCurrency] = useState('');
  const [shiftBands, setShiftBands] = useState([]);
  const [profileId, setProfileId] = useState(null);
  const [profileKey, setProfileKey] = useState(0); // bump to reload the open profile
  const [form, setForm] = useState(null); // tutor form fields while the modal is open
  const [editing, setEditing] = useState(null); // tutor being edited, null = adding
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blacklistTarget, setBlacklistTarget] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);

  const loadTutors = useCallback(() => api.getTutors().then(setTutors).catch(() => {}), []);
  const refresh = () => { loadTutors(); setProfileKey((k) => k + 1); };

  useEffect(() => {
    loadTutors();
    api.getTeams().then(setTeams).catch(() => {});
    api.getAppSettings().then((s) => setCurrency(s.currency || '')).catch(() => {});
  }, [loadTutors]);

  const formatMoney = (n) => `${currency} ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const loadFormLists = (userId) => {
    api.getShiftRates(userId).then(({ shifts, rates }) => {
      setShiftBands(shifts || []);
      setForm((f) => (f ? { ...f, shift_rates: rates || null } : f));
    }).catch(() => {});
    if (!courses.length) api.getCourses().then(setCourses).catch(() => {});
    if (!categories.length) api.getCategories().then(setCategories).catch(() => {});
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowPassword(false);
    loadFormLists();
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      ...emptyForm(), name: t.name, email: t.email, phone: t.phone || '', password: '', avatar_color: t.avatar_color,
      gender: t.gender || '', team_id: t.team_id || '', status: t.status,
      payout_type: t.payout_type || 'shift', payout_rate: t.payout_rate || 0,
    });
    setShowPassword(false);
    loadFormLists(t.id);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { course_id, new_course_name, ...payload } = form;
      let tutorId;
      if (editing) {
        await api.updateUser({ id: editing.id, ...payload });
        tutorId = editing.id;
      } else {
        tutorId = (await api.createUser(payload)).id;
      }
      // Course assignment: create the typed new course, or point the picked one at this tutor.
      if (new_course_name.trim()) {
        await api.createCourse({ name: new_course_name.trim(), category: categories[0]?.name || 'Technology', tutor_id: tutorId, color: '#3B82F6', icon: 'book' });
      } else if (course_id) {
        await api.updateCourse({ id: course_id, tutor_id: tutorId });
      }
      showMsg(editing ? 'Tutor updated' : 'Tutor created', 'success');
      setForm(null);
      refresh();
      if (course_id || new_course_name) api.getCourses().then(setCourses).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
    setSaving(false);
  };

  const invite = async (t) => {
    try { setInviteResult({ name: t.name, ...(await api.inviteUser(t.id)) }); }
    catch (err) { showMsg(err.message || 'Failed to send invite', 'error'); }
  };

  const deactivate = async (t) => {
    if (!confirm(`Deactivate ${t.name}?`)) return;
    try { await api.deleteUser(t.id); showMsg('Tutor deactivated', 'success'); refresh(); }
    catch (err) { showMsg(err.message, 'error'); }
  };

  const unblacklist = async (t) => {
    if (!confirm(`Remove ${t.name} from the blacklist? They will be able to sign in again.`)) return;
    try { await api.unblacklistUser(t.id); showMsg(`${t.name} removed from the blacklist`, 'success'); refresh(); }
    catch (err) { showMsg(err.message, 'error'); }
  };

  const permanentDelete = async (t) => {
    if (!confirm(`PERMANENTLY DELETE ${t.name}? This cannot be undone. Their sessions, attendance and recordings are removed too.`)) return;
    try {
      await api.permanentDeleteUser(t.id);
      showMsg('Tutor permanently deleted', 'success');
      if (profileId === t.id) setProfileId(null);
      loadTutors();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDelete = async (ids) => {
    if (!confirm(`PERMANENTLY DELETE ${ids.length} tutor(s)? This cannot be undone.`)) return;
    const results = await Promise.allSettled(ids.map((id) => api.permanentDeleteUser(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    showMsg(failed ? `${ids.length - failed} deleted, ${failed} failed` : `${ids.length} tutor(s) permanently deleted`, failed ? 'error' : 'success');
    loadTutors();
  };

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const columns = [
    { key: 'avatar', label: '', sortable: false, render: avatarCol },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'phone', label: 'Phone', accessor: 'phone', render: (r) => r.phone || <span style={muted}>—</span> },
    { key: 'team', label: 'Team', accessor: 'team_name', render: (r) => r.team_name || <span style={muted}>—</span> },
    { key: 'courses', label: 'Courses', accessor: 'course_count' },
    { key: 'payout', label: 'Payout', accessor: 'payout_rate', render: (r) => (
      <span>{formatMoney(r.payout_rate)} <span style={{ color: '#888', fontSize: '12px' }}>/ {r.payout_type || 'monthly'}</span></span>
    ) },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => (
      <div>
        {statusCol(r)}
        {r.status === 'blacklisted' && r.blacklist_reason && (
          <div title={r.blacklist_reason} style={{ fontSize: '0.75rem', ...muted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.blacklist_reason}
          </div>
        )}
      </div>
    ) },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        {r.email && <button className="btn btn-sm btn-ghost" style={{ color: '#10B981' }} onClick={stop(() => invite(r))}>Invite</button>}
        <button className="btn btn-sm btn-ghost" onClick={stop(() => openEdit(r))}>Edit</button>
        {!['inactive', 'blacklisted'].includes(r.status) && (
          <button className="btn btn-sm btn-ghost text-danger" onClick={stop(() => deactivate(r))}>Deactivate</button>
        )}
        {r.status === 'blacklisted'
          ? <button className="btn btn-sm btn-ghost" style={{ color: '#111827', fontWeight: 600 }} onClick={stop(() => unblacklist(r))}>Remove blacklist</button>
          : <button className="btn btn-sm btn-ghost" style={{ color: '#111827', fontWeight: 600 }} onClick={stop(() => setBlacklistTarget(r))}>Blacklist</button>}
        <button className="btn btn-sm btn-ghost text-danger" onClick={stop(() => permanentDelete(r))}>Delete</button>
      </div>
    ) },
  ];

  const modals = (
    <>
      {form && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editing ? 'Edit Tutor' : 'Add Tutor'}</h3>
            <form onSubmit={save}>
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={set('name')} required />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" value={form.email} onChange={set('email')} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input value={form.phone} onChange={set('phone')} />
                </div>
                <div className="form-group">
                  <label>{editing ? 'New Password (blank = keep)' : 'Password'}</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')}
                      style={{ paddingRight: '4rem', width: '100%' }}
                      placeholder={editing ? '' : 'Blank = random, emailed to them'} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary, #4F46E5)', fontSize: '13px', fontWeight: 600, padding: 0 }}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Avatar Color</label>
                  <input type="color" value={form.avatar_color} onChange={set('avatar_color')} />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select value={form.gender} onChange={set('gender')}>
                    <option value="">— Not set —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Team</label>
                <select value={form.team_id} onChange={set('team_id')}>
                  <option value="">— No team —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payout Type</label>
                  <select value={form.payout_type} onChange={set('payout_type')}>
                    <option value="shift">Shift-wise (per hour)</option>
                    <option value="monthly">Monthly</option>
                    <option value="per_session">Per Session</option>
                    <option value="per_hour">Per Hour (flat)</option>
                    <option value="per_course">Per Course</option>
                  </select>
                </div>
                {form.payout_type !== 'shift' && (
                  <div className="form-group">
                    <label>Payout Rate ({currency})</label>
                    <input type="number" min="0" step="0.01" value={form.payout_rate}
                      onChange={(e) => setForm((f) => ({ ...f, payout_rate: parseFloat(e.target.value) || 0 }))} />
                  </div>
                )}
              </div>
              {form.payout_type === 'shift' && (
                <div className="form-group">
                  <label>Shift Rates ({currency} per hour)</label>
                  <p style={{ fontSize: 12, ...muted, margin: '0 0 8px' }}>
                    Hours are billed at the rate of the shift they fall in. Each rate must sit inside its band; values outside are clamped when saved.
                  </p>
                  {shiftBands.map((sh) => (
                    <div key={sh.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 150, fontSize: 13 }}><strong>{sh.label}</strong> <span style={muted}>{sh.from}–{sh.to}</span></span>
                      <input type="number" min={sh.min_rate} max={sh.max_rate} step="1" style={{ maxWidth: 120 }}
                        value={form.shift_rates?.[sh.key] ?? sh.min_rate}
                        onChange={(e) => setForm((f) => ({ ...f, shift_rates: { ...(f.shift_rates || {}), [sh.key]: e.target.value } }))} />
                      <span style={{ fontSize: 12, ...muted }}>band {sh.min_rate}–{sh.max_rate}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Assign existing course</label>
                  <select value={form.course_id} onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value, new_course_name: '' }))}>
                    <option value="">No change</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.tutor_name ? ` (${c.tutor_name})` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>…or create a new course</label>
                  <input value={form.new_course_name} onChange={(e) => setForm((f) => ({ ...f, new_course_name: e.target.value, course_id: '' }))} placeholder="New course name" />
                </div>
              </div>
              <p style={{ color: '#888', fontSize: '12px', margin: '-0.5rem 0 1rem' }}>Assigning a course makes this tutor its owner.</p>
              {editing && (
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status || 'active'} onChange={set('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="at-risk">At Risk</option>
                    <option value="blacklisted" disabled>Blacklisted</option>
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Tutor' : 'Create Tutor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {blacklistTarget && (
        <BlacklistModal
          user={blacklistTarget}
          onClose={() => setBlacklistTarget(null)}
          onDone={(msg) => { setBlacklistTarget(null); showMsg(msg, 'success'); refresh(); }}
        />
      )}

      {inviteResult && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <h3>Invite {inviteResult.name}</h3>
            <p style={muted}>
              {inviteResult.emailed
                ? `A login email was sent to ${inviteResult.email}.`
                : 'Email could not be sent (SMTP not configured). Share these login details manually:'}
            </p>
            <div style={{ background: 'var(--color-bg)', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', lineHeight: 1.9 }}>
              <div><strong>Login:</strong> {inviteResult.login_url}</div>
              <div><strong>Email:</strong> {inviteResult.email}</div>
              <div><strong>Password:</strong> <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{inviteResult.password}</code></div>
            </div>
            <p style={{ fontSize: '12px', ...muted, marginTop: '8px' }}>They'll be asked to set their own password on first login.</p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => setInviteResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (profileId) {
    return (
      <>
        <TutorProfile
          key={`${profileId}-${profileKey}`}
          tutorId={profileId}
          onBack={() => setProfileId(null)}
          onEdit={openEdit}
          onInvite={invite}
          onBlacklist={setBlacklistTarget}
          onUnblacklist={unblacklist}
        />
        {modals}
      </>
    );
  }

  return (
    <div className="portal-page">
      <div className="page-header">
        <h2>Tutor Management</h2>
        {view === 'list' && <button className="btn btn-primary" onClick={openCreate}>+ Add Tutor</button>}
      </div>
      <div className="view-toggle" role="tablist">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Tutors</button>
        <button role="tab" aria-selected={view === 'applications'} className={view === 'applications' ? 'active' : ''} onClick={() => setView('applications')}>Applications</button>
      </div>
      {view === 'applications'
        ? <TutorApplications embedded onTutorCreated={loadTutors} />
        : (
          <>
            <p style={{ ...muted, marginTop: '-0.5rem', marginBottom: '1rem' }}>Click a tutor to view their full profile.</p>
            <DataTable columns={columns} data={tutors} pageSize={15} selectable onRowClick={(r) => setProfileId(r.id)} onBulkAction={bulkDelete} bulkActionLabel="Delete Selected" />
          </>
        )}
      {modals}
    </div>
  );
}
