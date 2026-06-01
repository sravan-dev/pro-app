import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import DataTable from '../components/DataTable';
import Calendar from '../components/Calendar';
import SessionCard from '../components/SessionCard';
import VideoRoom from '../components/VideoRoom';

export default function SuperadminPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState('info');

  // Entity lists
  const [allStudents, setAllStudents] = useState([]);
  const [allTutors, setAllTutors] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [allEnrollments, setAllEnrollments] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [reports, setReports] = useState(null);

  // Modals
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'student', password: 'password123', specialization: '', avatar_color: '#4F46E5', payout_rate: 0, payout_type: 'monthly' });

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
  });
  const [videoSaving, setVideoSaving] = useState(false);

  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({ name: '', category: 'Technology', tutor_id: '', color: '#3B82F6', icon: 'book' });

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

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState({ course_id: '', tutor_id: '', start_time: '', end_time: '' });

  const [activeSession, setActiveSession] = useState(null);

  // SMTP settings
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, user: '', pass: '', from_email: '' });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Test call
  const [testCallUrl, setTestCallUrl] = useState('');
  const [testCallCreating, setTestCallCreating] = useState(false);
  const [testCallCopied, setTestCallCopied] = useState(false);

  const showMsg = (msg, type = 'info') => { setMessage(msg); setMsgType(type); setTimeout(() => setMessage(''), 4000); };

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

  useEffect(() => {
    api.getAppSettings().then((s) => {
      setAppSettings(s);
      setVideoSettings({
        video_provider: s.video_provider || 'webrtc',
        zoom_account_id: s.zoom_account_id || '',
        zoom_client_id: s.zoom_client_id || '',
        zoom_client_secret: '',
        zoom_has_secret: !!s.zoom_has_secret,
      });
    }).catch(() => {});
  }, []);

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
    if (activeTab === 'enrollments' && allEnrollments.length === 0) api.getEnrollments().then(setAllEnrollments).catch(() => {});
    if (activeTab === 'sessions' && allSessions.length === 0) api.getSessions().then(setAllSessions).catch(() => {});
    if (activeTab === 'attendance' && allAttendance.length === 0) api.getAttendanceLogs().then(setAllAttendance).catch(() => {});
    if (activeTab === 'reports' && !reports) api.reports().then(setReports).catch(() => {});
    if (activeTab === 'settings' && !smtpLoaded) api.getSmtpSettings().then((s) => { setSmtpForm(s); setSmtpLoaded(true); }).catch(() => {});
  }, [activeTab]);

  // ===== USER CRUD =====
  const openCreateUser = (role = 'student') => {
    setEditingUser(null);
    setUserForm({ name: '', email: '', role, password: 'password123', specialization: '', avatar_color: '#4F46E5', payout_rate: 0, payout_type: 'monthly' });
    setShowUserForm(true);
  };

  const openEditUser = (user) => {
    setEditingUser(user);
    setUserForm({ name: user.name, email: user.email, role: user.role, password: '', specialization: user.specialization || '', avatar_color: user.avatar_color, status: user.status, payout_rate: user.payout_rate || 0, payout_type: user.payout_type || 'monthly' });
    setShowUserForm(true);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.updateUser({ id: editingUser.id, ...userForm });
        showMsg('User updated successfully', 'success');
      } else {
        await api.createUser(userForm);
        showMsg('User created successfully', 'success');
      }
      setShowUserForm(false);
      fetchData();
      api.getStudents().then(setAllStudents);
      api.getTutors().then(setAllTutors);
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
    setSessionForm({ course_id: '', tutor_id: '', start_time: '', end_time: '' });
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

  const handleJoinSession = async (session) => {
    try {
      const result = await api.joinSession(session.session_id);
      setActiveSession({ ...session, ...result });
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;

  if (activeSession) {
    return (
      <div className="portal-layout portal-superadmin">
        <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveSession(null); setActiveTab(tab); }} />
        <main className="portal-content">
          <VideoRoom session={activeSession} onLeave={() => setActiveSession(null)} />
        </main>
      </div>
    );
  }

  const stats = data?.stats || {};
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

  const actionBtns = (onEdit, onDelete, deleteLabel = 'Deactivate', onPermanentDelete = null) => (r) => (
    <div className="table-actions">
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
    { key: 'courses', label: 'Courses', accessor: 'enrolled_courses' },
    { key: 'progress', label: 'Avg Progress', accessor: 'avg_progress', render: (r) => progressCol(r, 'avg_progress') },
    { key: 'status', label: 'Status', accessor: 'status', render: statusCol },
    { key: 'actions', label: 'Actions', sortable: false, render: actionBtns(openEditUser, deactivateUser, 'Deactivate', permanentDeleteUser) },
  ];

  const tutorColumns = [
    { key: 'avatar', label: '', sortable: false, render: avatarCol },
    { key: 'name', label: 'Name', accessor: 'name' },
    { key: 'email', label: 'Email', accessor: 'email' },
    { key: 'specialization', label: 'Specialization', accessor: 'specialization' },
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
    { key: 'start', label: 'Start', accessor: 'start_time', render: (r) => new Date(r.start_time).toLocaleString() },
    { key: 'end', label: 'End', accessor: 'end_time', render: (r) => new Date(r.end_time).toLocaleString() },
    { key: 'room', label: 'Room', accessor: 'room_name' },
    { key: 'status', label: 'Status', accessor: 'status', render: (r) => <span className={`status-badge status-${r.status}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
      <div className="table-actions">
        {(r.status === 'scheduled' || r.status === 'live') && <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleJoinSession(r); }}>Join</button>}
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

  const auditColumns = [
    { key: 'time', label: 'Time', accessor: 'created_at', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'user', label: 'User', accessor: 'user_name' },
    { key: 'action', label: 'Action', accessor: 'action' },
    { key: 'target', label: 'Target', accessor: (r) => r.target_type ? `${r.target_type} #${r.target_id}` : '' },
    { key: 'details', label: 'Details', accessor: 'details' },
    { key: 'ip', label: 'IP', accessor: 'ip_address' },
  ];

  // ===== Modal JSX (inline, not component functions — avoids remount/focus-loss) =====
  const userFormModal = showUserForm && (
    <div className="modal-overlay" onClick={() => setShowUserForm(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{editingUser ? 'Edit User' : 'Create User'}</h3>
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
              <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} {...(!editingUser && { required: true })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Specialization</label>
              <input value={userForm.specialization} onChange={(e) => setUserForm({ ...userForm, specialization: e.target.value })} placeholder="e.g. Web Development" />
            </div>
            <div className="form-group">
              <label>Avatar Color</label>
              <input type="color" value={userForm.avatar_color} onChange={(e) => setUserForm({ ...userForm, avatar_color: e.target.value })} />
            </div>
          </div>
          {userForm.role === 'tutor' && (
            <div className="form-row">
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
              <div className="form-group">
                <label>Payout Type</label>
                <select value={userForm.payout_type || 'monthly'} onChange={(e) => setUserForm({ ...userForm, payout_type: e.target.value })}>
                  <option value="monthly">Monthly</option>
                  <option value="per_session">Per Session</option>
                  <option value="per_hour">Per Hour</option>
                  <option value="per_course">Per Course</option>
                </select>
              </div>
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
    <div className="modal-overlay" onClick={() => setShowCourseForm(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

  const categoryMgrModal = showCategoryMgr && (
    <div className="modal-overlay" onClick={() => setShowCategoryMgr(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

  const eligibleManagers = [...allTutors, ...(data?.users || []).filter((u) => ['manager','advisor'].includes(u.role))]
    .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i)
    .filter((u) => !materialManagers.some((m) => m.user_id === u.id));

  const materialsMgrModal = showMaterialsMgr && materialsCourse && (
    <div className="modal-overlay" onClick={() => setShowMaterialsMgr(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px', width: '90%' }}>
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
    <div className="modal-overlay" onClick={() => setShowEnrollForm(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

  const sessionFormModal = showSessionForm && (
    <div className="modal-overlay" onClick={() => setShowSessionForm(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

  return (
    <div className="portal-layout portal-superadmin">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="portal-content">
        {message && <div className={`alert alert-${msgType}`} onClick={() => setMessage('')}>{message}</div>}
        {userFormModal}
        {courseFormModal}
        {categoryMgrModal}
        {materialsMgrModal}
        {enrollFormModal}
        {sessionFormModal}

        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="portal-page">
            <h2>Admin Dashboard</h2>
            <div className="kpi-grid">
              <KPICard title="Total Students" value={stats.total_students} icon="users" color="#3B82F6" onClick={() => setActiveTab('students')} />
              <KPICard title="Total Tutors" value={stats.total_tutors} icon="users" color="#10B981" onClick={() => setActiveTab('tutors')} />
              <KPICard title="Active Courses" value={stats.total_courses} icon="book" color="#8B5CF6" onClick={() => setActiveTab('courses')} />
              <KPICard title="Enrollments" value={stats.total_enrollments} icon="layers" color="#F59E0B" onClick={() => setActiveTab('enrollments')} />
              <KPICard title="Active Sessions" value={stats.active_sessions} icon="video" color="#EF4444" onClick={() => setActiveTab('sessions')} />
              <KPICard title="Total Users" value={stats.total_users} icon="users" color="#06B6D4" onClick={() => setActiveTab('users')} />
              <KPICard title="Advisors" value={stats.total_advisors} icon="users" color="#EC4899" onClick={() => setActiveTab('users')} />
              <KPICard title="Managers" value={stats.total_managers} icon="users" color="#0891B2" onClick={() => setActiveTab('users')} />
            </div>
          </div>
        )}

        {/* ===== STUDENTS ===== */}
        {activeTab === 'students' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Student Management</h2>
              <button className="btn btn-primary" onClick={() => openCreateUser('student')}>+ Add Student</button>
            </div>
            <DataTable columns={studentColumns} data={allStudents} pageSize={15} selectable onBulkAction={bulkDeleteUsers} bulkActionLabel="Delete Selected" />
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

        {/* ===== SESSIONS ===== */}
        {activeTab === 'sessions' && (
          <div className="portal-page">
            <div className="page-header">
              <h2>Session Management</h2>
              <button className="btn btn-primary" onClick={openCreateSession}>+ Schedule Session</button>
            </div>
            <Calendar sessions={allSessions} onSessionClick={handleJoinSession} />
            <DataTable columns={sessionColumns} data={allSessions} pageSize={15} selectable onBulkAction={bulkDeleteSessions} bulkActionLabel="Delete Selected" />
          </div>
        )}

        {/* ===== ATTENDANCE ===== */}
        {activeTab === 'attendance' && (
          <div className="portal-page">
            <h2>Attendance Records</h2>
            <DataTable columns={attendanceColumns} data={allAttendance} pageSize={20} />
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
                  <h3>Top Courses by Enrollment</h3>
                  <div className="stats-bars">
                    {reports.enrollments_by_course?.map((c) => (
                      <div key={c.name} className="stats-bar-item">
                        <span className="stats-bar-label">{c.name}</span>
                        <div className="stats-bar"><div className="stats-bar-fill" style={{ width: `${(c.count / Math.max(...reports.enrollments_by_course.map((x) => x.count), 1)) * 100}%` }} /></div>
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

                <div className="section">
                  <h3>Student Status Breakdown</h3>
                  <div className="stats-bars">
                    {reports.student_status_breakdown?.map((s) => (
                      <div key={s.status} className="stats-bar-item">
                        <span className="stats-bar-label">{s.status}</span>
                        <div className="stats-bar"><div className="stats-bar-fill" style={{ width: `${(s.count / (reports.total_students || 1)) * 100}%` }} /></div>
                        <span className="stats-bar-value">{s.count}</span>
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
                  await api.saveVideoSettings(videoSettings);
                  showMsg('Video settings saved', 'success');
                  // Secret is write-only; clear the field and mark it as stored.
                  setVideoSettings((v) => ({
                    ...v,
                    zoom_has_secret: v.zoom_client_secret ? true : v.zoom_has_secret,
                    zoom_client_secret: '',
                  }));
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
                      <option value="webrtc">WebRTC — built-in (no setup)</option>
                      <option value="zoom">Zoom</option>
                    </select>
                  </div>
                </div>

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

            {/* SMTP Configuration */}
            <div className="settings-section" style={{ marginBottom: '2rem' }}>
              <h3>Email Configuration (SMTP)</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Configure SMTP to send welcome emails to new users and password reset links.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSmtpSaving(true);
                try {
                  await api.saveSmtpSettings(smtpForm);
                  showMsg('SMTP settings saved', 'success');
                } catch (err) { showMsg(err.message, 'error'); }
                finally { setSmtpSaving(false); }
              }}>
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
                <div className="form-group">
                  <label>From Address</label>
                  <input value={smtpForm.from_email} onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })} placeholder="Tiju's Academy <noreply@yourdomain.com>" />
                </div>
                <div className="form-actions" style={{ marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={smtpSaving}>{smtpSaving ? 'Saving...' : 'Save SMTP Settings'}</button>
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
