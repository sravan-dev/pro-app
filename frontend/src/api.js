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
  getTutors: () => request('/tutors'),

  // Sessions
  getSessions: () => request('/sessions'),
  createSession: (data) => request('/sessions', { method: 'POST', body: data }),
  deleteSession: (id) => request(`/sessions?id=${id}`, { method: 'DELETE' }),
  joinSession: (sessionId) => request('/join-session', { method: 'POST', body: { session_id: sessionId } }),
  leaveSession: (sessionId) => request('/leave-session', { method: 'POST', body: { session_id: sessionId } }),

  // Signaling (WebRTC)
  sendSignal: (data) => request('/signaling', { method: 'POST', body: data }),
  pollSignals: (sessionId, lastId = 0) => request(`/signaling?session_id=${sessionId}&last_id=${lastId}`),

  // Attendance & Records
  getAttendanceLogs: (sessionId) => request(sessionId ? `/attendance-logs?session_id=${sessionId}` : '/attendance-logs'),
  getMeetingRecords: () => request('/meeting-records'),

  // Settings
  clearData: (target) => request('/clear-data', { method: 'POST', body: { target } }),

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

  // SMTP Settings
  getSmtpSettings: () => request('/smtp-settings'),
  saveSmtpSettings: (data) => request('/smtp-settings', { method: 'POST', body: data }),
  testSmtp: (to) => request('/smtp-test', { method: 'POST', body: { to } }),

  // Password reset
  requestPasswordReset: (email) => request('/request-password-reset', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/reset-password', { method: 'POST', body: { token, password } }),
};
