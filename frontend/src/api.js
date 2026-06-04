const API = '/api';

async function request(path, options = {}) {
  const config = {
    credentials: 'include',
    headers: {},
    ...options,
  };

  if (options.body && !(options.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API}${path}`, config);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getSession: () => request('/auth/session'),

  // Data
  bootstrap: () => request('/bootstrap'),
  portalData: () => request('/portal-data'),
  reports: () => request('/reports'),
  health: () => request('/health'),

  // Users
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: data }),
  updateUser: (data) => request('/users', { method: 'PUT', body: data }),
  inviteUser: (id) => request('/users/invite', { method: 'POST', body: { user_id: id } }),
  deleteUser: (id) => request(`/users?id=${id}`, { method: 'DELETE' }),
  permanentDeleteUser: (id) => request(`/users?id=${id}&permanent=true`, { method: 'DELETE' }),

  // Courses
  getCourses: () => request('/courses'),
  createCourse: (data) => request('/courses', { method: 'POST', body: data }),
  updateCourse: (data) => request('/courses', { method: 'PUT', body: data }),
  deleteCourse: (id) => request(`/courses?id=${id}`, { method: 'DELETE' }),
  permanentDeleteCourse: (id) => request(`/courses?id=${id}&permanent=true`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request('/categories'),
  createCategory: (name) => request('/categories', { method: 'POST', body: { name } }),
  updateCategory: (id, name) => request('/categories', { method: 'PUT', body: { id, name } }),
  deleteCategory: (id) => request(`/categories?id=${id}`, { method: 'DELETE' }),

  // Course Materials
  getCourseMaterials: (courseId) => request(`/course-materials?course_id=${courseId}`),
  createCourseMaterial: (formData) => request('/course-materials', { method: 'POST', body: formData }),
  updateCourseMaterial: (data) => request('/course-materials', { method: 'PUT', body: data }),
  deleteCourseMaterial: (id) => request(`/course-materials?id=${id}`, { method: 'DELETE' }),
  getMaterialManagers: (courseId) => request(`/course-material-managers?course_id=${courseId}`),
  assignMaterialManager: (courseId, userId) => request('/course-material-managers', { method: 'POST', body: { course_id: courseId, user_id: userId } }),
  unassignMaterialManager: (courseId, userId) => request(`/course-material-managers?course_id=${courseId}&user_id=${userId}`, { method: 'DELETE' }),

  // Enrollments
  getEnrollments: () => request('/enrollments'),
  createEnrollment: (data) => request('/enrollments', { method: 'POST', body: data }),
  updateEnrollment: (data) => request('/enrollments', { method: 'PUT', body: data }),
  deleteEnrollment: (id) => request(`/enrollments?id=${id}`, { method: 'DELETE' }),
  permanentDeleteEnrollment: (id) => request(`/enrollments?id=${id}&permanent=true`, { method: 'DELETE' }),

  // Students & Tutors
  getStudents: () => request('/students'),
  getStudentDetail: (id) => request(`/students/${id}`),
  getTutors: () => request('/tutors'),

  // Sessions
  getSessions: () => request('/sessions'),
  createSession: (data) => request('/sessions', { method: 'POST', body: data }),
  deleteSession: (id) => request(`/sessions?id=${id}`, { method: 'DELETE' }),
  joinSession: (sessionId) => request('/join-session', { method: 'POST', body: { session_id: sessionId } }),
  leaveSession: (sessionId) => request('/leave-session', { method: 'POST', body: { session_id: sessionId } }),
  endSession: (sessionId) => request('/end-session', { method: 'POST', body: { session_id: sessionId } }),

  // Signaling (WebRTC)
  sendSignal: (data) => request('/signaling', { method: 'POST', body: data }),
  pollSignals: (sessionId, lastId = 0) => request(`/signaling?session_id=${sessionId}&last_id=${lastId}`),

  // Temporary meetings (link + 5-digit passcode, no account)
  createMeeting: (data) => request('/meetings', { method: 'POST', body: data }),
  getMeetings: () => request('/meetings'),
  endMeeting: (id) => request(`/meetings?id=${id}`, { method: 'DELETE' }),
  deleteMeeting: (id) => request(`/meetings?id=${id}&permanent=true`, { method: 'DELETE' }),
  getMeetingInfo: (code) => request(`/meetings/info?code=${encodeURIComponent(code)}`),
  getMeetingToken: (code, passcode, name) => request('/meetings/token', { method: 'POST', body: { code, passcode, name } }),

  // LiveKit (large webinar sessions)
  getLiveKitToken: (sessionId) => request(`/livekit/token?session_id=${sessionId}`),
  livekitUpdatePermission: (data) => request('/livekit/update-permission', { method: 'POST', body: data }),
  getLiveKitUsage: () => request('/livekit/usage'),

  // Session recording — uploads a .webm to backend/uploads/recordings/
  uploadRecording: (sessionId, blob) => {
    const fd = new FormData();
    fd.append('session_id', sessionId);
    fd.append('recording', blob, `session-${sessionId}.webm`);
    return request('/upload-recording', { method: 'POST', body: fd });
  },

  // Attendance & Records
  getAttendanceLogs: (sessionId) => request(sessionId ? `/attendance-logs?session_id=${sessionId}` : '/attendance-logs'),
  getMeetingRecords: () => request('/meeting-records'),
  deleteMeetingRecord: (id) => request(`/meeting-records?id=${id}`, { method: 'DELETE' }),

  // Settings
  clearData: (target) => request('/clear-data', { method: 'POST', body: { target } }),

  // Download a backup (returns a Blob + suggested filename). `format`: 'db' | 'sql'
  exportDb: async (format = 'db') => {
    const fallback = format === 'sql' ? 'tijuspro-backup.sql' : 'tijuspro-backup.db';
    const res = await fetch(`${API}/${format === 'sql' ? 'export-sql' : 'export-db'}`, { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed: ${res.status}`);
    }
    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    const m = dispo.match(/filename="?([^"]+)"?/);
    return { blob, filename: m ? m[1] : fallback };
  },

  // Import a .db or .sql backup, replacing the current database
  importDb: (file) => {
    const fd = new FormData();
    fd.append('database', file);
    return request('/import-db', { method: 'POST', body: fd });
  },

  // Test Call
  createTestCall: () => request('/test-call', { method: 'POST' }),

  // Profile
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request('/profile/avatar', { method: 'POST', body: fd });
  },
  removeAvatar: () => request('/profile/avatar', { method: 'DELETE' }),

  // App Settings
  getAppSettings: () => request('/app-settings'),
  saveAppSettings: (data) => request('/app-settings', { method: 'PUT', body: data }),
  saveVideoSettings: (data) => request('/video-settings', { method: 'PUT', body: data }),
  getZoomStatus: () => request('/zoom-status'),

  // HubSpot CRM
  saveHubspotSettings: (data) => request('/hubspot-settings', { method: 'PUT', body: data }),
  getHubspotStatus: () => request('/hubspot-status'),
  getHubspotContacts: () => request('/hubspot/contacts'),

  // SMTP Settings
  getSmtpSettings: () => request('/smtp-settings'),
  saveSmtpSettings: (data) => request('/smtp-settings', { method: 'POST', body: data }),
  testSmtp: (to) => request('/smtp-test', { method: 'POST', body: { to } }),

  // Password reset
  requestPasswordReset: (email) => request('/request-password-reset', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/reset-password', { method: 'POST', body: { token, password } }),
};
