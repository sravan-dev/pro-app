import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import DataTable from './DataTable';

// Self-service work-attendance for non-teaching staff (advisors, managers).
// One clock-in and one clock-out per day; the logged hours feed the admin
// salary calculation (salary = hours × payout rate). Tutors are paid from their
// session records instead, so they don't need this.
export default function StaffAttendanceSelf() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('info');

  const load = useCallback(() => {
    api.getStaffAttendance().then(setRows).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m, type = 'info') => { setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 4000); };

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = rows.find((r) => r.work_date === today);
  const clockedIn = todayRow && todayRow.check_in && !todayRow.check_out;
  const doneToday = todayRow && todayRow.check_out;

  const clock = async () => {
    setBusy(true);
    try {
      const res = await api.clockAttendance();
      flash(res.message, 'success');
      load();
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');

  const columns = [
    { key: 'date', label: 'Date', accessor: 'work_date', render: (r) => new Date(r.work_date).toLocaleDateString() },
    { key: 'in', label: 'Clock In', accessor: 'check_in', render: (r) => fmtTime(r.check_in) },
    { key: 'out', label: 'Clock Out', accessor: 'check_out', render: (r) => fmtTime(r.check_out) },
    { key: 'hours', label: 'Hours', accessor: 'hours', render: (r) => (Number(r.hours) || 0).toFixed(2) },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
    { key: 'note', label: 'Note', accessor: 'note', render: (r) => r.note || '-' },
  ];

  const totalHours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);

  return (
    <div className="portal-page">
      <h2>My Attendance</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
        Clock in when you start and clock out when you finish. Your logged hours are used to calculate your salary.
      </p>

      {msg && <div className={`alert alert-${msgType}`} style={{ marginBottom: '1rem' }}>{msg}</div>}

      <div className="section" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Today &middot; {new Date().toLocaleDateString()}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {doneToday
              ? `Done — ${fmtTime(todayRow.check_in)} to ${fmtTime(todayRow.check_out)} (${(Number(todayRow.hours) || 0).toFixed(2)} h)`
              : clockedIn
              ? `Clocked in at ${fmtTime(todayRow.check_in)}`
              : 'Not clocked in yet'}
          </div>
        </div>
        {!doneToday && (
          <button className={`btn ${clockedIn ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={clock}>
            {busy ? '...' : clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        )}
      </div>

      <div className="section">
        <h3>Recent Days <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: '0.9rem' }}>&middot; {totalHours.toFixed(2)} h total</span></h3>
        <DataTable columns={columns} data={rows} pageSize={15} searchable={false} />
      </div>
    </div>
  );
}
