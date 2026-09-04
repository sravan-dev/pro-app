import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import Calendar from '../components/Calendar';
import SessionCard from '../components/SessionCard';
import SessionRoom from '../components/SessionRoom';
import { MainSkeleton } from '../components/Skeleton';
import RatingsView from '../components/RatingsView';
import Tickets from '../components/Tickets';
import usePersistedTab from '../hooks/usePersistedTab';

// Simple horizontal bar chart built from the existing .stats-bars styles
// (no charting library). rows = [{ label, value }].
function BarChart({ title, rows = [], color = '#4F46E5', emptyLabel = 'No data yet' }) {
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>{emptyLabel}</p>
      ) : (
        <div className="stats-bars">
          {rows.map((r) => (
            <div key={r.label} className="stats-bar-item">
              <span className="stats-bar-label" style={{ textTransform: 'capitalize' }}>{r.label}</span>
              <div className="stats-bar"><div className="stats-bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></div>
              <span className="stats-bar-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Revenue (monthly payroll gross) line/area chart. `data` is [{period,gross}]
// oldest→newest. Pure SVG, no chart lib.
function RevenueChart({ data = [], color = '#10B981', currency = 'INR' }) {
  const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
  const total = data.reduce((s, d) => s + (d.gross || 0), 0);
  const W = 720, H = 220, PAD = 8;
  const max = Math.max(...data.map((d) => d.gross || 0), 1);
  const n = data.length;
  const x = (i) => (n <= 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1));
  const y = (v) => H - PAD - ((v || 0) / max) * (H - PAD * 2);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.gross).toFixed(1)}`).join(' ');
  const area = n ? `${line} L ${x(n - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z` : '';
  const label = (p) => { const [yy, mm] = p.split('-'); return new Date(yy, mm - 1, 1).toLocaleString('en-US', { month: 'short' }); };
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Total ({n} mo)</span>
        <strong style={{ fontSize: '1.15rem' }}>{fmt(total)}</strong>
      </div>
      {total === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>No payroll recorded yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Monthly revenue">
          <defs>
            <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#revfill)" />
          <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.period}>
              <circle cx={x(i)} cy={y(d.gross)} r="3" fill={color} />
              <text x={x(i)} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">{label(d.period)}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

export default function SuperadminPortal() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const [activeTab, setActiveTab] = usePersistedTab('tab:superadmin');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState('info');
  const [dbHealth, setDbHealth] = useState(null); // null=checking, then health payload
  const [hubspotCount, setHubspotCount] = useState(null); // total HubSpot contacts (null until loaded)

  // Entity lists
  const [allStudents, setAllStudents] = useState([]);
  const [allTutors, setAllTutors] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [allEnrollments, setAllEnrollments] = useState([]);
  // Teams
  const [teams, setTeams] = useState([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: '', manager_id: '' });
  const [allSessions, setAllSessions] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [recPlayUrl, setRecPlayUrl] = useState(null);
  const [allTimeSlots, setAllTimeSlots] = useState([]);
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotForm, setSlotForm] = useState({ start_time: '', end_time: '', note: '' });
  const [meetings, setMeetings] = useState([]);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ title: '', name: '', email: '' });
  const [showScheduleCalendar, setShowScheduleCalendar] = useState(false);
  const [reports, setReports] = useState(null);

  // Dashboard revenue graph (monthly payroll gross)
  const [revenueMonthly, setRevenueMonthly] = useState([]);

  // Salary / Payroll (salary = hours worked × payout rate)
  const [payrollPeriod, setPayrollPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [payroll, setPayroll] = useState(null);
  const [payrollBusy, setPayrollBusy] = useState(false);
  // Ad-hoc salary calculation: pick staff by hand, total only those rows.
  const [payrollPicked, setPayrollPicked] = useState(() => new Set());
  const [payrollCalc, setPayrollCalc] = useState(null);
  // Staff attendance (admin management)
  const [staffAttPeriod, setStaffAttPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [staffAtt, setStaffAtt] = useState([]);
  const [staffList, setStaffList] = useState([]); // active staff for the picker
  const [showStaffAttForm, setShowStaffAttForm] = useState(false);
  const [staffAttForm, setStaffAttForm] = useState({ user_id: '', work_date: '', status: 'present', hours: 0, note: '' });

  // Student detail view (full profile of one student)
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  // Modals
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'student', password: 'password123', specialization: '', avatar_color: '#4F46E5', payout_rate: 0, payout_type: 'shift', gender: '', team_id: '', course_id: '', new_course_name: '', shift_rates: null });
  // Shift bands (hours + rate range) come from the server so the pay scale lives
  // in exactly one place.
  const [shiftBands, setShiftBands] = useState([]);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [courseDraft, setCourseDraft] = useState('');
  const [addingCourse, setAddingCourse] = useState(false);

  // App settings (currency)
  const [appSettings, setAppSettings] = useState({ currency: 'INR' });
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);

  // Video / meeting provider settings
  const [videoSettings, setVideoSettings] = useState({
    video_provider: 'webrtc',
    zoom_account_id: '',
    zoom_client_id: '',
    zoom_client_secret: '',
    zoom_has_secret: false,
    livekit_url: '',
    livekit_api_key: '',
    livekit_api_secret: '',
    livekit_has_secret: false,
    livekit_source: 'none',
    livekit_configured: false,
  });
  const [videoSaving, setVideoSaving] = useState(false);
  const [livekitUsage, setLivekitUsage] = useState(null);
  const [livekitStatus, setLivekitStatus] = useState(null);
  const [livekitTesting, setLivekitTesting] = useState(false);

  // HubSpot CRM integration + contacts list
  const [hubspot, setHubspot] = useState({ hubspot_token: '', hubspot_connected: false });
  const [hubspotSaving, setHubspotSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactsTotal, setContactsTotal] = useState(null); // total records in HubSpot
  const [contactSearch, setContactSearch] = useState('');   // committed search term
  const [contactSearchInput, setContactSearchInput] = useState(''); // live input box
  const [contactPage, setContactPage] = useState(0);        // 0-based page index
  const [contactNextAfter, setContactNextAfter] = useState(''); // cursor for the next page
  const contactCursors = useRef(['']);  // `after` cursor for each visited page; [0] = first page
  const contactsInit = useRef(false);   // have we loaded the tab at least once?

  // Kajabi integration + contacts list (mirrors the HubSpot setup; 1-based pages)
  const [kajabiCount, setKajabiCount] = useState(null); // total Kajabi contacts
  const [kajabi, setKajabi] = useState({ kajabi_client_id: '', kajabi_client_secret: '', kajabi_connected: false });
  const [kajabiSaving, setKajabiSaving] = useState(false);
  const [kajabiContacts, setKajabiContacts] = useState([]);
  const [kajabiLoading, setKajabiLoading] = useState(false);
  const [kajabiError, setKajabiError] = useState('');
  const [kajabiTotal, setKajabiTotal] = useState(null);
  const [kajabiSearch, setKajabiSearch] = useState('');
  const [kajabiSearchInput, setKajabiSearchInput] = useState('');
  const [kajabiPage, setKajabiPage] = useState(1);          // 1-based page
  const [kajabiHasNext, setKajabiHasNext] = useState(false);
  const kajabiInit = useRef(false);

  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showCourseMgr, setShowCourseMgr] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({ name: '', category: 'Technology', tutor_id: '', color: '#3B82F6', icon: 'book' });

  const [inviteResult, setInviteResult] = useState(null);
  const [inviteAllBusy, setInviteAllBusy] = useState(false);
  const [inviteAllResult, setInviteAllResult] = useState(null); // summary of the bulk student invite, or null

  // Categories
  const [categories, setCategories] = useState([]);
  const [showCategoryMgr, setShowCategoryMgr] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Course Materials
  const [showMaterialsMgr, setShowMaterialsMgr] = useState(false);
  const [materialsCourse, setMaterialsCourse] = useState(null);
  const [materialsList, setMaterialsList] = useState([]);
  const [materialManagers, setMaterialManagers] = useState([]);
  const [newMaterial, setNewMaterial] = useState({ title: '', description: '', url: '', file: null });
  const [assignManagerId, setAssignManagerId] = useState('');

  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [editingEnroll, setEditingEnroll] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ student_id: '', course_id: '', progress_percentage: 0, grade: '', status: 'active' });
  const [pendingEnrollContact, setPendingEnrollContact] = useState(null); // contact awaiting "create student" confirm
  const [enrollBusy, setEnrollBusy] = useState(false);

  // Quick "Assign Course" action from a student row: pick a course and enroll.
  const [assignCourseStudent, setAssignCourseStudent] = useState(null); // the student being assigned, or null (modal closed)
  const [assignCourseId, setAssignCourseId] = useState('');
  const [assignCourseBusy, setAssignCourseBusy] = useState(false);

  // Quick "Assign Tutor" action from a student row: sets users.assigned_tutor_id.
  const [assignTutorStudent, setAssignTutorStudent] = useState(null); // the student being assigned, or null (modal closed)
  const [assignTutorId, setAssignTutorId] = useState('');
  const [assignTutorBusy, setAssignTutorBusy] = useState(false);

  // Right-click context menu on a student row → Add Additional Faculty / Edit Batch.
  const [studentCtxMenu, setStudentCtxMenu] = useState(null); // { x, y, student } or null

  // "Add Additional Faculty" modal: extra tutors beyond the primary assigned one.
  const [facultyStudent, setFacultyStudent] = useState(null); // student whose faculty is shown, or null (closed)
  const [facultyRows, setFacultyRows] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(false);
  const [facultyAddId, setFacultyAddId] = useState(''); // tutor picked in the "add faculty" select
  const [facultyBusy, setFacultyBusy] = useState(false);

  // "Edit Batch" modal: move the student to another team/batch.
  const [batchStudent, setBatchStudent] = useState(null); // student being moved, or null (closed)
  const [batchTeamId, setBatchTeamId] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  // Any click, right-click elsewhere, scroll, or Escape dismisses the context
  // menu. Listeners attach in an effect (after the opening event finished), so
  // the right-click that opened the menu can't immediately close it.
  useEffect(() => {
    if (!studentCtxMenu) return;
    const close = () => setStudentCtxMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [studentCtxMenu]);

  // View/manage a student's assigned courses (click the Course(s) cell to remove or add).
  const [coursesModalStudent, setCoursesModalStudent] = useState(null); // student whose courses are shown, or null (closed)
  const [coursesModalRows, setCoursesModalRows] = useState([]);
  const [coursesModalLoading, setCoursesModalLoading] = useState(false);
  const [coursesModalAddId, setCoursesModalAddId] = useState(''); // course picked in the modal's "add course" select
  const [coursesModalAdding, setCoursesModalAdding] = useState(false);

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({ course_id: '', tutor_id: '', student_id: '', start_time: '', end_time: '' });

  const [activeSession, setActiveSession] = useState(null);

  // SMTP settings
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, user: '', pass: '', from_email: '', provider: 'smtp', resend_api_key: '', resend_monthly_cap: 0, resend_quota_used: '', resend_quota_at: null, gmail_user: '', gmail_app_password: '' });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Test call
  const [testCallUrl, setTestCallUrl] = useState('');
  const [testCallCreating, setTestCallCreating] = useState(false);
  const [testCallCopied, setTestCallCopied] = useState(false);

  // Database export / import
  const [exportingDb, setExportingDb] = useState(false);
  const [exportingSql, setExportingSql] = useState(false);
  const [importingDb, setImportingDb] = useState(false);
  const dbImportRef = useRef(null);

  const showMsg = (msg, type = 'info') => { setMessage(msg); setMsgType(type); setTimeout(() => setMessage(''), 4000); };

  // Download a database backup in the given format ('db' | 'sql').
  const exportDatabase = async (format, setBusy) => {
    setBusy(true);
    try {
      const { blob, filename } = await api.exportDb(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showMsg(`Database exported (${format.toUpperCase()})`, 'success');
    } catch (err) { showMsg(err.message, 'error'); }
    finally { setBusy(false); }
  };

  // Replace the current database from an uploaded .db or .sql file.
  const importDatabase = async (file) => {
    if (!file) return;
    if (!confirm(`Import "${file.name}"? This REPLACES the entire current database — all current users, courses, and records will be overwritten. There is no automatic server-side backup, so export a fresh copy first. This cannot be undone from the UI.`)) return;
    setImportingDb(true);
    try {
      const result = await api.importDb(file);
      showMsg(result.message || 'Database imported', 'success');
      // Reload so every view reflects the freshly imported data (and re-auth if needed).
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) { showMsg(err.message, 'error'); }
    finally { setImportingDb(false); }
  };

  const fetchData = useCallback(async () => {
    try {
      const d = await api.portalData();
      setData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Warm the cache for the most-used tabs in the background on mount so opening
  // them from the sidebar is instant. Each list is still lazy-guarded below
  // (`length === 0`), so this just front-loads the work — tabs opened later
  // reuse the cached data instead of triggering a fresh fetch on first click.
  useEffect(() => {
    api.getStudents().then(setAllStudents).catch(() => {});
    api.getTutors().then(setAllTutors).catch(() => {});
    api.getCourses().then(setAllCourses).catch(() => {});
    api.getSessions().then(setAllSessions).catch(() => {});
    api.getPayrollMonthly(12).then(setRevenueMonthly).catch(() => {});
  }, []);

  // Poll the backend/DB health so the dashboard can show a live status badge.
  useEffect(() => {
    let alive = true;
    const check = () => api.health().then((h) => { if (alive) setDbHealth(h); });
    check();
    const t = setInterval(check, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Total HubSpot contact count for the dashboard card (no-op if not connected).
  useEffect(() => {
    api.getHubspotStatus()
      .then((s) => { if (s?.connected && typeof s.count === 'number') setHubspotCount(s.count); })
      .catch(() => {});
  }, []);

  // Kajabi connection status for the dashboard card.
  useEffect(() => {
    api.getKajabiStatus()
      .then((s) => { if (s?.connected && typeof s.count === 'number') setKajabiCount(s.count); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.getAppSettings().then((s) => {
      setAppSettings(s);
      setVideoSettings({
        video_provider: s.video_provider || 'webrtc',
        zoom_account_id: s.zoom_account_id || '',
        zoom_client_id: s.zoom_client_id || '',
        zoom_client_secret: '',
        zoom_has_secret: !!s.zoom_has_secret,
        livekit_url: s.livekit_url || '',
        livekit_api_key: s.livekit_api_key || '',
        livekit_api_secret: '',
        livekit_has_secret: !!s.livekit_has_secret,
        livekit_source: s.livekit_source || 'none',
        livekit_configured: !!s.livekit_configured,
      });
      if (s.livekit_configured) {
        api.getLiveKitUsage().then(setLivekitUsage).catch(() => {});
        api.getLiveKitStatus().then(setLivekitStatus).catch(() => {});
      }
      setHubspot({ hubspot_token: '', hubspot_connected: !!s.hubspot_connected });
      setKajabi({ kajabi_client_id: '', kajabi_client_secret: '', kajabi_connected: !!s.kajabi_connected });
    }).catch(() => {});
  }, []);

  // Load one server-side page of HubSpot contacts. `pageIndex` looks up its
  // cursor in contactCursors; `q` is the active search term. The CRM is paged
  // 100 at a time so this scales to the full contact list (tens of thousands).
  const loadContacts = useCallback((pageIndex = 0, q = contactSearch) => {
    setContactsLoading(true);
    setContactsError('');
    const after = contactCursors.current[pageIndex] || '';
    api.getHubspotContacts({ after, q })
      .then((r) => {
        setContacts(r.contacts || []);
        if (typeof r.total === 'number') setContactsTotal(r.total);
        contactCursors.current[pageIndex + 1] = r.after || ''; // remember the next page's cursor
        setContactNextAfter(r.after || '');
        setContactPage(pageIndex);
      })
      .catch((err) => setContactsError(err.message))
      .finally(() => setContactsLoading(false));
  }, [contactSearch]);

  // Run a new search: reset paging back to the first page, then fetch.
  const runContactSearch = useCallback((term) => {
    const q = term.trim();
    setContactSearch(q);
    contactCursors.current = ['']; // cursors are query-specific — start fresh
    loadContacts(0, q);
  }, [loadContacts]);

  // Debounce the search box so we don't hit HubSpot on every keystroke.
  useEffect(() => {
    if (!contactsInit.current) return; // don't fire before the tab's first load
    const t = setTimeout(() => {
      if (contactSearchInput.trim() !== contactSearch) runContactSearch(contactSearchInput);
    }, 400);
    return () => clearTimeout(t);
  }, [contactSearchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load one page of Kajabi contacts (1-based pages).
  const loadKajabiContacts = useCallback((page = 1, q = kajabiSearch) => {
    setKajabiLoading(true);
    setKajabiError('');
    api.getKajabiContacts({ page, q })
      .then((r) => {
        setKajabiContacts(r.contacts || []);
        if (typeof r.total === 'number') setKajabiTotal(r.total);
        setKajabiHasNext(!!r.has_next);
        setKajabiPage(r.page || page);
      })
      .catch((err) => setKajabiError(err.message))
      .finally(() => setKajabiLoading(false));
  }, [kajabiSearch]);

  // Debounce the Kajabi search box.
  useEffect(() => {
    if (!kajabiInit.current) return;
    const t = setTimeout(() => {
      const q = kajabiSearchInput.trim();
      if (q !== kajabiSearch) { setKajabiSearch(q); loadKajabiContacts(1, q); }
    }, 400);
    return () => clearTimeout(t);
  }, [kajabiSearchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatMoney = (amount) => {
    const n = Number(amount) || 0;
    return `${appSettings.currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  // Lazy fetch for tabs
  useEffect(() => {
    if (activeTab === 'students' && allStudents.length === 0) api.getStudents().then(setAllStudents).catch(() => {});
    if (activeTab === 'tutors' && allTutors.length === 0) api.getTutors().then(setAllTutors).catch(() => {});
    if (activeTab === 'courses' && allCourses.length === 0) api.getCourses().then(setAllCourses).catch(() => {});
    if (activeTab === 'courses' && categories.length === 0) api.getCategories().then(setCategories).catch(() => {});
    // The categories page counts the courses filed under each one.
    if (activeTab === 'categories') {
      if (categories.length === 0) api.getCategories().then(setCategories).catch(() => {});
      if (allCourses.length === 0) api.getCourses().then(setAllCourses).catch(() => {});
    }
    if (activeTab === 'enrollments' && allEnrollments.length === 0) api.getEnrollments().then(setAllEnrollments).catch(() => {});
    // Teams list — needed by the Teams tab AND the team selector in the user form.
    if (['teams', 'students', 'tutors', 'users'].includes(activeTab) && teams.length === 0) api.getTeams().then(setTeams).catch(() => {});
    if (activeTab === 'sessions' && allSessions.length === 0) api.getSessions().then(setAllSessions).catch(() => {});
    if (activeTab === 'attendance' && allAttendance.length === 0) api.getAttendanceLogs().then(setAllAttendance).catch(() => {});
    if (activeTab === 'recordings') api.getMeetingRecords().then(setRecordings).catch(() => {});
    if (activeTab === 'timeslots') api.getAvailability().then(setAllTimeSlots).catch(() => {});
    if (activeTab === 'meetings') api.getMeetings().then(setMeetings).catch(() => {});
    if (activeTab === 'dashboard' && allSessions.length === 0) api.getSessions().then(setAllSessions).catch(() => {});
    if (activeTab === 'reports' && !reports) api.reports().then(setReports).catch(() => {});
    if (activeTab === 'integrations' && !smtpLoaded) api.getSmtpSettings().then((s) => { setSmtpForm({ provider: 'smtp', resend_api_key: '', resend_monthly_cap: 0, resend_quota_used: '', resend_quota_at: null, gmail_user: '', gmail_app_password: '', ...s }); setSmtpLoaded(true); }).catch(() => {});
    if (activeTab !== 'students') setStudentDetail(null);
  }, [activeTab]);

  // Load HubSpot contacts once the tab is active AND the connection status is
  // known. `hubspot_connected` resolves asynchronously after mount (via
  // getAppSettings), so when the persisted tab is already 'contacts' on login
  // the [activeTab]-only effect above runs before the connection is known.
  // Depending on hubspot_connected here lets the load fire when it flips true.
  useEffect(() => {
    if (activeTab === 'contacts' && hubspot.hubspot_connected && !contactsInit.current) {
      contactsInit.current = true;
      loadContacts(0, '');
    }
  }, [activeTab, hubspot.hubspot_connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salary / Payroll — recomputes whenever the tab or selected month changes.
  useEffect(() => {
    if (activeTab === 'payroll') api.getPayroll(payrollPeriod).then(setPayroll).catch(() => setPayroll(null));
    // A selection made against one month means nothing in another.
    setPayrollPicked(new Set());
    setPayrollCalc(null);
  }, [activeTab, payrollPeriod]);

  // Staff-attendance list (+ staff picker) for the admin management tab.
  useEffect(() => {
    if (activeTab !== 'staffattendance') return;
    api.getStaffAttendance({ period: staffAttPeriod }).then(setStaffAtt).catch(() => {});
    if (staffList.length === 0) {
      api.getUsers().then((us) => setStaffList(us.filter((u) => ['tutor', 'advisor', 'manager'].includes(u.role)))).catch(() => {});
    }
  }, [activeTab, staffAttPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same lazy-load pattern for the Kajabi Contacts tab.
  useEffect(() => {
    if (activeTab === 'kajabi' && kajabi.kajabi_connected && !kajabiInit.current) {
      kajabiInit.current = true;
      loadKajabiContacts(1, '');
    }
  }, [activeTab, kajabi.kajabi_connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const openStudentDetail = async (student) => {
    setStudentDetail(null);
    setStudentDetailLoading(true);
    try {
      const detail = await api.getStudentDetail(student.id);
      setStudentDetail(detail);
    } catch (err) {
      showMsg(err.message || 'Failed to load student', 'error');
    } finally {
      setStudentDetailLoading(false);
    }
  };

  // ===== USER CRUD =====
  // Make sure the course/category lists the user form needs are loaded even when
  // opened from a tab that doesn't lazy-fetch them.
  const ensureCourseLists = () => {
    // Always refresh allCourses so the course field/manager stay live after
    // course add/edit/delete (those handlers update allCourses).
    api.getCourses().then(setAllCourses).catch(() => {});
    if (categories.length === 0) api.getCategories().then(setCategories).catch(() => {});
  };

  // Pull the shift bands and, for an existing user, their stored rates.
  const loadShiftRates = (userId) => api.getShiftRates(userId)
    .then(({ shifts, rates }) => {
      setShiftBands(shifts || []);
      setUserForm((f) => ({ ...f, shift_rates: rates || null }));
    })
    .catch(() => {});

  const openCreateUser = (role = 'student') => {
    setEditingUser(null);
    setUserForm({ name: '', email: '', role, password: 'password123', specialization: '', avatar_color: '#4F46E5', payout_rate: 0, payout_type: 'shift', gender: '', team_id: '', course_id: '', new_course_name: '', shift_rates: null });
    loadShiftRates();
    setCourseDraft('');
    setAddingCourse(false);
    setShowUserPassword(false);
    ensureCourseLists();
    setShowUserForm(true);
  };

  const openEditUser = (user) => {
    setEditingUser(user);
    setUserForm({ name: user.name, email: user.email, role: user.role, password: '', specialization: user.specialization || '', avatar_color: user.avatar_color, status: user.status, payout_rate: user.payout_rate || 0, payout_type: user.payout_type || 'shift', gender: user.gender || '', team_id: user.team_id || '', course_id: '', new_course_name: '', shift_rates: null });
    loadShiftRates(user.id);
    setCourseDraft('');
    setAddingCourse(false);
    setShowUserPassword(false);
    ensureCourseLists();
    setShowUserForm(true);
  };

  // Inline "Add" for the course field: if a course with this name already
  // exists, just select it; otherwise stage it to be created (and assigned to
  // the tutor) when the user is saved.
  const courseListForUser = () => (allCourses.length ? allCourses : (data?.courses || []));
  const addCourseInline = () => {
    const name = courseDraft.trim();
    if (!name) return;
    const existing = courseListForUser().find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setUserForm((f) => ({ ...f, course_id: String(existing.id), new_course_name: '' }));
      showMsg(`Course "${existing.name}" already exists — selected it`, 'info');
    } else {
      setUserForm((f) => ({ ...f, course_id: '', new_course_name: name }));
      showMsg(`New course "${name}" will be created and assigned on save`, 'info');
    }
    setCourseDraft('');
    setAddingCourse(false);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    try {
      const { course_id, new_course_name, ...userPayload } = userForm;
      // If the tutor typed a name into the inline "Add New" course box but didn't
      // click the small "Add" button to confirm it, fold that draft in here so it
      // still gets created/assigned instead of being silently dropped.
      let stagedCourseId = course_id;
      let stagedNewCourse = new_course_name;
      if (userForm.role === 'tutor' && !stagedNewCourse && !stagedCourseId) {
        const draft = courseDraft.trim();
        if (draft) {
          const existing = courseListForUser().find((c) => c.name.toLowerCase() === draft.toLowerCase());
          if (existing) stagedCourseId = String(existing.id);
          else stagedNewCourse = draft;
        }
      }
      let tutorId;
      if (editingUser) {
        await api.updateUser({ id: editingUser.id, ...userPayload });
        tutorId = editingUser.id;
        showMsg('User updated successfully', 'success');
      } else {
        const created = await api.createUser(userPayload);
        tutorId = created.id;
        showMsg('User created successfully', 'success');
      }
      // Course assignment (tutors only): create the staged new course or
      // re-point the selected existing course at this tutor.
      if (userForm.role === 'tutor' && tutorId) {
        if (stagedNewCourse) {
          await api.createCourse({ name: stagedNewCourse, category: categories[0]?.name || 'Technology', tutor_id: tutorId, color: '#3B82F6', icon: 'book' });
          showMsg(`Course "${stagedNewCourse}" created and assigned`, 'success');
        } else if (stagedCourseId) {
          await api.updateCourse({ id: stagedCourseId, tutor_id: tutorId });
          showMsg('Course assigned to tutor', 'success');
        }
      }
      setShowUserForm(false);
      setCourseDraft('');
      setAddingCourse(false);
      fetchData();
      api.getStudents().then(setAllStudents);
      api.getTutors().then(setAllTutors);
      api.getCourses().then(setAllCourses).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // ===== TEAMS =====
  const openCreateTeam = () => { setEditingTeam(null); setTeamForm({ name: '', manager_id: '' }); setShowTeamForm(true); };
  const openEditTeam = (team) => { setEditingTeam(team); setTeamForm({ name: team.name, manager_id: team.manager_id || '' }); setShowTeamForm(true); };
  const saveTeam = async (e) => {
    e.preventDefault();
    try {
      if (editingTeam) {
        await api.updateTeam({ id: editingTeam.id, ...teamForm });
        showMsg('Team updated', 'success');
      } else {
        await api.createTeam(teamForm);
        showMsg('Team created', 'success');
      }
      setShowTeamForm(false);
      api.getTeams().then(setTeams).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
  };
  const deleteTeam = async (id) => {
    if (!confirm('Delete this team? Members will be unassigned from it.')) return;
    try {
      await api.deleteTeam(id);
      showMsg('Team deleted', 'success');
      api.getTeams().then(setTeams).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const deactivateUser = async (userId) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await api.deleteUser(userId);
      showMsg('User deactivated', 'success');
      fetchData();
      api.getStudents().then(setAllStudents);
      api.getTutors().then(setAllTutors);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const permanentDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this user? This action cannot be undone. All associated data (sessions, enrollments, attendance) will be removed.')) return;
    try {
      await api.permanentDeleteUser(userId);
      showMsg('User permanently deleted', 'success');
      fetchData();
      api.getStudents().then(setAllStudents);
      api.getTutors().then(setAllTutors);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDeleteUsers = async (ids) => {
    if (!confirm(`Are you sure you want to PERMANENTLY DELETE ${ids.length} user(s)? This action cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((id) => api.permanentDeleteUser(id)));
      showMsg(`${ids.length} user(s) permanently deleted`, 'success');
      fetchData();
      api.getStudents().then(setAllStudents);
      api.getTutors().then(setAllTutors);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDeleteRecordings = async (ids) => {
    if (!confirm(`Delete ${ids.length} recording(s)? This permanently removes the files. This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((id) => api.deleteMeetingRecord(id)));
      setRecordings((list) => list.filter((x) => !ids.includes(x.record_id)));
      showMsg(`${ids.length} recording(s) deleted`, 'success');
    } catch (err) { showMsg(err.message || 'Failed to delete recordings', 'error'); }
  };

  // ===== MEETINGS (temporary link + passcode) =====
  const meetingLink = (code) => `${window.location.origin}/m/${code}`;

  const openMeetingForm = () => {
    setMeetingForm({ title: '', name: '', email: '' });
    setShowMeetingForm(true);
  };

  const submitMeeting = async (e) => {
    e.preventDefault();
    setCreatingMeeting(true);
    try {
      const m = await api.createMeeting({
        title: meetingForm.title.trim() || 'Meeting',
        name: meetingForm.name.trim(),
        email: meetingForm.email.trim(),
      });
      setMeetings(await api.getMeetings());
      setShowMeetingForm(false);
      try { await navigator.clipboard.writeText(`${meetingLink(m.code)}\nPasscode: ${m.passcode}`); } catch {}
      showMsg(`Meeting created — link + passcode ${m.passcode} copied to clipboard`, 'success');
    } catch (err) { showMsg(err.message, 'error'); }
    finally { setCreatingMeeting(false); }
  };

  const endMeeting = async (id) => {
    if (!confirm('End this meeting? The link and passcode will stop working. It stays in the list as history.')) return;
    try {
      await api.endMeeting(id);
      setMeetings(await api.getMeetings());
      showMsg('Meeting ended', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const deleteMeeting = async (id) => {
    if (!confirm('Permanently delete this meeting from history? This cannot be undone.')) return;
    try {
      await api.deleteMeeting(id);
      setMeetings(await api.getMeetings());
      showMsg('Meeting deleted', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const copyMeeting = async (m) => {
    try {
      await navigator.clipboard.writeText(`${meetingLink(m.code)}\nPasscode: ${m.passcode}`);
      showMsg('Link + passcode copied', 'success');
    } catch { showMsg('Copy failed — copy manually', 'error'); }
  };

  // ===== COURSE CRUD =====
  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm({ name: '', category: categories[0]?.name || '', tutor_id: '', color: '#3B82F6', icon: 'book' });
    setShowCourseForm(true);
  };

  // ===== CATEGORY CRUD =====
  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await api.createCategory(name);
      const list = await api.getCategories();
      setCategories(list);
      setNewCategoryName('');
      showMsg('Category added', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const removeCategory = async (id) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.deleteCategory(id);
      const list = await api.getCategories();
      setCategories(list);
      showMsg('Category deleted', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const startEditCategory = (c) => {
    setEditingCategoryId(c.id);
    setEditingCategoryName(c.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const saveEditCategory = async () => {
    const name = editingCategoryName.trim();
    if (!name) return;
    try {
      await api.updateCategory(editingCategoryId, name);
      const list = await api.getCategories();
      setCategories(list);
      cancelEditCategory();
      api.getCourses().then(setAllCourses);
      fetchData();
      showMsg('Category updated', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // ===== COURSE MATERIALS =====
  const openMaterialsMgr = async (course) => {
    setMaterialsCourse(course);
    setNewMaterial({ title: '', description: '', url: '', file: null });
    setAssignManagerId('');
    setShowMaterialsMgr(true);
    try {
      const [mats, mgrs] = await Promise.all([
        api.getCourseMaterials(course.id),
        api.getMaterialManagers(course.id),
      ]);
      setMaterialsList(mats.materials || []);
      setMaterialManagers(mgrs);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const refreshMaterials = async () => {
    if (!materialsCourse) return;
    const mats = await api.getCourseMaterials(materialsCourse.id);
    setMaterialsList(mats.materials || []);
  };

  const refreshManagers = async () => {
    if (!materialsCourse) return;
    const mgrs = await api.getMaterialManagers(materialsCourse.id);
    setMaterialManagers(mgrs);
  };

  const submitMaterial = async (e) => {
    e.preventDefault();
    if (!materialsCourse) return;
    if (!newMaterial.title.trim()) return showMsg('Title required', 'error');
    if (!newMaterial.file && !newMaterial.url.trim()) return showMsg('Provide a file or a URL', 'error');
    try {
      const fd = new FormData();
      fd.append('course_id', materialsCourse.id);
      fd.append('title', newMaterial.title.trim());
      fd.append('description', newMaterial.description.trim());
      if (newMaterial.file) fd.append('file', newMaterial.file);
      else fd.append('url', newMaterial.url.trim());
      await api.createCourseMaterial(fd);
      setNewMaterial({ title: '', description: '', url: '', file: null });
      await refreshMaterials();
      showMsg('Material added', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const toggleMaterial = async (m) => {
    try {
      await api.updateCourseMaterial({ id: m.id, is_enabled: !m.is_enabled });
      await refreshMaterials();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const deleteMaterial = async (id) => {
    if (!confirm('Delete this material?')) return;
    try {
      await api.deleteCourseMaterial(id);
      await refreshMaterials();
      showMsg('Material deleted', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const assignManager = async () => {
    if (!assignManagerId) return;
    try {
      await api.assignMaterialManager(materialsCourse.id, parseInt(assignManagerId));
      setAssignManagerId('');
      await refreshManagers();
      showMsg('Manager assigned', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const unassignManager = async (userId) => {
    try {
      await api.unassignMaterialManager(materialsCourse.id, userId);
      await refreshManagers();
      showMsg('Manager removed', 'success');
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const openEditCourse = (course) => {
    setEditingCourse(course);
    setCourseForm({ name: course.name, category: course.category, tutor_id: course.tutor_id, color: course.color, icon: course.icon || 'book', status: course.status });
    setShowCourseForm(true);
  };

  const saveCourse = async (e) => {
    e.preventDefault();
    try {
      if (editingCourse) {
        await api.updateCourse({ id: editingCourse.id, ...courseForm });
        showMsg('Course updated', 'success');
      } else {
        await api.createCourse(courseForm);
        showMsg('Course created', 'success');
      }
      setShowCourseForm(false);
      api.getCourses().then(setAllCourses);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const archiveCourse = async (id) => {
    if (!confirm('Archive this course?')) return;
    try {
      await api.deleteCourse(id);
      showMsg('Course archived', 'success');
      api.getCourses().then(setAllCourses);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const permanentDeleteCourse = async (id) => {
    if (!confirm('PERMANENTLY DELETE this course? All sessions, enrollments, and attendance for this course will be removed. This cannot be undone.')) return;
    try {
      await api.permanentDeleteCourse(id);
      showMsg('Course permanently deleted', 'success');
      api.getCourses().then(setAllCourses);
      api.getEnrollments().then(setAllEnrollments);
      api.getSessions().then(setAllSessions);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDeleteCourses = async (ids) => {
    if (!confirm(`PERMANENTLY DELETE ${ids.length} course(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((id) => api.permanentDeleteCourse(id)));
      showMsg(`${ids.length} course(s) permanently deleted`, 'success');
      api.getCourses().then(setAllCourses);
      api.getEnrollments().then(setAllEnrollments);
      api.getSessions().then(setAllSessions);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // ===== ENROLLMENT CRUD =====
  const openCreateEnroll = () => {
    setEditingEnroll(null);
    setEnrollForm({ student_id: '', course_id: '', progress_percentage: 0, grade: '', status: 'active' });
    setShowEnrollForm(true);
  };

  const openEditEnroll = (enroll) => {
    setEditingEnroll(enroll);
    setEnrollForm({ progress_percentage: enroll.progress_percentage, grade: enroll.grade, status: enroll.status });
    setShowEnrollForm(true);
  };

  // Open the enrollment modal pre-selected for a given student id.
  const openEnrollFor = (studentId) => {
    setEditingEnroll(null);
    setEnrollForm({ student_id: String(studentId), course_id: '', progress_percentage: 0, grade: '', status: 'active' });
    setShowEnrollForm(true);
  };

  // Enroll a HubSpot contact. If a student already matches the contact's email,
  // jump straight to the enrollment modal; otherwise open a confirm modal that
  // offers to create a student account first.
  // Record the enrollment intimation and notify all managers & advisors.
  // Fire-and-forget: a failure here shouldn't block the enrollment itself.
  const notifyContactEnroll = async (contact) => {
    try {
      const r = await api.createContactEnrollment({
        hubspot_contact_id: contact.id,
        name: contact.name && contact.name !== '—' ? contact.name : '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        stage: contact.lifecycle_stage || '',
      });
      const who = r.emailed > 0
        ? `${r.emailed} of ${r.recipients} emailed`
        : `${r.recipients} notified in-app`;
      showMsg(`Managers & advisors intimated (${who}).`, 'success');
    } catch (err) {
      showMsg(`Enrolled, but intimation failed: ${err.message}`, 'error');
    }
  };

  const enrollContact = (contact) => {
    const email = (contact.email || '').trim();
    const student = email
      ? students.find((s) => (s.email || '').toLowerCase() === email.toLowerCase())
      : null;
    if (student) { notifyContactEnroll(contact); openEnrollFor(student.id); return; }
    if (!email) { showMsg('This contact has no email — add one in HubSpot before enrolling.', 'error'); return; }
    setPendingEnrollContact(contact); // styled confirm modal handles the rest
  };

  // Confirmed: create a student account from the pending contact, then enroll.
  const confirmCreateAndEnroll = async () => {
    const contact = pendingEnrollContact;
    if (!contact) return;
    const email = (contact.email || '').trim();
    const label = contact.name && contact.name !== '—' ? contact.name : email;
    setEnrollBusy(true);
    try {
      const created = await api.createUser({ name: label, email, role: 'student' });
      await fetchData();                                  // refresh users so the dropdown has the new student
      await api.getStudents().then(setAllStudents).catch(() => {});
      showMsg('Student account created', 'success');
      notifyContactEnroll(contact);                       // intimate managers & advisors
      setPendingEnrollContact(null);
      openEnrollFor(created.id);
    } catch (err) {
      showMsg(err.message, 'error');
      setPendingEnrollContact(null);
    } finally {
      setEnrollBusy(false);
    }
  };

  const saveEnroll = async (e) => {
    e.preventDefault();
    try {
      if (editingEnroll) {
        await api.updateEnrollment({ enrollment_id: editingEnroll.enrollment_id, ...enrollForm });
        showMsg('Enrollment updated', 'success');
      } else {
        await api.createEnrollment(enrollForm);
        showMsg('Student enrolled', 'success');
      }
      setShowEnrollForm(false);
      api.getEnrollments().then(setAllEnrollments);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // Open the "Assign Course" modal for a student and (re)fetch courses from the
  // DB so the picker is always current.
  const openAssignCourse = (student) => {
    setAssignCourseStudent(student);
    setAssignCourseId('');
    api.getCourses().then(setAllCourses).catch(() => {});
  };

  const submitAssignCourse = async (e) => {
    e.preventDefault();
    if (!assignCourseStudent || !assignCourseId) { showMsg('Please select a course', 'error'); return; }
    setAssignCourseBusy(true);
    try {
      await api.createEnrollment({ student_id: assignCourseStudent.id, course_id: assignCourseId });
      showMsg(`${assignCourseStudent.name} assigned to course`, 'success');
      setAssignCourseStudent(null);
      api.getStudents().then(setAllStudents).catch(() => {});
      api.getEnrollments().then(setAllEnrollments).catch(() => {});
      api.getCourses().then(setAllCourses).catch(() => {}); // backend bumped students_count — refresh the Courses tab
      fetchData();
    } catch (err) { showMsg(err.message || 'Failed to assign course', 'error'); }
    finally { setAssignCourseBusy(false); }
  };

  // Open the "Assign Tutor" modal pre-selected with the student's current tutor,
  // and (re)fetch tutors so the picker is always current.
  const openAssignTutor = (student) => {
    setAssignTutorStudent(student);
    setAssignTutorId(student.assigned_tutor_id ? String(student.assigned_tutor_id) : '');
    api.getTutors().then(setAllTutors).catch(() => {});
  };

  const submitAssignTutor = async (e) => {
    e.preventDefault();
    if (!assignTutorStudent) return;
    setAssignTutorBusy(true);
    try {
      await api.assignStudent({ student_id: assignTutorStudent.id, assigned_tutor_id: assignTutorId || null });
      showMsg(assignTutorId ? `Tutor assigned to ${assignTutorStudent.name}` : `Tutor removed from ${assignTutorStudent.name}`, 'success');
      setAssignTutorStudent(null);
      api.getStudents().then(setAllStudents).catch(() => {}); // refresh assigned_tutor_id so reopening pre-selects correctly
    } catch (err) { showMsg(err.message || 'Failed to assign tutor', 'error'); }
    finally { setAssignTutorBusy(false); }
  };

  // Right-click on a student row: open the custom context menu, clamped so it
  // never renders off-screen near the right/bottom edges.
  const openStudentContextMenu = (student, e) => {
    e.preventDefault();
    setStudentCtxMenu({
      x: Math.min(e.clientX, window.innerWidth - 210),
      y: Math.min(e.clientY, window.innerHeight - 100),
      student,
    });
  };

  // Open the "Add Additional Faculty" modal and load the student's extra tutors.
  const openAddFaculty = async (student) => {
    setFacultyStudent(student);
    setFacultyRows([]);
    setFacultyAddId('');
    setFacultyLoading(true);
    api.getTutors().then(setAllTutors).catch(() => {}); // keep the picker current
    try { setFacultyRows(await api.getStudentTutors(student.id)); }
    catch (err) { showMsg(err.message || 'Failed to load faculty', 'error'); }
    finally { setFacultyLoading(false); }
  };

  const addFaculty = async () => {
    if (!facultyStudent || !facultyAddId) return;
    setFacultyBusy(true);
    try {
      await api.addStudentTutor({ student_id: facultyStudent.id, tutor_id: facultyAddId });
      showMsg(`Faculty added for ${facultyStudent.name}`, 'success');
      setFacultyAddId('');
      setFacultyRows(await api.getStudentTutors(facultyStudent.id));
    } catch (err) { showMsg(err.message || 'Failed to add faculty', 'error'); }
    finally { setFacultyBusy(false); }
  };

  const removeFaculty = async (row) => {
    if (!confirm(`Remove ${row.tutor_name} as additional faculty for ${facultyStudent?.name || 'this student'}?`)) return;
    try {
      await api.removeStudentTutor(row.id);
      showMsg('Faculty removed', 'success');
      setFacultyRows((rows) => rows.filter((r) => r.id !== row.id));
    } catch (err) { showMsg(err.message || 'Failed to remove faculty', 'error'); }
  };

  // Open the "Edit Batch" modal pre-selected with the student's current team.
  const openEditBatch = (student) => {
    setBatchStudent(student);
    setBatchTeamId(student.team_id ? String(student.team_id) : '');
    api.getTeams().then(setTeams).catch(() => {}); // keep the picker current
  };

  const submitEditBatch = async (e) => {
    e.preventDefault();
    if (!batchStudent) return;
    setBatchBusy(true);
    try {
      await api.assignStudent({ student_id: batchStudent.id, team_id: batchTeamId || null });
      showMsg(`Batch updated for ${batchStudent.name}`, 'success');
      setBatchStudent(null);
      api.getStudents().then(setAllStudents).catch(() => {}); // refresh the Team column
    } catch (err) { showMsg(err.message || 'Failed to update batch', 'error'); }
    finally { setBatchBusy(false); }
  };

  // Open a modal listing a student's enrolled courses so they can be removed.
  const openStudentCourses = async (student) => {
    setCoursesModalStudent(student);
    setCoursesModalRows([]);
    setCoursesModalAddId('');
    setCoursesModalLoading(true);
    api.getCourses().then(setAllCourses).catch(() => {}); // keep the add-course picker current
    try {
      const all = await api.getEnrollments();
      setAllEnrollments(all);
      setCoursesModalRows(all.filter((en) => en.student_id === student.id));
    } catch (err) { showMsg(err.message || 'Failed to load courses', 'error'); }
    finally { setCoursesModalLoading(false); }
  };

  const removeStudentCourse = async (enrollment) => {
    if (!confirm(`Remove "${enrollment.course_name}" from ${coursesModalStudent?.name || 'this student'}? This permanently deletes the enrollment.`)) return;
    try {
      await api.permanentDeleteEnrollment(enrollment.enrollment_id);
      showMsg('Course removed', 'success');
      setCoursesModalRows((rows) => rows.filter((r) => r.enrollment_id !== enrollment.enrollment_id));
      api.getStudents().then(setAllStudents).catch(() => {});
      api.getEnrollments().then(setAllEnrollments).catch(() => {});
      api.getCourses().then(setAllCourses).catch(() => {});
      fetchData();
    } catch (err) { showMsg(err.message || 'Failed to remove course', 'error'); }
  };

  // Enroll the modal's student in one more course (students can take several).
  const addStudentCourse = async () => {
    if (!coursesModalStudent || !coursesModalAddId) return;
    setCoursesModalAdding(true);
    let created;
    try {
      created = await api.createEnrollment({ student_id: coursesModalStudent.id, course_id: coursesModalAddId });
    } catch (err) {
      showMsg(err.message || 'Failed to add course', 'error');
      setCoursesModalAdding(false);
      return;
    }
    showMsg(`Course added for ${coursesModalStudent.name}`, 'success');
    // Update the modal list from local data so a failed refresh below can't
    // make the successful add look failed or leave the course re-addable.
    const course = allCourses.find((c) => String(c.id) === String(coursesModalAddId));
    setCoursesModalRows((rows) => [...rows, {
      enrollment_id: created.enrollment_id,
      student_id: coursesModalStudent.id,
      course_id: coursesModalAddId,
      course_name: course?.name || 'Course',
      course_category: course?.category || '',
      status: 'active',
    }]);
    setCoursesModalAddId('');
    setCoursesModalAdding(false);
    // Background refreshes (fire-and-forget, like submitAssignCourse).
    api.getEnrollments().then(setAllEnrollments).catch(() => {});
    api.getStudents().then(setAllStudents).catch(() => {});
    api.getCourses().then(setAllCourses).catch(() => {}); // backend bumped students_count — refresh the Courses tab
    fetchData();
  };

  const dropEnrollment = async (id) => {
    if (!confirm('Drop this enrollment?')) return;
    try {
      await api.deleteEnrollment(id);
      showMsg('Enrollment dropped', 'success');
      api.getEnrollments().then(setAllEnrollments);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const permanentDeleteEnrollment = async (id) => {
    if (!confirm('PERMANENTLY DELETE this enrollment? This cannot be undone.')) return;
    try {
      await api.permanentDeleteEnrollment(id);
      showMsg('Enrollment permanently deleted', 'success');
      api.getEnrollments().then(setAllEnrollments);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDeleteEnrollments = async (ids) => {
    if (!confirm(`PERMANENTLY DELETE ${ids.length} enrollment(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((id) => api.permanentDeleteEnrollment(id)));
      showMsg(`${ids.length} enrollment(s) permanently deleted`, 'success');
      api.getEnrollments().then(setAllEnrollments);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // ===== SESSION CREATE =====
  const openCreateSession = () => {
    setSessionForm({ course_id: '', tutor_id: '', student_id: '', start_time: '', end_time: '' });
    setShowSessionForm(true);
  };

  const saveSession = async (e) => {
    e.preventDefault();
    try {
      await api.createSession(sessionForm);
      showMsg('Session created', 'success');
      setShowSessionForm(false);
      api.getSessions().then(setAllSessions);
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const deleteSession = async (id) => {
    if (!confirm('PERMANENTLY DELETE this session? Attendance records will also be removed. This cannot be undone.')) return;
    try {
      await api.deleteSession(id);
      showMsg('Session permanently deleted', 'success');
      api.getSessions().then(setAllSessions);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const bulkDeleteSessions = async (ids) => {
    if (!confirm(`PERMANENTLY DELETE ${ids.length} session(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((id) => api.deleteSession(id)));
      showMsg(`${ids.length} session(s) permanently deleted`, 'success');
      api.getSessions().then(setAllSessions);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const endSession = async (id) => {
    if (!confirm('End this session for everyone? It will be marked completed.')) return;
    try {
      await api.endSession(id);
      showMsg('Session ended', 'success');
      api.getSessions().then(setAllSessions);
      fetchData();
    } catch (err) { showMsg(err.message, 'error'); }
  };

  // ===== Time slot (tutor availability) edit / delete =====
  // Convert a stored timestamp to the value a datetime-local input expects (local time, no tz/seconds).
  const toLocalInput = (ts) => {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditSlot = (slot) => {
    if (slot.status === 'booked') { showMsg('This slot is booked — end/cancel the session instead', 'error'); return; }
    setEditingSlot(slot);
    setSlotForm({ start_time: toLocalInput(slot.start_time), end_time: toLocalInput(slot.end_time), note: slot.note || '' });
  };

  const saveSlot = async (e) => {
    e.preventDefault();
    try {
      await api.updateAvailability(editingSlot.id, slotForm);
      showMsg('Slot updated', 'success');
      setEditingSlot(null);
      api.getAvailability().then(setAllTimeSlots).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const deleteSlot = async (slot) => {
    if (slot.status === 'booked') { showMsg('This slot is booked — end/cancel the session instead', 'error'); return; }
    if (!confirm('Delete this time slot? This cannot be undone.')) return;
    try {
      await api.deleteAvailability(slot.id);
      showMsg('Slot removed', 'success');
      api.getAvailability().then(setAllTimeSlots).catch(() => {});
    } catch (err) { showMsg(err.message, 'error'); }
  };

  const handleJoinSession = async (session) => {
    try {
      const result = await api.joinSession(session.session_id);
      setActiveSession({ ...session, ...result });
    } catch (err) { alert(err.message); }
  };

  // Friendly download filename for a recording. Older rows stored a
  // playback_url without an extension, so the browser's `download` fallback
  // saved an extension-less file Windows couldn't recognise. Forcing a
  // `.webm` name here keeps the saved file playable for every record.
  const recordingFileName = (r) => {
    const slug = (r.course_name || 'recording').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'recording';
    return `${slug}-${r.record_id}.webm`;
  };

  if (loading) return (
    <div className="portal-layout portal-superadmin">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content"><MainSkeleton /></main>
    </div>
  );

  if (activeSession) {
    return (
      <div className="portal-layout portal-superadmin">
        <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveSession(null); setActiveTab(tab); }} />
        <main className="portal-content">
          <SessionRoom session={activeSession} onLeave={() => setActiveSession(null)} />
        </main>
      </div>
    );
  }

  const stats = data?.stats || {};
  const charts = data?.charts || {};
  const users = data?.users || [];
  const tutors = users.filter((u) => u.role === 'tutor');
  const students = users.filter((u) => u.role === 'student');

  // ===== Column Definitions =====
  const avatarCol = (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div>;
  const statusCol = (r) => <span className={`status-dot status-${r.status}`}>{r.status}</span>;
  const roleCol = (r) => <span className={`role-badge role-${r.role}`}>{r.role}</span>;

  const progressCol = (r, field = 'progress_percentage') => (
    <div className="progress-bar-inline">
      <div className="progress-fill" style={{ width: `${r[field] || 0}%` }} />
      <span>{Math.round(r[field] || 0)}%</span>
    </div>
  );

  const handleInvite = async (u) => {
    try {
      const res = await api.inviteUser(u.id);
      setInviteResult({ name: u.name, ...res });
    } catch (err) { showMsg(err.message || 'Failed to send invite', 'error'); }
  };

  // Bulk invite every active student. Each invite resets that student's
  // password to a fresh temp one, so confirm before firing. The backend runs
  // the batch in the background (202), so poll /invite-all/status until it
  // finishes — the final payload carries the emailed/failed breakdown.
  const handleInviteAll = async () => {
    if (!confirm('Send login invites to ALL active students?\n\nEach student\'s password is reset to a fresh temporary one and emailed to them. Students who already use their account will need the new password.')) return;
    setInviteAllBusy(true);
    try {
      await api.inviteAllStudents();
      let status;
      do {
        await new Promise((r) => setTimeout(r, 2000));
        status = await api.inviteAllStatus();
      } while (status.running);
      if (status.error) throw new Error(status.error);
      setInviteAllResult(status);
    } catch (err) { showMsg(err.message || 'Failed to send invites', 'error'); }
    finally { setInviteAllBusy(false); }
  };

  const actionBtns = (onEdit, onDelete, deleteLabel = 'Deactivate', onPermanentDelete = null, extra = null) => (r) => (
    <div className="table-actions">
      {r.id && r.email && (
        <button className="btn btn-sm btn-ghost" style={{ color: '#10B981' }} onClick={(e) => { e.stopPropagation(); handleInvite(r); }}>Invite</button>
      )}
      {extra && extra(r)}
      <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onEdit(r); }}>Edit</button>
      {onDelete && r.status !== 'inactive' && r.status !== 'archived' && r.status !== 'dropped' && (
        <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); onDelete(r.id || r.enrollment_id); }}>{deleteLabel}</button>
      )}
      {onPermanentDelete && (
        <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); onPermanentDelete(r.id); }}>Delete</button>
      )}
    </div>
  );

  const studentColumns = [
    { key: 'avatar', label: '', sortable: false, render: avatarCol },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'team', label: 'Team', accessor: 'team_name', render: (r) => r.team_name || <span style={{ color: 'var(--color-text-secondary)' }}>—</span> },
    { key: 'courses', label: 'Courses', accessor: 'enrolled_courses' },
    { key: 'course_names', label: 'Course(s)', accessor: 'course_names', render: (r) => r.course_names
      ? <button type="button" onClick={(e) => { e.stopPropagation(); openStudentCourses(r); }}
          title={`${r.course_names} — click to manage`}
          style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--color-primary, #E97A2B)', cursor: 'pointer', textDecoration: 'underline' }}>{r.course_names}</button>
      : <span style={{ color: 'var(--color-text-secondary)' }}>—</span> },
    { key: 'progress', label: 'Avg Progress', accessor: 'avg_progress', render: (r) => progressCol(r, 'avg_progress') },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'actions', label: 'Actions', sortable: false, render: actionBtns(openEditUser, deactivateUser, 'Deactivate', permanentDeleteUser, (r) => (
      <>
        <button className="btn btn-sm btn-danger" title={r.assigned_tutor_name ? `Tutor: ${r.assigned_tutor_name}` : 'No tutor assigned'} onClick={(e) => { e.stopPropagation(); openAssignTutor(r); }}>Assign Tutor</button>
        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openAssignCourse(r); }}>Assign Course</button>
      </>
    )) },
  ];

  const tutorColumns = [
    { key: 'avatar', label: '', sortable: false, render: avatarCol },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'team', label: 'Team', accessor: 'team_name', render: (r) => r.team_name || <span style={{ color: 'var(--color-text-secondary)' }}>—</span> },
    { key: 'courses', label: 'Courses', accessor: 'course_count' },
    { key: 'payout', label: 'Payout', accessor: 'payout_rate', render: (r) => (
      <span>{formatMoney(r.payout_rate)} <span style={{ color: '#888', fontSize: '12px' }}>/ {r.payout_type || 'monthly'}</span></span>
    ) },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'actions', label: 'Actions', sortable: false, render: actionBtns(openEditUser, deactivateUser, 'Deactivate', permanentDeleteUser) },
  ];

  const userColumns = [
    { key: 'avatar', label: '', sortable: false, render: avatarCol },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'role', label: 'Role', accessor: 'role', render: roleCol },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'created', label: 'Created', accessor: 'created_at', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'actions', label: 'Actions', sortable: false, render: actionBtns(openEditUser, deactivateUser, 'Deactivate', permanentDeleteUser) },
  ];

  const contactColumns = [
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'phone', label: 'Phone', accessor: 'phone' },
    { key: 'company', label: 'Company', accessor: 'company' },
    { key: 'lifecycle_stage', label: 'Stage', accessor: 'lifecycle_stage', render: (r) => r.lifecycle_stage ? <span className="role-badge role-advisor">{r.lifecycle_stage}</span> : '—' },
    { key: 'created_at', label: 'Created', accessor: 'created_at', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); enrollContact(r); }}>Enroll</button>
      </div>
    ) },
  ];

  const courseColumns = [
    { key: 'name', label: 'Course', accessor: 'name' },
    { key: 'category', label: 'Category', accessor: 'category', render: (r) => <span className="role-badge role-advisor">{r.category}</span> },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
    { key: 'students', label: 'Students', accessor: 'students_count' },
    { key: 'progress', label: 'Progress', accessor: 'progress', render: (r) => progressCol(r, 'progress') },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); openMaterialsMgr(r); }}>Materials</button>
        <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); openEditCourse(r); }}>Edit</button>
        {r.status !== 'archived' && (
          <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); archiveCourse(r.id); }}>Archive</button>
        )}
        <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); permanentDeleteCourse(r.id); }}>Delete</button>
      </div>
    ) },
  ];

  const enrollColumns = [
    { key: 'avatar', label: '', sortable: false, render: (r) => <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.student_name?.[0]}</div> },
    { key: 'student', label: 'Student', accessor: 'student_name' },
    { key: 'course', label: 'Course', accessor: 'course_name' },
    { key: 'category', label: 'Category', accessor: 'course_category' },
    { key: 'progress', label: 'Progress', render: (r) => progressCol(r) },
    { key: 'grade', label: 'Grade', accessor: 'grade', render: (r) => <span className={`grade-badge grade-${(r.grade || 'na')[0]?.toLowerCase()}`}>{r.grade || '-'}</span> },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'date', label: 'Enrolled', accessor: 'enrollment_date', render: (r) => new Date(r.enrollment_date).toLocaleDateString() },
    { key: 'actions', label: 'Actions', sortable: false, render: actionBtns(openEditEnroll, dropEnrollment, 'Drop', permanentDeleteEnrollment) },
  ];

  const sessionColumns = [
    { key: 'course', label: 'Course', accessor: 'course_name' },
    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
    { key: 'student', label: 'Student', accessor: (r) => r.student_name || 'All', render: (r) => r.student_name || <span style={{ color: 'var(--color-text-secondary)' }}>All</span> },
    { key: 'start', label: 'Start', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleString() },
    { key: 'end', label: 'End', accessor: 'end_time', render: (r) => new Date(r.end_time).toLocaleString() },
    { key: 'room', label: 'Room', accessor: 'room_name' },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        {(r.status === 'scheduled' || r.status === 'live') && <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleJoinSession(r); }}>Join</button>}
        {r.status === 'live' && <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); endSession(r.session_id); }}>End</button>}
        <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); deleteSession(r.session_id); }}>Delete</button>
      </div>
    )},
  ];

  const attendanceColumns = [
    { key: 'student', label: 'Student', accessor: 'student_name' },
    { key: 'course', label: 'Course', accessor: 'course_name' },
    { key: 'session_date', label: 'Session Date', accessor: 'start_time', render: (r) => r.start_time ? new Date(r.start_time).toLocaleDateString() : '-' },
    { key: 'join', label: 'Join Time', accessor: 'join_time', render: (r) => r.join_time ? new Date(r.join_time).toLocaleTimeString() : '-' },
    { key: 'leave', label: 'Leave Time', accessor: 'leave_time', render: (r) => r.leave_time ? new Date(r.leave_time).toLocaleTimeString() : '-' },
    { key: 'duration', label: 'Duration (min)', accessor: 'duration_minutes' },
  ];

  // ----- Salary / Payroll & Staff Attendance -----------------------------
  const roleLabel = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');
  const fmtClock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
  const refreshPayroll = () => api.getPayroll(payrollPeriod).then(setPayroll).catch(() => {});
  const refreshStaffAtt = () => api.getStaffAttendance({ period: staffAttPeriod }).then(setStaffAtt).catch(() => {});

  const payStaff = async (userId) => {
    setPayrollBusy(true);
    try { await api.payPayroll({ period: payrollPeriod, user_id: userId }); await refreshPayroll(); showMsg('Marked as paid', 'success'); }
    catch (e) { showMsg(e.message, 'error'); }
    finally { setPayrollBusy(false); }
  };
  const unpayStaff = async (userId) => {
    if (!confirm('Undo this payment? It will show as pending again.')) return;
    try { await api.unpayPayroll(payrollPeriod, userId); await refreshPayroll(); showMsg('Payment reverted', 'success'); }
    catch (e) { showMsg(e.message, 'error'); }
  };
  const payAll = async () => {
    const pending = (payroll?.rows || []).filter((r) => !r.paid && r.gross_amount > 0);
    if (!pending.length) { showMsg('Nothing pending to pay for this month', 'info'); return; }
    if (!confirm(`Mark ${pending.length} staff as paid for ${payrollPeriod}?`)) return;
    setPayrollBusy(true);
    try { await api.payPayroll({ period: payrollPeriod, user_ids: pending.map((r) => r.user_id) }); await refreshPayroll(); showMsg('Payroll marked paid', 'success'); }
    catch (e) { showMsg(e.message, 'error'); }
    finally { setPayrollBusy(false); }
  };

  const openStaffAttForm = () => { setStaffAttForm({ user_id: '', work_date: new Date().toISOString().slice(0, 10), status: 'present', hours: 0, note: '' }); setShowStaffAttForm(true); };
  const editStaffAtt = (r) => { setStaffAttForm({ user_id: r.user_id, work_date: r.work_date, status: r.status, hours: Number(r.hours) || 0, note: r.note || '' }); setShowStaffAttForm(true); };
  const saveStaffAtt = async (e) => {
    e.preventDefault();
    if (!staffAttForm.user_id || !staffAttForm.work_date) { showMsg('Staff and date are required', 'error'); return; }
    try { await api.saveStaffAttendance(staffAttForm); setShowStaffAttForm(false); await refreshStaffAtt(); showMsg('Attendance saved', 'success'); }
    catch (e2) { showMsg(e2.message, 'error'); }
  };
  const deleteStaffAtt = async (id) => {
    if (!confirm('Delete this attendance record?')) return;
    try { await api.deleteStaffAttendance(id); await refreshStaffAtt(); showMsg('Deleted', 'success'); }
    catch (e) { showMsg(e.message, 'error'); }
  };

  const togglePayrollPick = (userId) => {
    setPayrollPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
    setPayrollCalc(null);
  };
  const payrollRows = payroll?.rows || [];
  const allPayrollPicked = payrollRows.length > 0 && payrollRows.every((r) => payrollPicked.has(r.user_id));
  const togglePayrollPickAll = () => {
    setPayrollPicked(allPayrollPicked ? new Set() : new Set(payrollRows.map((r) => r.user_id)));
    setPayrollCalc(null);
  };
  // Totals the picked rows only, keeping the same shift split the table shows.
  const calculateSalary = () => {
    const rows = payrollRows.filter((r) => payrollPicked.has(r.user_id));
    if (!rows.length) { showMsg('Select at least one staff member', 'error'); return; }
    const shiftMap = new Map();
    rows.forEach((r) => (r.shifts || []).forEach((sh) => {
      if (!sh.hours) return;
      const cur = shiftMap.get(sh.key) || { key: sh.key, label: sh.label, hours: 0, amount: 0 };
      cur.hours += Number(sh.hours) || 0;
      cur.amount += Number(sh.amount) || 0;
      shiftMap.set(sh.key, cur);
    }));
    setPayrollCalc({
      staff_count: rows.length,
      hours: rows.reduce((a, r) => a + (Number(r.hours) || 0), 0),
      gross: rows.reduce((a, r) => a + (Number(r.gross_amount) || 0), 0),
      pending: rows.filter((r) => !r.paid).reduce((a, r) => a + (Number(r.gross_amount) || 0), 0),
      shifts: [...shiftMap.values()],
      rows: rows.map((r) => ({ user_id: r.user_id, name: r.name, hours: Number(r.hours) || 0, gross: Number(r.gross_amount) || 0 })),
    });
  };

  const payrollColumns = [
    { key: 'pick', sortable: false, label: (
      <input type="checkbox" checked={allPayrollPicked} onChange={togglePayrollPickAll} onClick={(e) => e.stopPropagation()} />
    ), render: (r) => (
      <input type="checkbox" checked={payrollPicked.has(r.user_id)} onChange={() => togglePayrollPick(r.user_id)} />
    ) },
    { key: 'name', label: 'Staff', accessor: 'name', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="avatar-sm" style={{ backgroundColor: r.avatar_color }}>{r.name?.[0]}</div>
        <div><div>{r.name}</div><div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.email}</div></div>
      </div>
    ) },
    { key: 'role', label: 'Role', accessor: 'role', render: (r) => <span className="status-badge">{roleLabel(r.role)}</span> },
    { key: 'hours', label: 'Hours', accessor: 'hours', render: (r) => `${(Number(r.hours) || 0).toFixed(2)} h` },
    { key: 'from', label: 'From', accessor: 'source', render: (r) => (r.source === 'sessions' ? `${r.sessions} sessions` : `${r.days} days`) },
    // Per-shift hours, so the total is auditable rather than a bare number.
    { key: 'shifts', label: 'Shift Split', sortable: false, render: (r) => (
      (r.shifts || []).some((sh) => sh.hours > 0)
        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(r.shifts || []).filter((sh) => sh.hours > 0).map((sh) => (
              <span key={sh.key} className="status-badge" title={`${sh.label} ${sh.from}–${sh.to} @ ${formatMoney(sh.rate)}/h = ${formatMoney(sh.amount)}`}>
                {sh.label.replace('Shift ', 'S')} {sh.hours.toFixed(2)}h
              </span>
            ))}
          </div>
        : <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>—</span>
    ) },
    // A rate only means something next to the unit it is expressed in.
    { key: 'rate', label: 'Rate', accessor: 'payout_rate', render: (r) => (
      r.payout_type === 'shift'
        ? <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>shift-wise</span>
        : <span>{formatMoney(r.payout_rate)} <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>/ {r.unit_label}</span></span>
    ) },
    { key: 'salary', label: 'Salary', accessor: 'gross_amount', render: (r) => <strong>{formatMoney(r.gross_amount)}</strong> },
    // For a paid row, what was actually paid — and whether the live figure has
    // moved since, which happens when work is recorded after payment.
    { key: 'paid_amount', label: 'Paid', accessor: (r) => r.paid_amount || 0, render: (r) => (
      r.paid
        ? <span>{formatMoney(r.paid_amount)}{r.drift ? <span style={{ color: 'var(--color-warning, #F59E0B)', fontSize: 12 }}> ({r.drift > 0 ? '+' : ''}{formatMoney(r.drift)} since)</span> : null}</span>
        : <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>—</span>
    ) },
    { key: 'status', label: 'Status', accessor: (r) => (r.paid ? 'Paid' : 'Pending'), render: (r) => <span className={`status-badge status-${r.paid ? 'completed' : 'scheduled'}`}>{r.paid ? 'Paid' : 'Pending'}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      r.paid
        ? <div className="table-actions">
            {r.drift ? <button className="btn btn-sm btn-primary" disabled={payrollBusy} onClick={() => payStaff(r.user_id)}>Re-pay</button> : null}
            <button className="btn btn-sm btn-ghost text-danger" onClick={() => unpayStaff(r.user_id)}>Undo</button>
          </div>
        : (r.gross_amount > 0
          ? <button className="btn btn-sm btn-primary" disabled={payrollBusy} onClick={() => payStaff(r.user_id)}>Mark Paid</button>
          : <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>—</span>)
    ) },
  ];

  const staffAttColumns = [
    { key: 'staff', label: 'Staff', accessor: 'staff_name' },
    { key: 'role', label: 'Role', accessor: 'staff_role', render: (r) => roleLabel(r.staff_role) },
    { key: 'date', label: 'Date', accessor: 'work_date', render: (r) => new Date(r.work_date).toLocaleDateString() },
    { key: 'in', label: 'In', accessor: 'check_in', render: (r) => fmtClock(r.check_in) },
    { key: 'out', label: 'Out', accessor: 'check_out', render: (r) => fmtClock(r.check_out) },
    { key: 'hours', label: 'Hours', accessor: 'hours', render: (r) => (Number(r.hours) || 0).toFixed(2) },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className="status-badge">{r.status}</span> },
    { key: 'note', label: 'Note', accessor: 'note', render: (r) => r.note || '-' },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        <button className="btn btn-sm btn-ghost" onClick={() => editStaffAtt(r)}>Edit</button>
        <button className="btn btn-sm btn-ghost text-danger" onClick={() => deleteStaffAtt(r.id)}>Delete</button>
      </div>
    ) },
  ];

  const auditColumns = [
    { key: 'time', label: 'Time', accessor: 'created_at', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'user', label: 'User', accessor: 'user_name' },
    { key: 'action', label: 'Action', accessor: 'action' },
    { key: 'target', label: 'Target', accessor: (r) => r.target_type ? `${r.target_type} #${r.target_id}` : '' },
    { key: 'details', label: 'Details', accessor: 'details' },
    { key: 'ip', label: 'IP', accessor: 'ip_address' },
  ];

  // ===== Modal JSX (inline, not component functions — avoids remount/focus-loss) =====
  // No close on backdrop click: a stray click outside would throw away a
  // half-filled form. Cancel is the only way out.
  const userFormModal = showUserForm && (
    <div className="modal-overlay">
      <div className="modal">
        {/* Titled by the role being created, so the modal matches the button that opened it. */}
        <h3>{editingUser ? `Edit ${roleLabel(userForm.role) || 'User'}` : `Add ${roleLabel(userForm.role) || 'User'}`}</h3>
        <form onSubmit={saveUser}>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name *</label>
              <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Role *</label>
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="tutor">Tutor</option>
                <option value="advisor">Advisor</option>
                <option value="manager">Manager</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div className="form-group">
              <label>{editingUser ? 'New Password (blank = keep)' : 'Password *'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showUserPassword ? 'text' : 'password'}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  style={{ paddingRight: '4rem', width: '100%' }}
                  {...(!editingUser && { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowUserPassword((v) => !v)}
                  aria-label={showUserPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-primary, #4F46E5)', fontSize: '13px', fontWeight: 600, padding: 0,
                  }}
                >
                  {showUserPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Avatar Color</label>
              <input type="color" value={userForm.avatar_color} onChange={(e) => setUserForm({ ...userForm, avatar_color: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={userForm.gender || ''} onChange={(e) => setUserForm({ ...userForm, gender: e.target.value })}>
                <option value="">— Not set —</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          {userForm.role !== 'superadmin' && (
            <div className="form-group">
              <label>Team</label>
              <select value={userForm.team_id || ''} onChange={(e) => setUserForm({ ...userForm, team_id: e.target.value })}>
                <option value="">— No team —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {['tutor', 'advisor', 'manager'].includes(userForm.role) && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Payout Type</label>
                  <select value={userForm.payout_type || 'shift'} onChange={(e) => setUserForm({ ...userForm, payout_type: e.target.value })}>
                    <option value="shift">Shift-wise (per hour)</option>
                    <option value="monthly">Monthly</option>
                    <option value="per_session">Per Session</option>
                    <option value="per_hour">Per Hour (flat)</option>
                    <option value="per_course">Per Course</option>
                  </select>
                </div>
                {userForm.payout_type !== 'shift' && (
                  <div className="form-group">
                    <label>Payout Rate ({appSettings.currency})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={userForm.payout_rate}
                      onChange={(e) => setUserForm({ ...userForm, payout_rate: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
              {(userForm.payout_type || 'shift') === 'shift' && (
                <div className="form-group">
                  <label>Shift Rates ({appSettings.currency} per hour)</label>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
                    Hours are billed at the rate of the shift they fall in. Each rate must sit inside its band; values outside are clamped when saved.
                  </p>
                  {shiftBands.map((sh) => (
                    <div key={sh.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 150, fontSize: 13 }}>
                        <strong>{sh.label}</strong>{' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>{sh.from}–{sh.to}</span>
                      </span>
                      <input
                        type="number"
                        min={sh.min_rate}
                        max={sh.max_rate}
                        step="1"
                        style={{ maxWidth: 120 }}
                        value={userForm.shift_rates?.[sh.key] ?? sh.min_rate}
                        onChange={(e) => setUserForm({
                          ...userForm,
                          shift_rates: { ...(userForm.shift_rates || {}), [sh.key]: e.target.value },
                        })}
                      />
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        band {sh.min_rate}–{sh.max_rate}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {userForm.role === 'tutor' && (
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Course</span>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => { ensureCourseLists(); setShowCourseMgr(true); }}>Manage</button>
              </label>
              {/* Pick an existing course from the dropdown, or click "Add New"
                  to type a new one (checked for duplicates, created on save). */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  style={{ flex: 1 }}
                  value={userForm.new_course_name ? '__new__' : userForm.course_id}
                  onChange={(e) => setUserForm({ ...userForm, course_id: e.target.value === '__new__' ? '' : e.target.value, new_course_name: '' })}
                >
                  <option value="">No course</option>
                  {userForm.new_course_name && <option value="__new__">+ New: {userForm.new_course_name}</option>}
                  {courseListForUser().map((c) => <option key={c.id} value={c.id}>{c.name}{c.tutor_name ? ` (${c.tutor_name})` : ''}</option>)}
                </select>
                <button type="button" className="btn btn-primary" onClick={() => setAddingCourse((v) => !v)}>Add New</button>
              </div>
              {addingCourse && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    value={courseDraft}
                    onChange={(e) => setCourseDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCourseInline(); } }}
                    placeholder="New course name"
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-primary" onClick={addCourseInline}>Add</button>
                </div>
              )}
              <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>Assigning a course makes this tutor its owner.</p>
            </div>
          )}
          {editingUser && (
            <div className="form-group">
              <label>Status</label>
              <select value={userForm.status || 'active'} onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="at-risk">At Risk</option>
              </select>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowUserForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editingUser ? 'Update User' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  const courseFormModal = showCourseForm && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editingCourse ? 'Edit Course' : 'Create Course'}</h3>
        <form onSubmit={saveCourse}>
          <div className="form-group">
            <label>Course Name *</label>
            <input value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Category *</span>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '12px' }} onClick={() => setShowCategoryMgr(true)}>Manage</button>
              </label>
              <select value={courseForm.category} onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })} required>
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tutor *</label>
              <select value={courseForm.tutor_id} onChange={(e) => setCourseForm({ ...courseForm, tutor_id: e.target.value })} required>
                <option value="">Select tutor...</option>
                {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Color</label>
              <input type="color" value={courseForm.color} onChange={(e) => setCourseForm({ ...courseForm, color: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Icon</label>
              <select value={courseForm.icon} onChange={(e) => setCourseForm({ ...courseForm, icon: e.target.value })}>
                <option value="book">Book</option>
                <option value="code">Code</option>
                <option value="monitor">Monitor</option>
                <option value="globe">Globe</option>
                <option value="database">Database</option>
                <option value="cpu">CPU</option>
                <option value="layout">Layout</option>
                <option value="cloud">Cloud</option>
                <option value="terminal">Terminal</option>
                <option value="trending-up">Trending</option>
                <option value="search">Search</option>
              </select>
            </div>
          </div>
          {editingCourse && (
            <div className="form-group">
              <label>Status</label>
              <select value={courseForm.status || 'active'} onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowCourseForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editingCourse ? 'Update Course' : 'Create Course'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  // Manage existing courses (add / edit / delete) from within the user form.
  // Reuses the full course form for add/edit and the existing delete handlers.
  const courseMgrModal = showCourseMgr && (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Manage Courses</h3>
          <button type="button" className="btn btn-primary" onClick={openCreateCourse}>+ Add Course</button>
        </div>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>Existing Courses ({courseListForUser().length})</label>
          {courseListForUser().length === 0 ? (
            <p style={{ color: '#888', fontSize: '14px' }}>No courses yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '320px', overflowY: 'auto' }}>
              {courseListForUser().map((c) => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.color || '#3B82F6', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{c.name}</strong>
                      <span style={{ color: '#888', fontSize: '12px' }}>{c.category ? ` · ${c.category}` : ''}{c.tutor_name ? ` · ${c.tutor_name}` : ''}</span>
                    </span>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={() => openEditCourse(c)}>Edit</button>
                  <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '13px', color: '#dc2626' }} onClick={() => permanentDeleteCourse(c.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowCourseMgr(false)}>Done</button>
        </div>
      </div>
    </div>
  );

  // Categories page: same add/rename/delete handlers the modal uses, laid out
  // as a full page so categories are reachable without opening a course first.
  const courseCountFor = (name) => allCourses.filter((c) => c.category === name).length;
  const categoryColumns = [
    { key: 'name', label: 'Category', accessor: 'name', render: (c) => (
      editingCategoryId === c.id
        ? <input
            value={editingCategoryName}
            onChange={(e) => setEditingCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditCategory(); } if (e.key === 'Escape') cancelEditCategory(); }}
            autoFocus
            style={{ maxWidth: 260 }}
          />
        : <strong>{c.name}</strong>
    ) },
    { key: 'courses', label: 'Courses', accessor: (c) => courseCountFor(c.name), render: (c) => {
      const n = courseCountFor(c.name);
      return <span className="status-badge">{n} {n === 1 ? 'course' : 'courses'}</span>;
    } },
    { key: 'actions', label: 'Actions', sortable: false, render: (c) => (
      editingCategoryId === c.id
        ? <div className="table-actions">
            <button className="btn btn-sm btn-primary" onClick={saveEditCategory}>Save</button>
            <button className="btn btn-sm btn-ghost" onClick={cancelEditCategory}>Cancel</button>
          </div>
        : <div className="table-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => startEditCategory(c)}>Rename</button>
            <button className="btn btn-sm btn-ghost text-danger" onClick={() => removeCategory(c.id)}>Delete</button>
          </div>
    ) },
  ];

  const categoryMgrModal = showCategoryMgr && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Manage Categories</h3>
        <div className="form-group">
          <label>Add New Category</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder="Category name"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary" onClick={addCategory}>Add</button>
          </div>
        </div>
        <div className="form-group">
          <label>Existing Categories</label>
          {categories.length === 0 ? (
            <p style={{ color: '#888', fontSize: '14px' }}>No categories yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '240px', overflowY: 'auto' }}>
              {categories.map((c) => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                  {editingCategoryId === c.id ? (
                    <>
                      <input
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditCategory(); } if (e.key === 'Escape') cancelEditCategory(); }}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={saveEditCategory}>Save</button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={cancelEditCategory}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>{c.name}</span>
                      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={() => startEditCategory(c)}>Edit</button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '13px', color: '#dc2626' }} onClick={() => removeCategory(c.id)}>Delete</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowCategoryMgr(false)}>Done</button>
        </div>
      </div>
    </div>
  );

  const meetingFormModal = showMeetingForm && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>New Meeting</h3>
        <form onSubmit={submitMeeting}>
          <div className="form-group">
            <label>Subject *</label>
            <input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} placeholder="e.g. Demo class" required autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Host Name *</label>
              <input value={meetingForm.name} onChange={(e) => setMeetingForm({ ...meetingForm, name: e.target.value })} placeholder="e.g. Tiju" required />
            </div>
            <div className="form-group">
              <label>Host Email</label>
              <input type="email" value={meetingForm.email} onChange={(e) => setMeetingForm({ ...meetingForm, email: e.target.value })} placeholder="name@example.com" />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowMeetingForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creatingMeeting}>{creatingMeeting ? 'Creating…' : 'Create Meeting'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  const eligibleManagers = [...allTutors, ...(data?.users || []).filter((u) => ['manager','advisor'].includes(u.role))]
    .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i)
    .filter((u) => !materialManagers.some((m) => m.user_id === u.id));

  const materialsMgrModal = showMaterialsMgr && materialsCourse && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '720px', width: '90%' }}>
        <h3>Materials — {materialsCourse.name}</h3>

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>Assigned Material Managers</label>
          <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 8px' }}>
            These users (plus superadmins) can add, edit, enable/disable, and delete materials for this course.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={assignManagerId} onChange={(e) => setAssignManagerId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Select user to assign...</option>
              {eligibleManagers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role || 'tutor'})</option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={assignManager} disabled={!assignManagerId}>Assign</button>
          </div>
          {materialManagers.length === 0 ? (
            <p style={{ color: '#888', fontSize: '13px' }}>No managers assigned. Only superadmin can manage materials.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #eee', borderRadius: '6px' }}>
              {materialManagers.map((m) => (
                <li key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                  <span>{m.name} <span style={{ color: '#888', fontSize: '12px' }}>({m.email}) — {m.role}</span></span>
                  <button type="button" className="btn btn-ghost" style={{ color: '#dc2626', padding: '4px 10px' }} onClick={() => unassignManager(m.user_id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>Add Material</label>
          <form onSubmit={submitMaterial}>
            <input
              type="text"
              placeholder="Title *"
              value={newMaterial.title}
              onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newMaterial.description}
              onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })}
              style={{ width: '100%', marginBottom: '8px' }}
            />
            <div className="form-row" style={{ gap: '8px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontSize: '13px' }}>File (pdf/video/doc)</label>
                <input
                  type="file"
                  onChange={(e) => setNewMaterial({ ...newMaterial, file: e.target.files[0] || null, url: '' })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ fontSize: '13px' }}>Or Link URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newMaterial.url}
                  onChange={(e) => setNewMaterial({ ...newMaterial, url: e.target.value, file: null })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>Add Material</button>
          </form>
        </div>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>Existing Materials ({materialsList.length})</label>
          {materialsList.length === 0 ? (
            <p style={{ color: '#888', fontSize: '13px' }}>No materials yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '260px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
              {materialsList.map((m) => (
                <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid #eee', opacity: m.is_enabled ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{m.title} <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>[{m.type}]</span></div>
                    {m.description && <div style={{ fontSize: '12px', color: '#666' }}>{m.description}</div>}
                    {m.type === 'file' && m.file_path && (
                      <a href={m.file_path} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#3B82F6' }}>{m.original_name || 'View file'}</a>
                    )}
                    {m.type === 'link' && m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#3B82F6', wordBreak: 'break-all' }}>{m.url}</a>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!m.is_enabled} onChange={() => toggleMaterial(m)} />
                    {m.is_enabled ? 'Enabled' : 'Disabled'}
                  </label>
                  <button type="button" className="btn btn-ghost" style={{ color: '#dc2626', padding: '4px 10px' }} onClick={() => deleteMaterial(m.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowMaterialsMgr(false)}>Done</button>
        </div>
      </div>
    </div>
  );

  const enrollFormModal = showEnrollForm && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editingEnroll ? 'Edit Enrollment' : 'Enroll Student'}</h3>
        <form onSubmit={saveEnroll}>
          {!editingEnroll && (
            <>
              <div className="form-group">
                <label>Student *</label>
                <select value={enrollForm.student_id} onChange={(e) => setEnrollForm({ ...enrollForm, student_id: e.target.value })} required>
                  <option value="">Select student...</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Course *</label>
                <select value={enrollForm.course_id} onChange={(e) => setEnrollForm({ ...enrollForm, course_id: e.target.value })} required>
                  <option value="">Select course...</option>
                  {(data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}
          {editingEnroll && (
            <div className="form-group">
              <label>Student / Course</label>
              <input value={`${editingEnroll.student_name} → ${editingEnroll.course_name}`} disabled />
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Progress %</label>
              <input type="number" min="0" max="100" value={enrollForm.progress_percentage} onChange={(e) => setEnrollForm({ ...enrollForm, progress_percentage: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Grade</label>
              <select value={enrollForm.grade} onChange={(e) => setEnrollForm({ ...enrollForm, grade: e.target.value })}>
                <option value="">No grade</option>
                <option>A+</option><option>A</option><option>A-</option>
                <option>B+</option><option>B</option><option>B-</option>
                <option>C+</option><option>C</option><option>C-</option>
                <option>D</option><option>F</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={enrollForm.status} onChange={(e) => setEnrollForm({ ...enrollForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowEnrollForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editingEnroll ? 'Update' : 'Enroll'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  // Only active courses are assignable — this excludes archived courses and the
  // hidden __test_call__ sentinel course (created as a 'draft').
  const assignableCourses = allCourses.filter((c) => c.status === 'active');
  const assignCourseModal = assignCourseStudent && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Assign Course</h3>
        <form onSubmit={submitAssignCourse}>
          <div className="form-group">
            <label>Student</label>
            <input value={`${assignCourseStudent.name}${assignCourseStudent.email ? ` (${assignCourseStudent.email})` : ''}`} disabled />
          </div>
          <div className="form-group">
            <label>Course *</label>
            <select value={assignCourseId} onChange={(e) => setAssignCourseId(e.target.value)} required autoFocus>
              <option value="">Select course...</option>
              {assignableCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.category ? ` — ${c.category}` : ''}</option>
              ))}
            </select>
            {assignableCourses.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>No active courses available to assign. Create or unarchive a course first.</p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAssignCourseStudent(null)} disabled={assignCourseBusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={assignCourseBusy || !assignCourseId}>{assignCourseBusy ? 'Assigning…' : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  // Only active tutors are assignable. "No tutor" clears the assignment.
  const assignableTutors = allTutors.filter((t) => t.status === 'active');
  const assignTutorModal = assignTutorStudent && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Assign Tutor</h3>
        <form onSubmit={submitAssignTutor}>
          <div className="form-group">
            <label>Student</label>
            <input value={`${assignTutorStudent.name}${assignTutorStudent.email ? ` (${assignTutorStudent.email})` : ''}`} disabled />
          </div>
          <div className="form-group">
            <label>Tutor</label>
            <select value={assignTutorId} onChange={(e) => setAssignTutorId(e.target.value)} autoFocus>
              <option value="">— No tutor —</option>
              {assignableTutors.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.specialization ? ` — ${t.specialization}` : ''}</option>
              ))}
            </select>
            {assignableTutors.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>No active tutors available. Add a tutor first.</p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAssignTutorStudent(null)} disabled={assignTutorBusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={assignTutorBusy}>{assignTutorBusy ? 'Saving…' : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  // Right-click menu on a student row.
  const studentContextMenu = studentCtxMenu && (
    <div style={{ position: 'fixed', top: studentCtxMenu.y, left: studentCtxMenu.x, zIndex: 1000, background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #E5E7EB)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 4, minWidth: 200 }}>
      <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border, #eee)', marginBottom: 4, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studentCtxMenu.student.name}</div>
      <button className="btn btn-sm btn-ghost btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => { openAddFaculty(studentCtxMenu.student); setStudentCtxMenu(null); }}>➕ Add Additional Faculty</button>
      <button className="btn btn-sm btn-ghost btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => { openEditBatch(studentCtxMenu.student); setStudentCtxMenu(null); }}>✏️ Edit Batch</button>
    </div>
  );

  // "Add Additional Faculty" modal — list, remove, and add extra tutors.
  const addFacultyModal = facultyStudent && (() => {
    const addableFaculty = allTutors.filter((t) =>
      t.status === 'active'
      && String(t.id) !== String(facultyStudent.assigned_tutor_id || '')
      && !facultyRows.some((r) => r.tutor_id === t.id));
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 480 }}>
          <h3>Additional Faculty — {facultyStudent.name}</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 4 }}>
            Primary tutor: {facultyStudent.assigned_tutor_name || 'none'}
          </p>
          {facultyLoading ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
          ) : facultyRows.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>No additional faculty assigned.</p>
          ) : (
            <div>
              {facultyRows.map((row) => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border, #eee)' }}>
                  <div>
                    <div>{row.tutor_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{[row.specialization, row.tutor_email].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost text-danger" disabled={facultyBusy} onClick={() => removeFaculty(row)}>🗑 Remove</button>
                </div>
              ))}
            </div>
          )}
          {!facultyLoading && (addableFaculty.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <select value={facultyAddId} onChange={(e) => setFacultyAddId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Add faculty…</option>
                {addableFaculty.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.specialization ? ` — ${t.specialization}` : ''}</option>
                ))}
              </select>
              <button className="btn btn-sm btn-primary" disabled={facultyBusy || !facultyAddId} onClick={addFaculty}>{facultyBusy ? 'Adding…' : 'Add'}</button>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 12 }}>No more active tutors available to add.</p>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setFacultyStudent(null)} disabled={facultyBusy}>Close</button>
          </div>
        </div>
      </div>
    );
  })();

  // "Edit Batch" modal — move the student to another team/batch.
  const editBatchModal = batchStudent && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Edit Batch</h3>
        <form onSubmit={submitEditBatch}>
          <div className="form-group">
            <label>Student</label>
            <input value={`${batchStudent.name}${batchStudent.email ? ` (${batchStudent.email})` : ''}`} disabled />
          </div>
          <div className="form-group">
            <label>Batch</label>
            <select value={batchTeamId} onChange={(e) => setBatchTeamId(e.target.value)} autoFocus>
              <option value="">— No batch —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {teams.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 4 }}>No batches yet. Create a team first.</p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setBatchStudent(null)} disabled={batchBusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={batchBusy}>{batchBusy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );

  const studentCoursesModal = coursesModalStudent && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <h3>Courses — {coursesModalStudent.name}</h3>
        {coursesModalLoading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
        ) : coursesModalRows.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>No courses assigned.</p>
        ) : (
          <div>
            {coursesModalRows.map((en) => (
              <div key={en.enrollment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border, #eee)' }}>
                <div>
                  <div>{en.course_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{[en.course_category, en.status].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn btn-sm btn-ghost text-danger" disabled={coursesModalAdding} onClick={() => removeStudentCourse(en)}>🗑 Delete</button>
              </div>
            ))}
          </div>
        )}
        {!coursesModalLoading && (() => {
          const enrolledIds = new Set(coursesModalRows.map((en) => String(en.course_id)));
          const addable = assignableCourses.filter((c) => !enrolledIds.has(String(c.id)));
          if (assignableCourses.length === 0) {
            return <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 12 }}>No active courses available to assign. Create or unarchive a course first.</p>;
          }
          if (addable.length === 0) {
            return <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 12 }}>All active courses are already assigned to this student.</p>;
          }
          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <select value={coursesModalAddId} onChange={(e) => setCoursesModalAddId(e.target.value)} style={{ flex: 1 }} disabled={coursesModalAdding}>
                <option value="">Add another course...</option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.category ? ` — ${c.category}` : ''}</option>
                ))}
              </select>
              <button type="button" className="btn btn-sm btn-primary" disabled={!coursesModalAddId || coursesModalAdding} onClick={addStudentCourse}>
                {coursesModalAdding ? 'Adding…' : '+ Add'}
              </button>
            </div>
          );
        })()}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setCoursesModalStudent(null)} disabled={coursesModalAdding}>Close</button>
        </div>
      </div>
    </div>
  );

  const enrollContactModal = pendingEnrollContact && (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Enroll {pendingEnrollContact.name && pendingEnrollContact.name !== '—' ? pendingEnrollContact.name : pendingEnrollContact.email}</h3>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          This contact isn’t a student yet. A student account will be created for{' '}
          <strong>{pendingEnrollContact.email}</strong> and a welcome email with a temporary password will be sent. Continue to enroll?
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPendingEnrollContact(null)} disabled={enrollBusy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirmCreateAndEnroll} disabled={enrollBusy}>
            {enrollBusy ? 'Creating…' : 'Create & Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  const sessionFormModal = showSessionForm && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Schedule Session</h3>
        <form onSubmit={saveSession}>
          <div className="form-group">
            <label>Course *</label>
            <select value={sessionForm.course_id} onChange={(e) => {
              const cid = e.target.value;
              const course = (data?.courses || []).find((c) => String(c.id) === cid);
              setSessionForm({ ...sessionForm, course_id: cid, tutor_id: course ? String(course.tutor_id) : '' });
            }} required>
              <option value="">Select course...</option>
              {(data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.tutor_name})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Student</label>
            <select value={sessionForm.student_id} onChange={(e) => setSessionForm({ ...sessionForm, student_id: e.target.value })}>
              <option value="">All Students (common session)</option>
              {(allStudents.length ? allStudents : students).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
            </select>
            <small style={{ color: 'var(--color-text-secondary)' }}>Choose a specific student for a private session, or leave on "All" to make it common to everyone enrolled.</small>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input type="datetime-local" value={sessionForm.start_time} onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>End Time *</label>
              <input type="datetime-local" value={sessionForm.end_time} onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} required />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowSessionForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Schedule</button>
          </div>
        </form>
      </div>
    </div>
  );

  const slotFormModal = editingSlot && (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Edit Time Slot{editingSlot.tutor_name ? ` — ${editingSlot.tutor_name}` : ''}</h3>
        <form onSubmit={saveSlot}>
          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input type="datetime-local" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>End Time *</label>
              <input type="datetime-local" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} required />
            </div>
          </div>
          <div className="form-group">
            <label>Note</label>
            <input value={slotForm.note} onChange={(e) => setSlotForm({ ...slotForm, note: e.target.value })} maxLength={255} placeholder="Optional note" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditingSlot(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="portal-layout portal-superadmin">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {message && <div className={`alert alert-${msgType}`} onClick={() => setMessage('')}>{message}</div>}
        {userFormModal}

        {showTeamForm && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 440 }}>
              <h3>{editingTeam ? 'Edit Team' : 'Add Team'}</h3>
              <form onSubmit={saveTeam}>
                <div className="form-group">
                  <label>Team Name</label>
                  <input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required placeholder="e.g. Team 1" />
                </div>
                <div className="form-group">
                  <label>Manager</label>
                  <select value={teamForm.manager_id || ''} onChange={(e) => setTeamForm({ ...teamForm, manager_id: e.target.value })}>
                    <option value="">— Unassigned —</option>
                    {(data?.users || []).filter((u) => u.role === 'manager').map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                {editingTeam && (
                  <div className="form-group">
                    <label>Status</label>
                    <select value={teamForm.status || editingTeam.status || 'active'} onChange={(e) => setTeamForm({ ...teamForm, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowTeamForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingTeam ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {inviteResult && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '440px' }}>
              <h3>Invite {inviteResult.name}</h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {inviteResult.emailed
                  ? `A login email was sent to ${inviteResult.email}.`
                  : 'Email could not be sent (SMTP not configured). Share these login details manually:'}
              </p>
              <div style={{ background: 'var(--color-bg)', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', lineHeight: 1.9 }}>
                <div><strong>Login:</strong> {inviteResult.login_url}</div>
                <div><strong>Email:</strong> {inviteResult.email}</div>
                <div><strong>Password:</strong> <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{inviteResult.password}</code></div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                They'll be asked to set their own password on first login.
              </p>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => setInviteResult(null)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {inviteAllResult && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '520px' }}>
              <h3>Invite All — Results</h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {inviteAllResult.total === 0
                  ? 'No active students with an email address were found.'
                  : `${inviteAllResult.emailed} of ${inviteAllResult.total} student(s) were emailed their login details.`}
              </p>
              {(inviteAllResult.failed || []).length > 0 && (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Email failed for the students below. Their passwords were still reset — share these login details manually (Login: {inviteAllResult.login_url}):
                  </p>
                  <div style={{ background: 'var(--color-bg)', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', lineHeight: 1.9, maxHeight: 260, overflowY: 'auto' }}>
                    {inviteAllResult.failed.map((f) => (
                      <div key={f.email} style={{ borderBottom: '1px solid var(--color-border, #eee)', padding: '4px 0' }}>
                        <strong>{f.name}</strong> — {f.email} · <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{f.password}</code>
                        {f.reason ? <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{f.reason}</div> : null}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                Every invited student's password was reset to a fresh temporary one; they'll set their own on first login.
              </p>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => setInviteAllResult(null)}>Done</button>
              </div>
            </div>
          </div>
        )}
        {courseFormModal}
        {courseMgrModal}
        {categoryMgrModal}
        {meetingFormModal}
        {materialsMgrModal}
        {enrollFormModal}
        {enrollContactModal}
        {assignCourseModal}
        {assignTutorModal}
        {studentContextMenu}
        {addFacultyModal}
        {editBatchModal}
        {studentCoursesModal}
        {sessionFormModal}
        {slotFormModal}

        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Hello {firstName},</h2>
              {(() => {
                const connected = dbHealth?.database === 'connected';
                const checking = dbHealth === null;
                const color = checking ? '#9CA3AF' : (connected ? '#10B981' : '#EF4444');
                const label = checking ? 'Checking database…' : (connected ? 'Database connected' : 'Database offline');
                return (
                  <span
                    title={dbHealth?.error || label}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.4rem 0.85rem', borderRadius: '999px',
                      background: 'var(--color-surface)', boxShadow: 'var(--shadow)',
                      fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}33` }} />
                    {label}
                  </span>
                );
              })()}
            </div>

            <div className="kpi-grid">
              <KPICard variant="small-box" title="Contacts" value={hubspotCount == null ? '—' : hubspotCount} icon="users" color="#FF7A59" onClick={() => setActiveTab('contacts')} />
              <KPICard variant="small-box" title="Kajabi Contacts" value={kajabiCount == null ? '—' : kajabiCount} icon="contact" color="#1A6DFF" onClick={() => setActiveTab('kajabi')} />
              <KPICard variant="small-box" title="Total Students" value={stats.total_students} icon="users" color="#3B82F6" onClick={() => setActiveTab('students')} />
              <KPICard variant="small-box" title="Total Tutors" value={stats.total_tutors} icon="users" color="#10B981" onClick={() => setActiveTab('tutors')} />
              <KPICard variant="small-box" title="Active Courses" value={stats.total_courses} icon="book" color="#8B5CF6" onClick={() => setActiveTab('courses')} />
              <KPICard variant="small-box" title="Enrollments" value={stats.total_enrollments} icon="layers" color="#F59E0B" onClick={() => setActiveTab('enrollments')} />
              <KPICard variant="small-box" title="Active Sessions" value={stats.active_sessions} icon="video" color="#EF4444" onClick={() => setActiveTab('sessions')} />
              <KPICard variant="small-box" title="Total Users" value={stats.total_users} icon="users" color="#06B6D4" onClick={() => setActiveTab('users')} />
              <KPICard variant="small-box" title="Advisors" value={stats.total_advisors} icon="users" color="#EC4899" onClick={() => setActiveTab('users')} />
              <KPICard variant="small-box" title="Managers" value={stats.total_managers} icon="users" color="#0891B2" onClick={() => setActiveTab('users')} />
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Revenue (last 12 months)</h3>
              <RevenueChart data={revenueMonthly} />
            </div>
          </div>
        )}

        {/* ===== CONTACTS (HubSpot) ===== */}
        {activeTab === 'contacts' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Contacts</h2>
              {hubspot.hubspot_connected && (
                <button className="btn btn-ghost" onClick={() => loadContacts(contactPage)} disabled={contactsLoading}>
                  {contactsLoading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              )}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              Contact list synced from your HubSpot CRM account.
            </p>

            {!hubspot.hubspot_connected ? (
              <div className="alert" style={{ background: 'rgba(245,158,11,0.12)', color: '#92400e' }}>
                HubSpot isn’t connected yet. Go to <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('settings')}>Settings → HubSpot</button> and add a private-app access token to load your contacts.
              </div>
            ) : contactsError ? (
              <div className="alert" style={{ background: 'rgba(239,68,68,0.12)', color: '#991b1b' }}>
                Failed to load contacts: {contactsError}
              </div>
            ) : contactsLoading && contacts.length === 0 ? (
              <div><div className="spinner" /><p>Loading contacts…</p></div>
            ) : (
              <div className="data-table-container">
                <div className="data-table-toolbar">
                  <input
                    type="text"
                    placeholder="Search name, email, phone…"
                    value={contactSearchInput}
                    onChange={(e) => setContactSearchInput(e.target.value)}
                    className="data-table-search"
                  />
                  <span className="data-table-count">
                    {contactsTotal != null ? `${contactsTotal.toLocaleString()} records` : `${contacts.length} records`}
                  </span>
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>{contactColumns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {contacts.length === 0 ? (
                        <tr><td colSpan={contactColumns.length} className="no-data">No contacts found</td></tr>
                      ) : (
                        contacts.map((row) => (
                          <tr key={row.id}>
                            {contactColumns.map((col) => (
                              <td key={col.key}>{col.render ? col.render(row) : (row[col.accessor] || '—')}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="data-table-pagination">
                  <button onClick={() => loadContacts(contactPage - 1)} disabled={contactPage === 0 || contactsLoading}>Prev</button>
                  <span>
                    Page {contactPage + 1}
                    {contactsTotal != null ? ` of ${Math.max(1, Math.ceil(contactsTotal / 100)).toLocaleString()}` : ''}
                  </span>
                  <button onClick={() => loadContacts(contactPage + 1)} disabled={!contactNextAfter || contactsLoading}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== KAJABI CONTACTS ===== */}
        {activeTab === 'kajabi' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Kajabi Contacts</h2>
              {kajabi.kajabi_connected && (
                <button className="btn btn-ghost" onClick={() => loadKajabiContacts(kajabiPage)} disabled={kajabiLoading}>
                  {kajabiLoading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              )}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              Contact list synced from your Kajabi account. Use <strong>Enroll</strong> to bring a contact into the academy.
            </p>

            {!kajabi.kajabi_connected ? (
              <div className="alert" style={{ background: 'rgba(245,158,11,0.12)', color: '#92400e' }}>
                Kajabi isn’t connected yet. Go to <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('integrations')}>Settings → Integrations → Kajabi</button> and add your API credentials to load contacts.
              </div>
            ) : kajabiError ? (
              <div className="alert" style={{ background: 'rgba(239,68,68,0.12)', color: '#991b1b' }}>
                Failed to load Kajabi contacts: {kajabiError}
              </div>
            ) : kajabiLoading && kajabiContacts.length === 0 ? (
              <div><div className="spinner" /><p>Loading contacts…</p></div>
            ) : (
              <div className="data-table-container">
                <div className="data-table-toolbar">
                  <input
                    type="text"
                    placeholder="Search name, email, phone…"
                    value={kajabiSearchInput}
                    onChange={(e) => setKajabiSearchInput(e.target.value)}
                    className="data-table-search"
                  />
                  <span className="data-table-count">
                    {kajabiTotal != null ? `${kajabiTotal.toLocaleString()} records` : `${kajabiContacts.length} records`}
                  </span>
                </div>

                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>{contactColumns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {kajabiContacts.length === 0 ? (
                        <tr><td colSpan={contactColumns.length} className="no-data">No contacts found</td></tr>
                      ) : (
                        kajabiContacts.map((row) => (
                          <tr key={row.id}>
                            {contactColumns.map((col) => (
                              <td key={col.key}>{col.render ? col.render(row) : (row[col.accessor] || '—')}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="data-table-pagination">
                  <button onClick={() => loadKajabiContacts(kajabiPage - 1)} disabled={kajabiPage <= 1 || kajabiLoading}>Prev</button>
                  <span>
                    Page {kajabiPage}
                    {kajabiTotal != null ? ` of ${Math.max(1, Math.ceil(kajabiTotal / 100)).toLocaleString()}` : ''}
                  </span>
                  <button onClick={() => loadKajabiContacts(kajabiPage + 1)} disabled={!kajabiHasNext || kajabiLoading}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== STUDENTS ===== */}
        {activeTab === 'students' && !studentDetail && !studentDetailLoading && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Student Management</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" style={{ color: '#10B981' }} disabled={inviteAllBusy} onClick={handleInviteAll}>{inviteAllBusy ? 'Sending Invites…' : 'Invite All'}</button>
                <button className="btn btn-primary" onClick={() => openCreateUser('student')}>+ Add Student</button>
              </div>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              Click a student to view their full profile.
            </p>
            <DataTable columns={studentColumns} data={allStudents} pageSize={15} selectable onRowClick={openStudentDetail} onRowContextMenu={openStudentContextMenu} onBulkAction={bulkDeleteUsers} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {activeTab === 'students' && studentDetailLoading && (
          <div className="portal-page"><div className="spinner" /><p>Loading student…</p></div>
        )}

        {activeTab === 'students' && studentDetail && (
          <div className="portal-page">
            <button className="btn btn-ghost" onClick={() => setStudentDetail(null)} style={{ marginBottom: '1rem' }}>← Back to Students</button>

            <div className="page-header" style={{ alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  className="avatar"
                  style={{
                    width: '64px', height: '64px', fontSize: '24px',
                    backgroundColor: studentDetail.profile.avatar_color || '#4F46E5',
                    backgroundImage: studentDetail.profile.avatar_url ? `url(${studentDetail.profile.avatar_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    color: studentDetail.profile.avatar_url ? 'transparent' : '#fff',
                  }}
                >
                  {!studentDetail.profile.avatar_url && studentDetail.profile.name?.[0]}
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>{studentDetail.profile.name}</h2>
                  <div style={{ color: 'var(--color-text-secondary)' }}>{studentDetail.profile.email}</div>
                  <span className={`status-badge status-${studentDetail.profile.status}`}>{studentDetail.profile.status}</span>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => openEditUser(studentDetail.profile)}>Edit</button>
            </div>

            <div className="kpi-grid" style={{ marginTop: '1rem' }}>
              <KPICard title="Enrolled Courses" value={studentDetail.stats.enrolled_courses} icon="book" color="#3B82F6" />
              <KPICard title="Avg Progress" value={`${studentDetail.stats.avg_progress}%`} icon="percent" color="#10B981" />
              <KPICard title="Sessions" value={studentDetail.stats.total_sessions} icon="video" color="#8B5CF6" />
              <KPICard title="Sessions Attended" value={studentDetail.stats.sessions_attended} icon="check-circle" color="#F59E0B" />
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Enrolled Courses</h3>
              {studentDetail.enrollments.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No enrollments.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'category', label: 'Category', accessor: 'category' },
                    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
                    { key: 'progress', label: 'Progress', accessor: 'progress_percentage', render: (r) => progressCol(r, 'progress_percentage') },
                    { key: 'grade', label: 'Grade', accessor: 'grade', render: (r) => r.grade || '-' },
                    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
                  ]}
                  data={studentDetail.enrollments}
                  searchable={false}
                />
              )}
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Sessions</h3>
              {studentDetail.sessions.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No sessions.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'tutor', label: 'Tutor', accessor: 'tutor_name' },
                    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleString() },
                    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
                  ]}
                  data={studentDetail.sessions}
                  searchable={false}
                  pageSize={10}
                />
              )}
            </div>

            <div className="section" style={{ marginTop: '1.5rem' }}>
              <h3>Attendance</h3>
              {studentDetail.attendance.length === 0 ? <p style={{ color: 'var(--color-text-secondary)' }}>No attendance records.</p> : (
                <DataTable
                  columns={[
                    { key: 'course', label: 'Course', accessor: 'course_name' },
                    { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => r.start_time ? new Date(r.start_time).toLocaleDateString() : '-' },
                    { key: 'join', label: 'Joined', accessor: 'join_time', render: (r) => r.join_time ? new Date(r.join_time).toLocaleTimeString() : '-' },
                    { key: 'leave', label: 'Left', accessor: 'leave_time', render: (r) => r.leave_time ? new Date(r.leave_time).toLocaleTimeString() : '—' },
                    { key: 'duration', label: 'Duration', accessor: 'duration_minutes', render: (r) => r.duration_minutes ? `${r.duration_minutes} min` : '—' },
                  ]}
                  data={studentDetail.attendance}
                  searchable={false}
                  pageSize={10}
                />
              )}
            </div>
          </div>
        )}

        {/* ===== TUTORS ===== */}
        {activeTab === 'tutors' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Tutor Management</h2>
              <button className="btn btn-primary" onClick={() => openCreateUser('tutor')}>+ Add Tutor</button>
            </div>
            <DataTable columns={tutorColumns} data={allTutors} pageSize={15} selectable onBulkAction={bulkDeleteUsers} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {/* ===== ALL USERS ===== */}
        {activeTab === 'users' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>All Users</h2>
              <button className="btn btn-primary" onClick={() => openCreateUser('student')}>+ Add User</button>
            </div>
            <DataTable columns={userColumns} data={users} pageSize={15} selectable onBulkAction={bulkDeleteUsers} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {/* ===== COURSES ===== */}
        {activeTab === 'courses' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Course Management</h2>
              <button className="btn btn-primary" onClick={openCreateCourse}>+ Add Course</button>
            </div>
            <DataTable columns={courseColumns} data={allCourses} pageSize={15} selectable onBulkAction={bulkDeleteCourses} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {/* ===== CATEGORIES ===== */}
        {activeTab === 'categories' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Course Categories</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  placeholder="New category name"
                  style={{ maxWidth: 220 }}
                />
                <button className="btn btn-primary" onClick={addCategory}>+ Add Category</button>
              </div>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Renaming a category re-files every course under it. A category still holding courses cannot be deleted.
            </p>
            <DataTable columns={categoryColumns} data={categories} pageSize={15} />
          </div>
        )}

        {/* ===== ENROLLMENTS ===== */}
        {activeTab === 'enrollments' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Enrollment Management</h2>
              <button className="btn btn-primary" onClick={openCreateEnroll}>+ Enroll Student</button>
            </div>
            <DataTable columns={enrollColumns} data={allEnrollments} pageSize={15} selectable onBulkAction={bulkDeleteEnrollments} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {activeTab === 'tickets' && <Tickets />}

        {/* ===== TEAMS ===== */}
        {activeTab === 'teams' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Teams</h2>
              <button className="btn btn-primary" onClick={openCreateTeam}>+ Add Team</button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Each team is owned by a manager. Assign advisors, tutors and students to a team via their user profile.
            </p>
            <DataTable
              columns={[
                { key: 'name', label: 'Team', accessor: 'name', render: (r) => <strong>{r.name}</strong> },
                { key: 'manager', label: 'Manager', accessor: 'manager_name', render: (r) => r.manager_name || <span style={{ color: 'var(--color-text-secondary)' }}>Unassigned</span> },
                { key: 'advisors', label: 'Advisors', accessor: 'advisors' },
                { key: 'tutors', label: 'Tutors', accessor: 'tutors' },
                { key: 'students', label: 'Students', accessor: 'students' },
                { key: 'status', label: 'Status', accessor: 'status' },
                { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                  <div className="table-actions">
                    <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); openEditTeam(r); }}>Edit</button>
                    <button className="btn btn-sm btn-ghost text-danger" onClick={(e) => { e.stopPropagation(); deleteTeam(r.id); }}>Delete</button>
                  </div>
                )},
              ]}
              data={teams}
              pageSize={15}
            />
          </div>
        )}

        {/* ===== RATINGS ===== */}
        {activeTab === 'ratings' && <RatingsView />}

        {/* ===== MEETINGS ===== */}
        {activeTab === 'meetings' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Meetings</h2>
              <button className="btn btn-primary" onClick={openMeetingForm} disabled={creatingMeeting}>
                + New Meeting
              </button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Create a temporary meeting link. Share the link and 5-digit passcode — anyone can join directly, no account needed.
              Ended meetings stay here as history until you delete them.
            </p>
            {meetings.length === 0 ? (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                No meetings yet. Click “New Meeting” to create one.
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Host</th>
                      <th>Link</th>
                      <th>Passcode</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.map((m) => {
                      const active = m.status === 'active';
                      return (
                        <tr key={m.id} style={{ opacity: active ? 1 : 0.65 }}>
                          <td><strong>{m.title}</strong></td>
                          <td style={{ fontSize: '13px' }}>
                            {m.host_name || '—'}
                            {m.host_email && <div style={{ color: '#888', fontSize: '12px' }}>{m.host_email}</div>}
                          </td>
                          <td>
                            {active ? (
                              <a href={meetingLink(m.code)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary, #4F46E5)' }}>
                                /m/{m.code}
                              </a>
                            ) : (
                              <span style={{ color: '#aaa' }}>/m/{m.code}</span>
                            )}
                          </td>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.15em' }}>{m.passcode}</span></td>
                          <td>
                            <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', background: active ? '#DCFCE7' : '#F1F5F9', color: active ? '#166534' : '#64748B' }}>
                              {active ? 'Active' : 'Ended'}
                            </span>
                          </td>
                          <td style={{ color: '#888', fontSize: '13px' }}>{new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {active && <button className="btn btn-sm btn-ghost" onClick={() => copyMeeting(m)}>Copy</button>}
                            {active && <a className="btn btn-sm btn-ghost" href={meetingLink(m.code)} target="_blank" rel="noreferrer">Open</a>}
                            {active && <button className="btn btn-sm btn-ghost" onClick={() => endMeeting(m.id)}>End</button>}
                            <button className="btn btn-sm btn-ghost text-danger" onClick={() => deleteMeeting(m.id)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== SESSIONS ===== */}
        {activeTab === 'sessions' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Session Management</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setShowScheduleCalendar(true)}>📅 Show Schedules</button>
                <button className="btn btn-primary" onClick={openCreateSession}>+ Schedule Session</button>
              </div>
            </div>
            <DataTable columns={sessionColumns} data={allSessions} pageSize={15} selectable onBulkAction={bulkDeleteSessions} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {showScheduleCalendar && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '900px', width: '95%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>Schedules</h3>
                <button type="button" className="btn btn-ghost" onClick={() => setShowScheduleCalendar(false)}>✕</button>
              </div>
              <Calendar sessions={allSessions} onSessionClick={(s) => { setShowScheduleCalendar(false); handleJoinSession(s); }} />
            </div>
          </div>
        )}

        {/* ===== ATTENDANCE ===== */}
        {activeTab === 'attendance' && (
          <div className="portal-page">
            <h2>Attendance Records</h2>
            <DataTable columns={attendanceColumns} data={allAttendance} pageSize={20} />
          </div>
        )}

        {/* ===== STAFF ATTENDANCE (admin) ===== */}
        {activeTab === 'staffattendance' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Staff Attendance</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="month" value={staffAttPeriod} onChange={(e) => setStaffAttPeriod(e.target.value)} style={{ maxWidth: 170 }} />
                <button className="btn btn-ghost" onClick={refreshStaffAtt}>↻ Refresh</button>
                <button className="btn btn-primary" onClick={openStaffAttForm}>+ Add / Edit Day</button>
              </div>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Work-attendance for advisors &amp; managers — their logged hours drive salary, billed per hour at the rate of the shift each hour fell in. They can also clock in themselves from their portal. Tutors are paid from their session records instead.
            </p>
            <DataTable columns={staffAttColumns} data={staffAtt} pageSize={20} />
          </div>
        )}

        {/* ===== SALARY / PAYROLL (admin) ===== */}
        {activeTab === 'payroll' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Salary / Payroll</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="month" value={payrollPeriod} onChange={(e) => setPayrollPeriod(e.target.value)} style={{ maxWidth: 170 }} />
                <button className="btn btn-secondary" disabled={payrollBusy} onClick={() => setPayrollPeriod(new Date().toISOString().slice(0, 7))}>Reset</button>
                <button className="btn btn-primary" disabled={payrollBusy} onClick={payAll}>Mark All Paid</button>
              </div>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              Pay is <strong>per hour at the rate of the shift the work fell in</strong>. Tutor hours are the tutor's own time in each session (their join → leave, capped at the scheduled window); advisors and managers are paid from their clock-in records. A session the tutor never joined is not payable.
            </p>
            {payroll && (
              <>
                <div className="kpi-grid">
                  <KPICard title="Total Payroll" value={formatMoney(payroll.totals.gross_total)} subtitle={new Date(payrollPeriod + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} icon="dollar" color="#10B981" />
                  <KPICard title="Staff" value={payroll.totals.staff_count} icon="users" color="#3B82F6" />
                  <KPICard title="Paid" value={`${payroll.totals.paid_count} · ${formatMoney(payroll.totals.paid_total)}`} icon="check-circle" color="#8B5CF6" />
                  <KPICard title="Pending" value={payroll.totals.pending_count} icon="alert" color="#F59E0B" />
                </div>

                {/* Where the month's hours and money actually landed. */}
                <div className="section">
                  <h3>Shift Breakdown</h3>
                  <div className="stats-bars">
                    {(payroll.shift_totals || []).map((sh) => (
                      <div key={sh.key} className="stats-bar-item">
                        <span className="stats-bar-label">{sh.label} · {sh.from}–{sh.to}</span>
                        <div className="stats-bar">
                          <div className="stats-bar-fill" style={{ width: `${(sh.hours / Math.max(...(payroll.shift_totals || []).map((x) => x.hours), 1)) * 100}%` }} />
                        </div>
                        <span className="stats-bar-value">{sh.hours.toFixed(2)} h · {formatMoney(sh.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Rate bands per hour: {(payroll.shifts || []).map((sh) => `${sh.label} ${sh.from}–${sh.to} ${appSettings.currency} ${sh.min_rate}–${sh.max_rate}`).join('  ·  ')}
                  </p>
                </div>

                {/* Sits directly above the table it acts on, next to the row checkboxes. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                  <button className="btn btn-primary" disabled={payrollBusy || payrollPicked.size === 0} onClick={calculateSalary}>
                    Calculate Salary{payrollPicked.size ? ` (${payrollPicked.size})` : ''}
                  </button>
                </div>

                <DataTable columns={payrollColumns} data={payroll.rows} pageSize={20} />

                {payrollCalc && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <div className="card" style={{ minWidth: 320, maxWidth: 460, padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <h3 style={{ margin: 0 }}>Calculated Salary</h3>
                        <button className="btn btn-sm btn-ghost" onClick={() => setPayrollCalc(null)}>Clear</button>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0.25rem 0 0.75rem' }}>
                        {payrollCalc.staff_count} staff selected · {new Date(payrollPeriod + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                      </p>
                      {payrollCalc.rows.map((r) => (
                        <div key={r.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                          <span>{r.name} <span style={{ color: 'var(--color-text-secondary)' }}>({r.hours.toFixed(2)} h)</span></span>
                          <span>{formatMoney(r.gross)}</span>
                        </div>
                      ))}
                      {payrollCalc.shifts.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
                          {payrollCalc.shifts.map((sh) => (
                            <div key={sh.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              <span>{sh.label}</span>
                              <span>{sh.hours.toFixed(2)} h · {formatMoney(sh.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Total hours</span><span>{payrollCalc.hours.toFixed(2)} h</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Unpaid portion</span><span>{formatMoney(payrollCalc.pending)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 18 }}>
                        <strong>Total salary</strong><strong>{formatMoney(payrollCalc.gross)}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Staff attendance add/edit modal */}
        {showStaffAttForm && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 460, width: '92%' }}>
              <h3>Staff Attendance</h3>
              <form onSubmit={saveStaffAtt}>
                <div className="form-group">
                  <label>Staff Member</label>
                  <select value={staffAttForm.user_id} onChange={(e) => setStaffAttForm({ ...staffAttForm, user_id: e.target.value })} required>
                    <option value="">Select staff…</option>
                    {staffList.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={staffAttForm.work_date} onChange={(e) => setStaffAttForm({ ...staffAttForm, work_date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={staffAttForm.status} onChange={(e) => setStaffAttForm({ ...staffAttForm, status: e.target.value })}>
                      <option value="present">Present</option>
                      <option value="half_day">Half day</option>
                      <option value="leave">Leave</option>
                      <option value="absent">Absent</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Hours worked</label>
                  <input type="number" min="0" step="0.25" value={staffAttForm.hours} onChange={(e) => setStaffAttForm({ ...staffAttForm, hours: parseFloat(e.target.value) || 0 })} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <input type="text" value={staffAttForm.note} onChange={(e) => setStaffAttForm({ ...staffAttForm, note: e.target.value })} placeholder="Optional" />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowStaffAttForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== RECORDINGS ===== */}
        {activeTab === 'recordings' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Recordings</h2>
              <button className="btn btn-ghost" onClick={() => api.getMeetingRecords().then(setRecordings).catch(() => {})}>↻ Refresh</button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              All session recordings captured across every tutor and course.
            </p>
            {recordings.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No recordings have been captured yet.</p>
            ) : (
              <DataTable
                columns={[
                  { key: 'course', label: 'Course', accessor: 'course_name', render: (r) => r.course_name || '—' },
                  { key: 'tutor', label: 'Tutor', accessor: 'tutor_name', render: (r) => r.tutor_name || '—' },
                  { key: 'session', label: 'Session Date', accessor: 'start_time', render: (r) => r.start_time ? new Date(r.start_time).toLocaleString() : '—' },
                  { key: 'date', label: 'Recorded', accessor: 'creation_date', render: (r) => r.creation_date ? new Date(r.creation_date).toLocaleString() : '—' },
                  { key: 'file', label: 'File', sortable: false, render: (r) => (
                    r.file_exists === false
                      ? <span className="status-badge status-inactive" title="The recording file is missing on the server">Missing</span>
                      : <span className="status-badge status-active">Available</span>
                  )},
                  { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                    <div className="table-actions">
                      {r.file_exists === false ? (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85em' }}>File unavailable</span>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setRecPlayUrl(r)}>▶ Play</button>
                          <a className="btn btn-sm btn-ghost" href={r.playback_url} download={recordingFileName(r)}>⬇ Download</a>
                        </>
                      )}
                      <button className="btn btn-sm btn-ghost text-danger" onClick={async () => {
                        if (!window.confirm('Delete this recording? This permanently removes the file.')) return;
                        try { await api.deleteMeetingRecord(r.record_id); setRecordings((list) => list.filter((x) => x.record_id !== r.record_id)); }
                        catch (err) { setMessage(err.message || 'Failed to delete recording'); setMsgType('error'); }
                      }}>🗑 Delete</button>
                    </div>
                  )},
                ]}
                data={recordings}
                pageSize={20}
                selectable
                rowId={(r) => r.record_id}
                onBulkAction={bulkDeleteRecordings}
                bulkActionLabel="Delete Selected"
              />
            )}

            {recPlayUrl && (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: '860px', width: '100%' }}>
                  <div className="page-header" style={{ alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Recording</h3>
                    <button className="btn btn-ghost" onClick={() => setRecPlayUrl(null)}>✕ Close</button>
                  </div>
                  <video src={recPlayUrl.playback_url} controls autoPlay style={{ width: '100%', borderRadius: '8px', background: '#000' }} />
                  <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                    <a className="btn btn-ghost" href={recPlayUrl.playback_url} download={recordingFileName(recPlayUrl)}>⬇ Download</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== TIME SLOTS (tutor availability) ===== */}
        {activeTab === 'timeslots' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Time Slots</h2>
              <button className="btn btn-ghost" onClick={() => api.getAvailability().then(setAllTimeSlots).catch(() => {})}>↻ Refresh</button>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem' }}>
              All availability slots published by tutors. Booked slots show the student who reserved them.
            </p>
            {allTimeSlots.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No tutor has published any slots yet.</p>
            ) : (
              <DataTable
                columns={[
                  { key: 'tutor', label: 'Tutor', accessor: 'tutor_name', render: (r) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="avatar-sm" style={{ backgroundColor: r.tutor_color }}>{r.tutor_name?.[0]}</div>
                      {r.tutor_name}
                    </div>
                  )},
                  { key: 'date', label: 'Date', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleDateString() },
                  { key: 'time', label: 'Time', accessor: 'start_time', render: (r) => `${new Date(r.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(r.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
                  { key: 'note', label: 'Note', accessor: 'note', render: (r) => r.note || '—' },
                  { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status === 'open' ? 'active' : r.status === 'booked' ? 'live' : 'inactive'}`}>{r.status}</span> },
                  { key: 'booked_by', label: 'Booked By', accessor: 'student_name', render: (r) => r.student_name || '—' },
                  { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
                    <div className="table-actions">
                      <button className="btn btn-sm btn-ghost" disabled={r.status === 'booked'} title={r.status === 'booked' ? 'Booked slots cannot be edited' : 'Edit'} onClick={(e) => { e.stopPropagation(); openEditSlot(r); }}>Edit</button>
                      <button className="btn btn-sm btn-ghost text-danger" disabled={r.status === 'booked'} title={r.status === 'booked' ? 'Booked slots cannot be deleted' : 'Delete'} onClick={(e) => { e.stopPropagation(); deleteSlot(r); }}>Delete</button>
                    </div>
                  )},
                ]}
                data={allTimeSlots}
                pageSize={20}
              />
            )}
          </div>
        )}

        {/* ===== REPORTS ===== */}
        {activeTab === 'reports' && (
          <div className="portal-page">
            <h2>Reports & Analytics</h2>
            {reports && (
              <>
                <div className="kpi-grid">
                  <KPICard title="Total Students" value={reports.total_students} icon="users" color="#3B82F6" />
                  <KPICard title="Active Enrollments" value={reports.active_enrollments} icon="layers" color="#10B981" />
                  <KPICard title="Completed" value={reports.completed_enrollments} icon="check-circle" color="#8B5CF6" />
                  <KPICard title="Avg Progress" value={`${reports.avg_progress}%`} icon="trending-up" color="#F59E0B" />
                  <KPICard title="Attendance Rate" value={`${reports.avg_attendance_rate}%`} icon="percent" color="#06B6D4" />
                  <KPICard title="Sessions Done" value={reports.completed_sessions} icon="video" color="#EC4899" />
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

        {/* ===== AUDIT LOGS ===== */}
        {activeTab === 'system' && (
          <div className="portal-page">
            <h2>Audit Logs</h2>
            <DataTable columns={auditColumns} data={data?.audit_logs || []} pageSize={20} />
          </div>
        )}

        {/* ===== SETTINGS ===== */}
        {activeTab === 'settings' && (
          <div className="portal-page">
            <h2>Settings</h2>

            {/* Currency */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Currency</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Used for tutor payouts and other monetary displays.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setAppSettingsSaving(true);
                try {
                  const result = await api.saveAppSettings({ currency: appSettings.currency });
                  setAppSettings({ currency: result.currency });
                  showMsg('Currency updated', 'success');
                  if (allTutors.length) api.getTutors().then(setAllTutors);
                } catch (err) { showMsg(err.message, 'error'); }
                finally { setAppSettingsSaving(false); }
              }}>
                <div className="form-row">
                  <div className="form-group" style={{ maxWidth: '240px' }}>
                    <label>Currency</label>
                    <select
                      value={appSettings.currency}
                      onChange={(e) => setAppSettings({ ...appSettings, currency: e.target.value })}
                    >
                      <option value="INR">INR — Indian Rupee</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="GBP">GBP — British Pound</option>
                      <option value="AED">AED — UAE Dirham</option>
                      <option value="AUD">AUD — Australian Dollar</option>
                      <option value="CAD">CAD — Canadian Dollar</option>
                      <option value="SGD">SGD — Singapore Dollar</option>
                      <option value="JPY">JPY — Japanese Yen</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={appSettingsSaving}>
                    {appSettingsSaving ? 'Saving...' : 'Save Currency'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== INTEGRATIONS ===== */}
        {activeTab === 'integrations' && (
          <div className="portal-page">
            <h2>Integrations</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
              Connect external services for video meetings, CRM contacts, and transactional email.
            </p>

            {/* Video / Meeting Provider */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Video / Meeting Provider</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Choose how live sessions run. <strong>WebRTC</strong> is built-in and needs no setup.
                <strong> Zoom</strong> uses your own Zoom account via a Server-to-Server OAuth app.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setVideoSaving(true);
                try {
                  const r = await api.saveVideoSettings(videoSettings);
                  showMsg('Video settings saved', 'success');
                  // Secrets are write-only; clear the fields and mark them stored.
                  setVideoSettings((v) => ({
                    ...v,
                    zoom_has_secret: v.zoom_client_secret ? true : v.zoom_has_secret,
                    zoom_client_secret: '',
                    livekit_has_secret: v.livekit_api_secret ? true : v.livekit_has_secret,
                    livekit_api_secret: '',
                    livekit_source: r.livekit_source || v.livekit_source,
                    livekit_configured: r.livekit_source && r.livekit_source !== 'none' ? true : v.livekit_configured,
                  }));
                  // Re-verify the live connection + usage after a save.
                  api.getLiveKitStatus().then(setLivekitStatus).catch(() => {});
                  api.getLiveKitUsage().then(setLivekitUsage).catch(() => {});
                } catch (err) { showMsg(err.message || 'Failed to save', 'error'); }
                finally { setVideoSaving(false); }
              }}>
                <div className="form-row">
                  <div className="form-group" style={{ maxWidth: '320px' }}>
                    <label>Provider</label>
                    <select
                      value={videoSettings.video_provider}
                      onChange={(e) => setVideoSettings({ ...videoSettings, video_provider: e.target.value })}
                    >
                      <option value="webrtc">WebRTC — built-in (best for 1:1 / small groups)</option>
                      <option value="zoom">Zoom</option>
                      <option value="livekit">LiveKit — webinar (50–100+ participants)</option>
                    </select>
                  </div>
                </div>

                {videoSettings.video_provider === 'livekit' && (
                  <div style={{ marginTop: '1rem' }}>
                    {/* Existing connection data */}
                    <div className="settings-section" style={{ background: 'var(--color-bg-secondary, #f8f9fa)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0 }}>Current LiveKit Server</h4>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {videoSettings.livekit_source && videoSettings.livekit_source !== 'none' && (
                            <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}>
                              {videoSettings.livekit_source === 'database' ? 'Added in app' : 'From .env'}
                            </span>
                          )}
                          <button type="button" className="btn btn-ghost btn-sm" disabled={livekitTesting || !videoSettings.livekit_configured} onClick={async () => {
                            setLivekitTesting(true);
                            try { setLivekitStatus(await api.getLiveKitStatus()); }
                            catch (err) { showMsg(err.message || 'Test failed', 'error'); }
                            finally { setLivekitTesting(false); }
                          }}>{livekitTesting ? 'Testing…' : '⟳ Test connection'}</button>
                        </div>
                      </div>

                      {videoSettings.livekit_configured ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 14, alignItems: 'center' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>Server URL</span>
                          <code style={{ wordBreak: 'break-all' }}>{videoSettings.livekit_url || '—'}</code>
                          <span style={{ color: 'var(--color-text-secondary)' }}>API Key</span>
                          <code>{videoSettings.livekit_api_key
                            ? (videoSettings.livekit_api_key.length > 12 ? `${videoSettings.livekit_api_key.slice(0, 6)}…${videoSettings.livekit_api_key.slice(-4)}` : videoSettings.livekit_api_key)
                            : '—'}</code>
                          <span style={{ color: 'var(--color-text-secondary)' }}>API Secret</span>
                          <span>{videoSettings.livekit_has_secret ? '•••••••• (stored)' : '— not set —'}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>Status</span>
                          <span>
                            {livekitStatus
                              ? (livekitStatus.connected
                                  ? <span style={{ color: '#059669', fontWeight: 600 }}>✓ Connected{typeof livekitStatus.active_rooms === 'number' ? ` · ${livekitStatus.active_rooms} active room(s)` : ''}</span>
                                  : <span style={{ color: '#DC2626', fontWeight: 600 }}>✕ Unreachable{livekitStatus.error ? ` · ${livekitStatus.error}` : ''}</span>)
                              : <span style={{ color: 'var(--color-text-secondary)' }}>Click “Test connection” to verify</span>}
                          </span>
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: '#991b1b' }}>
                          ⚠ No LiveKit server configured yet. Add one below, or set the <code>LIVEKIT_*</code> env vars (see <code>.env.example</code>).
                        </p>
                      )}

                      {videoSettings.livekit_source === 'database' && (
                        <button type="button" className="btn btn-ghost btn-sm text-danger" style={{ marginTop: '0.75rem' }} onClick={async () => {
                          if (!confirm('Remove the LiveKit server stored in the app? It will revert to the .env credentials (or none).')) return;
                          try {
                            const r = await api.removeLiveKitServer();
                            showMsg(r.message || 'Removed', 'success');
                            const s = await api.getAppSettings();
                            setVideoSettings((v) => ({ ...v, video_provider: s.video_provider || v.video_provider, livekit_url: s.livekit_url || '', livekit_api_key: s.livekit_api_key || '', livekit_api_secret: '', livekit_has_secret: !!s.livekit_has_secret, livekit_source: s.livekit_source || 'none', livekit_configured: !!s.livekit_configured }));
                            api.getLiveKitStatus().then(setLivekitStatus).catch(() => setLivekitStatus(null));
                          } catch (err) { showMsg(err.message || 'Failed to remove', 'error'); }
                        }}>Remove stored server</button>
                      )}
                    </div>

                    {/* Add / update a server */}
                    <div className="settings-section" style={{ marginBottom: '1rem' }}>
                      <h4 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{videoSettings.livekit_source === 'database' ? 'Update Server' : 'Add a Server'}</h4>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 0 }}>
                        Point the app at a LiveKit Cloud project or self-hosted server. Saved here, it overrides the <code>.env</code> values and takes effect immediately — no restart needed.
                      </p>
                      <div className="form-group" style={{ maxWidth: 480 }}>
                        <label>Server URL</label>
                        <input value={videoSettings.livekit_url} onChange={(e) => setVideoSettings({ ...videoSettings, livekit_url: e.target.value })} placeholder="wss://your-project.livekit.cloud" />
                      </div>
                      <div className="form-group" style={{ maxWidth: 480 }}>
                        <label>API Key</label>
                        <input value={videoSettings.livekit_api_key} onChange={(e) => setVideoSettings({ ...videoSettings, livekit_api_key: e.target.value })} placeholder="APIxxxxxxxxxxxx" />
                      </div>
                      <div className="form-group" style={{ maxWidth: 480 }}>
                        <label>API Secret</label>
                        <input type="password" value={videoSettings.livekit_api_secret} onChange={(e) => setVideoSettings({ ...videoSettings, livekit_api_secret: e.target.value })}
                          placeholder={videoSettings.livekit_has_secret ? '•••••••• (saved — leave blank to keep)' : 'API Secret'} />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 480 }}>
                        Get these from your <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer">LiveKit Cloud</a> project (Settings → Keys) or your self-hosted config. Click <strong>Save Video Settings</strong> below to apply.
                      </p>
                    </div>
                  </div>
                )}

                {videoSettings.video_provider === 'livekit' && videoSettings.livekit_configured && livekitUsage && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>Estimated data transferred</h4>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.getLiveKitUsage().then(setLivekitUsage).catch(() => {})}>↻ Refresh</button>
                    </div>
                    <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                      <KPICard title="Today" value={`${livekitUsage.today.est_gb} GB`} subtitle={`${livekitUsage.today.minutes} participant-min · ${livekitUsage.today.sessions} session(s)`} icon="bar-chart" color="#3B82F6" />
                      <KPICard title="This month" value={`${livekitUsage.month.est_gb} GB`} subtitle={`${livekitUsage.month.minutes} participant-min · ${livekitUsage.month.sessions} session(s)`} icon="bar-chart" color="#8B5CF6" />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                      Rough estimate from session attendance (~{livekitUsage.assumed_mbps} Mbps per participant). For exact billed bandwidth see your{' '}
                      <a href="https://cloud.livekit.io" target="_blank" rel="noopener noreferrer">LiveKit Cloud dashboard</a>.
                    </p>
                  </div>
                )}

                {videoSettings.video_provider === 'zoom' && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="form-group" style={{ maxWidth: '420px' }}>
                      <label>Zoom Account ID</label>
                      <input
                        value={videoSettings.zoom_account_id}
                        onChange={(e) => setVideoSettings({ ...videoSettings, zoom_account_id: e.target.value })}
                        placeholder="Account ID"
                      />
                    </div>
                    <div className="form-group" style={{ maxWidth: '420px' }}>
                      <label>Zoom Client ID</label>
                      <input
                        value={videoSettings.zoom_client_id}
                        onChange={(e) => setVideoSettings({ ...videoSettings, zoom_client_id: e.target.value })}
                        placeholder="Client ID"
                      />
                    </div>
                    <div className="form-group" style={{ maxWidth: '420px' }}>
                      <label>Zoom Client Secret</label>
                      <input
                        type="password"
                        value={videoSettings.zoom_client_secret}
                        onChange={(e) => setVideoSettings({ ...videoSettings, zoom_client_secret: e.target.value })}
                        placeholder={videoSettings.zoom_has_secret ? '•••••••• (saved — leave blank to keep)' : 'Client Secret'}
                      />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', maxWidth: '420px' }}>
                      Create a <strong>Server-to-Server OAuth</strong> app in the Zoom App Marketplace to get these credentials.
                    </p>
                  </div>
                )}

                <div className="form-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={videoSaving}>
                    {videoSaving ? 'Saving...' : 'Save Video Settings'}
                  </button>
                </div>
              </form>
            </div>

            {/* HubSpot CRM */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>HubSpot (Contacts)</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Connect HubSpot to pull your CRM contact list into the <strong>Contacts</strong> page.
                Create a <strong>Private App</strong> in HubSpot (Settings → Integrations → Private Apps) with the
                <code> crm.objects.contacts.read</code> scope and paste its access token below.
              </p>

              <div className="alert" style={{ marginBottom: '1rem', background: hubspot.hubspot_connected ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: hubspot.hubspot_connected ? '#065f46' : '#92400e' }}>
                {hubspot.hubspot_connected
                  ? '✓ HubSpot is connected. Your contacts appear under the Contacts menu.'
                  : '⚠ HubSpot is not connected yet. Add a private-app access token to load contacts.'}
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setHubspotSaving(true);
                try {
                  const result = await api.saveHubspotSettings({ hubspot_token: hubspot.hubspot_token });
                  setHubspot({ hubspot_token: '', hubspot_connected: !!result.hubspot_connected });
                  setContacts([]);
                  setContactsError('');
                  showMsg(result.message, 'success');
                } catch (err) { showMsg(err.message, 'error'); }
                finally { setHubspotSaving(false); }
              }}>
                <div className="form-group" style={{ maxWidth: '520px' }}>
                  <label>HubSpot Private App Token</label>
                  <input
                    type="password"
                    value={hubspot.hubspot_token}
                    onChange={(e) => setHubspot({ ...hubspot, hubspot_token: e.target.value })}
                    placeholder={hubspot.hubspot_connected ? '•••••••• (saved — enter a new token to replace)' : 'pat-xxxxxxxx-xxxx-xxxx-...'}
                  />
                </div>
                <div className="form-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={hubspotSaving || !hubspot.hubspot_token.trim()}>
                    {hubspotSaving ? 'Saving…' : (hubspot.hubspot_connected ? 'Update Token' : 'Connect HubSpot')}
                  </button>
                  {hubspot.hubspot_connected && (
                    <button
                      type="button"
                      className="btn btn-ghost text-danger"
                      disabled={hubspotSaving}
                      onClick={async () => {
                        if (!confirm('Disconnect HubSpot? The stored token will be removed.')) return;
                        setHubspotSaving(true);
                        try {
                          const result = await api.saveHubspotSettings({ hubspot_token: '' });
                          setHubspot({ hubspot_token: '', hubspot_connected: !!result.hubspot_connected });
                          setContacts([]);
                          setContactsError('');
                          showMsg(result.message, 'success');
                        } catch (err) { showMsg(err.message, 'error'); }
                        finally { setHubspotSaving(false); }
                      }}
                    >Disconnect</button>
                  )}
                </div>
              </form>
            </div>

            {/* Kajabi */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Kajabi (Contacts)</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Connect Kajabi to pull your contact list into the <strong>Kajabi Contacts</strong> page.
                Create an <strong>API client</strong> in Kajabi (Settings → API / Integrations) and paste its
                <code> Client ID</code> and <code> Client Secret</code> below.
              </p>

              <div className="alert" style={{ marginBottom: '1rem', background: kajabi.kajabi_connected ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: kajabi.kajabi_connected ? '#065f46' : '#92400e' }}>
                {kajabi.kajabi_connected
                  ? '✓ Kajabi is connected. Your contacts appear under the Kajabi Contacts menu.'
                  : '⚠ Kajabi is not connected yet. Add your API credentials to load contacts.'}
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setKajabiSaving(true);
                try {
                  const result = await api.saveKajabiSettings({ kajabi_client_id: kajabi.kajabi_client_id, kajabi_client_secret: kajabi.kajabi_client_secret });
                  setKajabi({ kajabi_client_id: '', kajabi_client_secret: '', kajabi_connected: !!result.kajabi_connected });
                  setKajabiContacts([]);
                  setKajabiError('');
                  kajabiInit.current = false;
                  showMsg(result.message, 'success');
                  api.getKajabiStatus().then((st) => { if (st?.connected && typeof st.count === 'number') setKajabiCount(st.count); }).catch(() => {});
                } catch (err) { showMsg(err.message, 'error'); }
                finally { setKajabiSaving(false); }
              }}>
                <div className="form-group" style={{ maxWidth: '520px' }}>
                  <label>Kajabi Client ID</label>
                  <input
                    value={kajabi.kajabi_client_id}
                    onChange={(e) => setKajabi({ ...kajabi, kajabi_client_id: e.target.value })}
                    placeholder={kajabi.kajabi_connected ? '•••••••• (saved — enter a new ID to replace)' : 'Client ID'}
                  />
                </div>
                <div className="form-group" style={{ maxWidth: '520px' }}>
                  <label>Kajabi Client Secret</label>
                  <input
                    type="password"
                    value={kajabi.kajabi_client_secret}
                    onChange={(e) => setKajabi({ ...kajabi, kajabi_client_secret: e.target.value })}
                    placeholder={kajabi.kajabi_connected ? '•••••••• (saved — leave blank to keep)' : 'Client Secret'}
                  />
                </div>
                <div className="form-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={kajabiSaving || !kajabi.kajabi_client_id.trim()}>
                    {kajabiSaving ? 'Saving…' : (kajabi.kajabi_connected ? 'Update Credentials' : 'Connect Kajabi')}
                  </button>
                  {kajabi.kajabi_connected && (
                    <button
                      type="button"
                      className="btn btn-ghost text-danger"
                      disabled={kajabiSaving}
                      onClick={async () => {
                        if (!confirm('Disconnect Kajabi? The stored credentials will be removed.')) return;
                        setKajabiSaving(true);
                        try {
                          const result = await api.saveKajabiSettings({ disconnect: true });
                          setKajabi({ kajabi_client_id: '', kajabi_client_secret: '', kajabi_connected: !!result.kajabi_connected });
                          setKajabiContacts([]);
                          setKajabiError('');
                          setKajabiCount(null);
                          kajabiInit.current = false;
                          showMsg(result.message, 'success');
                        } catch (err) { showMsg(err.message, 'error'); }
                        finally { setKajabiSaving(false); }
                      }}
                    >Disconnect</button>
                  )}
                </div>
              </form>
            </div>

            {/* SMTP Configuration */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Email Configuration</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Choose how transactional email (welcome emails, password reset links) is delivered. Hostinger uses standard SMTP; Resend uses the Resend HTTP API; Gmail uses your Google account with an app password.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSmtpSaving(true);
                try {
                  await api.saveSmtpSettings(smtpForm);
                  showMsg('Email settings saved', 'success');
                } catch (err) { showMsg(err.message, 'error'); }
                finally { setSmtpSaving(false); }
              }}>
                <div className="form-group">
                  <label>Email Provider</label>
                  <select value={smtpForm.provider} onChange={(e) => setSmtpForm({ ...smtpForm, provider: e.target.value })}>
                    <option value="smtp">Hostinger — SMTP</option>
                    <option value="resend">Resend — API</option>
                    <option value="gmail">Gmail — App Password</option>
                  </select>
                </div>

                {smtpForm.provider === 'smtp' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>SMTP Host</label>
                        <input value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} placeholder="smtp.hostinger.com" />
                      </div>
                      <div className="form-group">
                        <label>Port</label>
                        <input type="number" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 587 })} placeholder="587" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>SMTP Username / Email</label>
                        <input value={smtpForm.user} onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })} placeholder="noreply@yourdomain.com" />
                      </div>
                      <div className="form-group">
                        <label>SMTP Password</label>
                        <input type="password" value={smtpForm.pass} onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })} placeholder="••••••••" />
                      </div>
                    </div>
                  </>
                )}

                {smtpForm.provider === 'resend' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Resend API Key</label>
                        <input type="password" value={smtpForm.resend_api_key} onChange={(e) => setSmtpForm({ ...smtpForm, resend_api_key: e.target.value })} placeholder="re_xxxxxxxx_xxxxxxxxxxxxxxxxxxxx" />
                        <small style={{ color: 'var(--color-text-secondary)' }}>Create a key at resend.com → API Keys. The From domain below must be a verified domain in Resend.</small>
                      </div>
                      <div className="form-group">
                        <label>Monthly Email Cap (optional)</label>
                        <input type="number" min="0" value={smtpForm.resend_monthly_cap} onChange={(e) => setSmtpForm({ ...smtpForm, resend_monthly_cap: parseInt(e.target.value) || 0 })} placeholder="3000" />
                        <small style={{ color: 'var(--color-text-secondary)' }}>Your Resend plan's monthly limit (free = 3000). Used to show remaining quota.</small>
                      </div>
                    </div>

                    {(() => {
                      const used = parseInt(smtpForm.resend_quota_used);
                      if (smtpForm.resend_quota_used === '' || smtpForm.resend_quota_used == null || isNaN(used)) {
                        return (
                          <div className="alert" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--color-text-secondary)' }}>
                            Usage will appear here after the first email is sent via Resend. Resend has no quota-polling API — the figure refreshes each time an email is sent.
                          </div>
                        );
                      }
                      const cap = parseInt(smtpForm.resend_monthly_cap) || 0;
                      const remaining = cap > 0 ? Math.max(0, cap - used) : null;
                      const when = smtpForm.resend_quota_at ? new Date(smtpForm.resend_quota_at.replace(' ', 'T')).toLocaleString() : 'unknown';
                      return (
                        <div className="alert" style={{ background: 'rgba(16,185,129,0.12)', color: '#065f46' }}>
                          <strong>Resend usage this month:</strong>{' '}
                          {cap > 0
                            ? `${used.toLocaleString()} / ${cap.toLocaleString()} used · ${remaining.toLocaleString()} remaining`
                            : `${used.toLocaleString()} emails used`}
                          <br />
                          <small>As of {when} · updates each time an email is sent via Resend.</small>
                        </div>
                      );
                    })()}
                  </>
                )}

                {smtpForm.provider === 'gmail' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Gmail Address</label>
                        <input value={smtpForm.gmail_user} onChange={(e) => setSmtpForm({ ...smtpForm, gmail_user: e.target.value })} placeholder="youraccount@gmail.com" />
                        <small style={{ color: 'var(--color-text-secondary)' }}>The Google account emails are sent from. Google Workspace addresses work too.</small>
                      </div>
                      <div className="form-group">
                        <label>App Password</label>
                        <input type="password" value={smtpForm.gmail_app_password} onChange={(e) => setSmtpForm({ ...smtpForm, gmail_app_password: e.target.value })} placeholder="xxxx xxxx xxxx xxxx" />
                        <small style={{ color: 'var(--color-text-secondary)' }}>Not your Gmail password. Create one at Google Account → Security → 2-Step Verification → App passwords (2-Step Verification must be on). Paste with or without spaces.</small>
                      </div>
                    </div>
                    <div className="alert" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--color-text-secondary)' }}>
                      Gmail always sends from the address above — the From Address below can only set a display name (e.g. Tiju's Academy &lt;youraccount@gmail.com&gt;). Free Gmail accounts are limited to ~500 emails/day.
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>From Address</label>
                  <input value={smtpForm.from_email} onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })} placeholder="Tiju's Academy <noreply@yourdomain.com>" />
                </div>
                <div className="form-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={smtpSaving}>{smtpSaving ? 'Saving...' : 'Save Email Settings'}</button>
                </div>
              </form>

              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-bg-secondary, #f8f9fa)', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Send Test Email</h4>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="email"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={smtpTesting || !smtpTestEmail}
                    onClick={async () => {
                      setSmtpTesting(true);
                      try {
                        const result = await api.testSmtp(smtpTestEmail);
                        showMsg(result.message, 'success');
                      } catch (err) { showMsg(err.message, 'error'); }
                      finally { setSmtpTesting(false); }
                    }}
                  >{smtpTesting ? 'Sending...' : 'Send Test'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="portal-page">

            {/* Test Video Call */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Test Video Call</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Create a one-on-one test video call and share the link with another user to verify video/audio.</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  disabled={testCallCreating}
                  onClick={async () => {
                    setTestCallCreating(true);
                    setTestCallCopied(false);
                    try {
                      const result = await api.createTestCall();
                      if (!result.session_id) throw new Error('No session ID returned');
                      const url = `${window.location.origin}/call/${result.session_id}`;
                      setTestCallUrl(url);
                      showMsg('Test call created! Share the link below.', 'success');
                    } catch (err) {
                      console.error('Test call error:', err);
                      showMsg('Failed to create test call: ' + err.message, 'error');
                    }
                    finally { setTestCallCreating(false); }
                  }}
                >{testCallCreating ? 'Creating...' : 'Create Test Call'}</button>
                {testCallUrl && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      window.open(testCallUrl, '_blank');
                    }}
                  >Join Call</button>
                )}
              </div>
              {testCallUrl && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-bg-secondary, #f8f9fa)', borderRadius: '8px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Share this link with the other participant:</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={testCallUrl}
                      readOnly
                      onClick={(e) => e.target.select()}
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}
                    />
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(testCallUrl);
                        setTestCallCopied(true);
                        setTimeout(() => setTestCallCopied(false), 2000);
                      }}
                    >{testCallCopied ? 'Copied!' : 'Copy'}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Export Database */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Export Database</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Download a full backup of the current database — all users, courses, enrollments, sessions,
                and settings — as a portable <strong>.sql</strong> dump.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  disabled={exportingSql}
                  onClick={() => exportDatabase('sql', setExportingSql)}
                >{exportingSql ? 'Exporting…' : 'Download as SQL (.sql)'}</button>
              </div>
            </div>

            {/* Import Database */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Import Database</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Restore from a backup. Upload a <strong>.sql</strong> dump exported above —
                it <strong>replaces the entire current database</strong>. Take a fresh export first;
                there is no automatic server-side backup.
              </p>
              <input
                ref={dbImportRef}
                type="file"
                accept=".sql,application/sql"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  importDatabase(file);
                }}
              />
              <button
                className="btn"
                style={{ background: '#F59E0B', color: '#fff' }}
                disabled={importingDb}
                onClick={() => dbImportRef.current?.click()}
              >{importingDb ? 'Importing…' : 'Import Database…'}</button>
            </div>

            <div className="settings-section">
              <h3>Data Management</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Clear data from the system. These actions cannot be undone.</p>
              <div className="settings-grid">
                {[
                  { target: 'students', label: 'Clear All Students', desc: 'Remove all student accounts, enrollments, and attendance records', color: '#F59E0B' },
                  { target: 'tutors', label: 'Clear All Tutors', desc: 'Remove all tutor accounts, their courses, sessions, and related data', color: '#F59E0B' },
                  { target: 'courses', label: 'Clear All Courses', desc: 'Remove all courses, enrollments, sessions, and attendance', color: '#EF4444' },
                  { target: 'sessions', label: 'Clear All Sessions', desc: 'Remove all sessions, attendance logs, and meeting records', color: '#EF4444' },
                  { target: 'audit_logs', label: 'Clear Audit Logs', desc: 'Remove all audit log entries', color: '#6B7280' },
                  { target: 'all', label: 'Clear Everything', desc: 'Remove ALL data except your superadmin account. Full reset.', color: '#DC2626' },
                ].map(({ target, label, desc, color }) => (
                  <div key={target} className="settings-card">
                    <div className="settings-card-info">
                      <h4>{label}</h4>
                      <p>{desc}</p>
                    </div>
                    <button
                      className="btn btn-sm"
                      style={{ background: color, color: '#fff', whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        const confirmMsg = target === 'all'
                          ? 'Are you sure you want to DELETE ALL DATA? This will remove every user (except you), all courses, sessions, enrollments, and records. This CANNOT be undone.'
                          : `Are you sure you want to ${label.toLowerCase()}? This cannot be undone.`;
                        if (!confirm(confirmMsg)) return;
                        if (target === 'all' && !confirm('FINAL WARNING: This will permanently erase all data. Type OK to confirm.')) return;
                        try {
                          const result = await api.clearData(target);
                          showMsg(result.message, 'success');
                          fetchData();
                          api.getStudents().then(setAllStudents);
                          api.getTutors().then(setAllTutors);
                          api.getCourses().then(setAllCourses);
                          api.getEnrollments().then(setAllEnrollments);
                          api.getSessions().then(setAllSessions);
                        } catch (err) { showMsg(err.message, 'error'); }
                      }}
                    >
                      {label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
