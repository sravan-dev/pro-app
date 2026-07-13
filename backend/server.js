// TijusPro LMS - Node.js Backend (Express + MySQL/MariaDB)
require('dotenv').config(); // load .env (DB creds, LiveKit, secrets) into process.env
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8000;
// Uploads (recordings, course materials, avatars) must live OUTSIDE the
// deployed app folder, otherwise every deploy that replaces the project tree
// wipes them. Set UPLOADS_ROOT to a persistent path on the host (e.g. a
// directory in the home folder that deploys never touch). Falls back to the
// in-repo ./uploads for local development.
let UPLOADS_ROOT = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(__dirname, 'uploads');
let UPLOAD_DIR = path.join(UPLOADS_ROOT, 'recordings');
let MATERIALS_DIR = path.join(UPLOADS_ROOT, 'materials');
let AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

// LiveKit (SFU) — used for large webinar-style sessions (50-100+ participants).
// Credentials seed from env (LIVEKIT_URL/API_KEY/API_SECRET) at boot, but a
// server saved in Settings → Integrations overrides them so the superadmin can
// point the app at a new LiveKit server without redeploying. `livekit` is the
// live cache; loadLivekitCreds() refreshes it from the DB. Get credentials from
// a LiveKit Cloud project (https://cloud.livekit.io) or a self-hosted server.
const livekit = {
  url: process.env.LIVEKIT_URL || '',            // wss://your-project.livekit.cloud
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
  source: (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) ? 'env' : 'none',
};
const livekitConfigured = () => !!(livekit.url && livekit.apiKey && livekit.apiSecret);
// Pull any stored LiveKit server from the DB and overlay it onto the env-seeded
// cache. A complete DB record (url + key + secret) wins; otherwise env stands.
async function loadLivekitCreds() {
  try {
    const s = (await db.get("SELECT livekit_url, livekit_api_key, livekit_api_secret FROM app_settings WHERE id=1")) || {};
    if (s.livekit_url && s.livekit_api_key && s.livekit_api_secret) {
      livekit.url = s.livekit_url;
      livekit.apiKey = s.livekit_api_key;
      livekit.apiSecret = s.livekit_api_secret;
      livekit.source = 'database';
    } else if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
      livekit.url = process.env.LIVEKIT_URL;
      livekit.apiKey = process.env.LIVEKIT_API_KEY;
      livekit.apiSecret = process.env.LIVEKIT_API_SECRET;
      livekit.source = 'env';
    } else {
      livekit.url = ''; livekit.apiKey = ''; livekit.apiSecret = ''; livekit.source = 'none';
    }
  } catch (err) {
    console.warn('[livekit] could not load stored credentials:', err.message);
  }
}
// livekit-server-sdk v2 is ESM-only; load it lazily via dynamic import so this
// CommonJS file keeps working even when the package isn't installed.
let _livekitSdk = null;
async function getLiveKit() {
  if (!_livekitSdk) _livekitSdk = await import('livekit-server-sdk');
  return _livekitSdk;
}
const livekitRoomName = (sessionId) => `session-${sessionId}`;
const livekitHttpUrl = () => livekit.url.replace(/^ws/, 'http');

// UTC 'YYYY-MM-DD HH:MM:SS' — mirrors SQLite's datetime('now') string format so
// stored timestamps and string comparisons behave as they did before.
function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
// Whole minutes between two timestamp strings (parsed as dates), never negative.
function durationMinutes(joinStr, leaveStr) {
  const m = (new Date(leaveStr) - new Date(joinStr)) / 60000;
  return Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
}
// Is this a MySQL duplicate-key error? (replaces the old "UNIQUE" message check)
function isDup(err) {
  return !!err && (err.code === 'ER_DUP_ENTRY' || /duplicate/i.test(err.message || ''));
}

// ============================================================
// Middleware
// ============================================================
app.use(express.json());

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'tijuspro-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  // Slide the 24h window forward on every request, so an actively-used session
  // isn't logged out mid-work at exactly 24h after login — only 24h of
  // inactivity ends it.
  rolling: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Serve uploaded files. Create the upload dirs, but never let a bad/unwritable
// UPLOADS_ROOT (e.g. a path the account can't write — EACCES) crash the whole
// app on boot. If the configured root can't be prepared, log loudly and fall
// back to the in-app ./uploads so the site stays up (those files won't survive
// deploys — fix UPLOADS_ROOT to a writable, persistent path you own).
function ensureUploadDirs(root) {
  for (const d of [path.join(root, 'recordings'), path.join(root, 'materials'), path.join(root, 'avatars')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}
try {
  ensureUploadDirs(UPLOADS_ROOT);
} catch (err) {
  const fallback = path.join(__dirname, 'uploads');
  console.error(`[uploads] Cannot use UPLOADS_ROOT="${UPLOADS_ROOT}" (${err.code || err.message}). ` +
    `Falling back to "${fallback}". Set UPLOADS_ROOT to a writable, persistent directory you own ` +
    `(e.g. ~/domains/<site>/lms-uploads) so recordings survive deploys.`);
  UPLOADS_ROOT = fallback;
  UPLOAD_DIR = path.join(UPLOADS_ROOT, 'recordings');
  MATERIALS_DIR = path.join(UPLOADS_ROOT, 'materials');
  AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');
  ensureUploadDirs(UPLOADS_ROOT);
}
console.log(`[uploads] serving /uploads from ${UPLOADS_ROOT}`);
app.use('/uploads', express.static(UPLOADS_ROOT));

// Multer for file uploads
const upload = multer({ dest: UPLOAD_DIR });
const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MATERIALS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    cb(null, `${Date.now()}_${safe}${ext}`);
  },
});
const materialUpload = multer({ storage: materialStorage, limits: { fileSize: 200 * 1024 * 1024 } });
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.session.userId}_${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) {
      req.fileValidationError = 'Only image files allowed';
      return cb(null, false);
    }
    cb(null, true);
  },
});

// ============================================================
// Database handle. getDB() returns the async MySQL data layer; its
// prepare(sql).get/all/run(...) mirror the old better-sqlite3 API but return
// promises, so every call site simply awaits.
// ============================================================
const getDB = () => db;

// ============================================================
// Email Helper
// ============================================================
async function sendEmail(to, subject, html) {
  const cfg = await db.get("SELECT * FROM smtp_settings WHERE id=1");
  const provider = (cfg && cfg.provider) || 'smtp';
  const from = (cfg && (cfg.from_email || cfg.user)) || '';

  // ---- Resend (HTTP API) -------------------------------------------------
  if (provider === 'resend') {
    if (!cfg || !cfg.resend_api_key) {
      console.log(`[EMAIL] Resend not configured. Would send to ${to}: ${subject}`);
      return { sent: false, reason: 'Resend not configured' };
    }
    if (!from) return { sent: false, reason: 'From address required for Resend' };
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`[EMAIL] Resend failed to ${to}:`, data.message || resp.status);
        return { sent: false, reason: data.message || `Resend error ${resp.status}` };
      }
      // Resend reports used monthly quota via this response header (no polling
      // endpoint exists). Cache the latest value so the UI can display it.
      const quota = resp.headers.get('x-resend-monthly-quota');
      if (quota != null && quota !== '') {
        try { await db.run("UPDATE smtp_settings SET resend_quota_used=?, resend_quota_at=NOW() WHERE id=1", [String(quota)]); } catch { /* non-fatal */ }
      }
      console.log(`[EMAIL] Sent via Resend to ${to}: ${subject}`);
      return { sent: true };
    } catch (err) {
      console.error(`[EMAIL] Resend error to ${to}:`, err.message);
      return { sent: false, reason: err.message };
    }
  }

  // ---- Hostinger / generic SMTP (nodemailer) -----------------------------
  if (!cfg || !cfg.host || !cfg.user) {
    console.log(`[EMAIL] SMTP not configured. Would send to ${to}: ${subject}`);
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port || 587,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({
      from: from || cfg.user,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
    return { sent: true };
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

// ============================================================
// Auth helpers
// ============================================================
async function requireAuth(req, res) {
  if (!req.session.userId) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const user = await db.get("SELECT id,name,email,portal,role,specialization,status,avatar_color,avatar_url,must_change_password FROM users WHERE id=?", [req.session.userId]);
  if (!user) { req.session.destroy(() => {}); res.status(401).json({ error: 'User not found' }); return null; }
  return user;
}

async function requireRole(req, res, roles) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return user;
}

async function auditLog(userId, action, targetType, targetId, details) {
  try {
    await db.run("INSERT INTO audit_logs (user_id,action,target_type,target_id,details,ip_address) VALUES (?,?,?,?,?,?)", [userId, action, targetType || null, targetId || null, details || null, '']);
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}

// ============================================================
// Routes
// ============================================================

// Health — reports DB connectivity (never throws, so the UI can show status).
app.get('/api/health', async (req, res) => {
  try {
    const count = (await db.get("SELECT COUNT(*) as c FROM users")).c;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected', users_count: count });
  } catch (err) {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), database: 'disconnected', error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await db.get("SELECT * FROM users WHERE email=?", [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    auditLog(0, 'login_failed', 'user', null, `Failed: ${email}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status === 'inactive') return res.status(403).json({ error: 'Account deactivated' });

  req.session.userId = user.id;
  req.session.role = user.role;
  auditLog(user.id, 'login', 'user', user.id);

  res.json({ user: { id: user.id, name: user.name, email: user.email, portal: user.portal, role: user.role, specialization: user.specialization, status: user.status, avatar_color: user.avatar_color, avatar_url: user.avatar_url || '', must_change_password: !!user.must_change_password } });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  if (req.session.userId) auditLog(req.session.userId, 'logout', 'user', req.session.userId);
  req.session.destroy(() => {});
  res.json({ message: 'Logged out' });
});

// Session check
app.get('/api/auth/session', async (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const user = await db.get("SELECT id,name,email,portal,role,specialization,status,avatar_color,avatar_url,must_change_password FROM users WHERE id=?", [req.session.userId]);
  if (!user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user });
});

// Profile avatar upload (self-service for any logged-in user)
app.post('/api/profile/avatar', async (req, res) => {
  const u = await requireAuth(req, res); if (!u) return;
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 10 MB)' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (req.fileValidationError) return res.status(400).json({ error: req.fileValidationError });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const prior = await db.get("SELECT avatar_url FROM users WHERE id=?", [u.id]);
    const url = `/uploads/avatars/${req.file.filename}`;
    await db.run("UPDATE users SET avatar_url=? WHERE id=?", [url, u.id]);
    if (prior && prior.avatar_url) {
      const abs = path.join(__dirname, prior.avatar_url.replace(/^\/+/, ''));
      try { fs.unlinkSync(abs); } catch {}
    }
    auditLog(u.id, 'update_avatar', 'user', u.id);
    res.json({ message: 'Avatar updated', avatar_url: url });
  });
});

app.delete('/api/profile/avatar', async (req, res) => {
  const u = await requireAuth(req, res); if (!u) return;
  const prior = await db.get("SELECT avatar_url FROM users WHERE id=?", [u.id]);
  await db.run("UPDATE users SET avatar_url='' WHERE id=?", [u.id]);
  if (prior && prior.avatar_url) {
    const abs = path.join(__dirname, prior.avatar_url.replace(/^\/+/, ''));
    try { fs.unlinkSync(abs); } catch {}
  }
  auditLog(u.id, 'remove_avatar', 'user', u.id);
  res.json({ message: 'Avatar removed' });
});

// Bootstrap
app.get('/api/bootstrap', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const data = { user, courses: [], students: [], tutors: [] };

  if (user.role === 'student') {
    data.courses = await db.all("SELECT c.*,u.name as tutor_name,e.progress_percentage,e.grade,e.status as enrollment_status FROM courses c JOIN enrollments e ON e.course_id=c.id JOIN users u ON u.id=c.tutor_id WHERE e.student_id=?", [user.id]);
  } else if (user.role === 'tutor') {
    data.courses = await db.all("SELECT c.* FROM courses c WHERE c.tutor_id=?", [user.id]);
    data.students = await db.all("SELECT u.id,u.name,u.email,u.status,u.avatar_color,e.course_id,e.progress_percentage,e.grade,c.name as course_name FROM users u JOIN enrollments e ON e.student_id=u.id JOIN courses c ON c.id=e.course_id WHERE c.tutor_id=? ORDER BY u.name", [user.id]);
  } else {
    data.courses = await db.all("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name");
    data.students = await db.all("SELECT id,name,email,status,avatar_color,specialization FROM users WHERE role='student' ORDER BY name");
    data.tutors = await db.all("SELECT id,name,email,status,avatar_color,specialization FROM users WHERE role='tutor' ORDER BY name");
  }
  res.json(data);
});

// Portal data
app.get('/api/portal-data', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const data = {};

  switch (user.role) {
    case 'student': {
      data.courses = await db.all("SELECT c.*,u.name as tutor_name,e.progress_percentage,e.grade,e.status as enrollment_status FROM courses c JOIN enrollments e ON e.course_id=c.id JOIN users u ON u.id=c.tutor_id WHERE e.student_id=? ORDER BY c.name", [user.id]);
      data.upcoming_sessions = await db.all("SELECT s.*,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE s.start_time>? AND s.status='scheduled' AND (s.student_id IS NULL OR s.student_id=?) ORDER BY s.start_time LIMIT 20", [user.id, nowStr(), user.id]);
      // Sessions in the student's enrolled courses happening right now.
      data.live_sessions = await db.all("SELECT s.*, c.name as course_name, u.name as tutor_name, (SELECT COUNT(*) FROM attendance_logs a WHERE a.session_id=s.session_id AND a.leave_time IS NULL) as active_participants FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE s.status='live' AND (s.student_id IS NULL OR s.student_id=?) ORDER BY s.start_time DESC", [user.id, user.id]);
      data.attendance_stats = await db.get("SELECT COUNT(*) as total_sessions, SUM(CASE WHEN a.log_id IS NOT NULL THEN 1 ELSE 0 END) as attended FROM sessions s JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? LEFT JOIN attendance_logs a ON a.session_id=s.session_id AND a.student_id=? WHERE s.status='completed' AND (s.student_id IS NULL OR s.student_id=?)", [user.id, user.id, user.id]);
      break;
    }
    case 'tutor': {
      data.courses = await db.all("SELECT c.* FROM courses c WHERE c.tutor_id=? ORDER BY c.name", [user.id]);
      data.students = await db.all("SELECT DISTINCT u.id,u.name,u.email,u.status,u.avatar_color,e.course_id,e.progress_percentage,e.grade,c.name as course_name FROM users u JOIN enrollments e ON e.student_id=u.id JOIN courses c ON c.id=e.course_id WHERE c.tutor_id=? ORDER BY u.name", [user.id]);
      // A session counts as "conducted" if it was completed OR anyone actually
      // joined (attendance log exists).
      data.sessions = await db.all("SELECT s.*, c.name as course_name, (s.status='completed' OR EXISTS(SELECT 1 FROM attendance_logs a WHERE a.session_id=s.session_id)) as conducted FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY s.start_time DESC LIMIT 50", [user.id]);
      // Teaching stats: count + summed hours, computed in JS so we don't depend
      // on SQL date math over string timestamps.
      const tsRows = await db.all("SELECT s.start_time, s.end_time FROM sessions s WHERE s.tutor_id=? AND (s.status='completed' OR EXISTS(SELECT 1 FROM attendance_logs a WHERE a.session_id=s.session_id))", [user.id]);
      let total_hours = 0;
      for (const r of tsRows) {
        const h = (new Date(r.end_time) - new Date(r.start_time)) / 3600000;
        if (Number.isFinite(h) && h > 0) total_hours += h;
      }
      data.teaching_stats = { total_sessions: tsRows.length, total_hours };
      data.payout = await db.get("SELECT payout_rate, payout_type FROM users WHERE id=?", [user.id]);
      break;
    }
    case 'advisor': {
      // Scoped to the students assigned to this advisor (manual assignment).
      data.students = await db.all("SELECT u.id,u.name,u.email,u.status,u.avatar_color, COUNT(e.enrollment_id) as enrolled_courses, ROUND(AVG(e.progress_percentage),1) as avg_progress, GROUP_CONCAT(DISTINCT e.grade) as grades FROM users u LEFT JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' AND u.advisor_id=? GROUP BY u.id ORDER BY u.name", [user.id]);
      data.at_risk = await db.all("SELECT u.id,u.name,u.email,u.avatar_color, ROUND(AVG(e.progress_percentage),1) as avg_progress FROM users u JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' AND u.advisor_id=? GROUP BY u.id HAVING avg_progress<40 ORDER BY avg_progress", [user.id]);
      data.courses = await db.all("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id");
      break;
    }
    case 'manager': {
      // Manager scope = users whose team is one this manager owns.
      const teamIds = (await db.all("SELECT id FROM teams WHERE manager_id=?", [user.id])).map((t) => t.id);
      const tids = teamIds.length ? teamIds : [0]; // avoid empty IN ()
      const inClause = tids.map(() => '?').join(',');
      data.team_ids = teamIds;
      data.stats = {
        total_students: (await db.get(`SELECT COUNT(*) as c FROM users WHERE role='student' AND team_id IN (${inClause})`, tids)).c,
        total_tutors: (await db.get(`SELECT COUNT(*) as c FROM users WHERE role='tutor' AND team_id IN (${inClause})`, tids)).c,
        total_advisors: (await db.get(`SELECT COUNT(*) as c FROM users WHERE role='advisor' AND team_id IN (${inClause})`, tids)).c,
        total_courses: (await db.get("SELECT COUNT(*) as c FROM courses WHERE status='active'")).c,
        total_enrollments: (await db.get(`SELECT COUNT(*) as c FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.status='active' AND u.team_id IN (${inClause})`, tids)).c,
        total_sessions: (await db.get("SELECT COUNT(*) as c FROM sessions")).c,
        completed_sessions: (await db.get("SELECT COUNT(*) as c FROM sessions WHERE status='completed'")).c,
      };
      data.tutors = await db.all(`SELECT u.id,u.name,u.email,u.status,u.avatar_color,u.specialization, COUNT(DISTINCT c.id) as course_count, SUM(c.students_count) as total_students, COUNT(DISTINCT CASE WHEN s.status='completed' THEN s.session_id END) as sessions_completed FROM users u LEFT JOIN courses c ON c.tutor_id=u.id LEFT JOIN sessions s ON s.tutor_id=u.id WHERE u.role='tutor' AND u.team_id IN (${inClause}) GROUP BY u.id ORDER BY u.name`, tids);
      data.courses = await db.all("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.category,c.name");
      data.enrollment_by_category = await db.all(`SELECT c.category, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id LEFT JOIN users u ON u.id=e.student_id WHERE u.team_id IN (${inClause}) GROUP BY c.category ORDER BY count DESC`, tids);
      // Assignment UI data: this manager's teams, their students (with current
      // advisor/tutor), and the advisor & tutor pools within those teams.
      data.teams_list = await db.all("SELECT id, name FROM teams WHERE manager_id=? ORDER BY name", [user.id]);
      data.team_students = await db.all(`SELECT u.id,u.name,u.email,u.avatar_color,u.status,u.team_id,u.advisor_id,u.assigned_tutor_id, a.name as advisor_name, t.name as tutor_name, tm.name as team_name FROM users u LEFT JOIN users a ON a.id=u.advisor_id LEFT JOIN users t ON t.id=u.assigned_tutor_id LEFT JOIN teams tm ON tm.id=u.team_id WHERE u.role='student' AND u.team_id IN (${inClause}) ORDER BY u.name`, tids);
      data.team_advisors = await db.all(`SELECT id,name,team_id FROM users WHERE role='advisor' AND team_id IN (${inClause}) ORDER BY name`, tids);
      data.team_tutors = await db.all(`SELECT id,name,team_id FROM users WHERE role='tutor' AND team_id IN (${inClause}) ORDER BY name`, tids);
      break;
    }
    case 'superadmin': {
      data.stats = {
        total_users: (await db.get("SELECT COUNT(*) as c FROM users")).c,
        total_students: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='student'")).c,
        total_tutors: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='tutor'")).c,
        total_advisors: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='advisor'")).c,
        total_managers: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='manager'")).c,
        total_courses: (await db.get("SELECT COUNT(*) as c FROM courses")).c,
        active_sessions: (await db.get("SELECT COUNT(*) as c FROM sessions WHERE status IN ('scheduled','live')")).c,
        total_enrollments: (await db.get("SELECT COUNT(*) as c FROM enrollments")).c,
      };
      data.users = await db.all("SELECT id,name,email,portal,role,status,avatar_color,specialization,gender,team_id,advisor_id,assigned_tutor_id,created_at FROM users ORDER BY created_at DESC");
      data.courses = await db.all("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name");
      data.audit_logs = await db.all("SELECT a.*,u.name as user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50");
      // Sessions happening right now (status='live'), with who's currently in.
      data.live_sessions = await db.all("SELECT s.session_id, s.start_time, s.status, s.room_name, c.name as course_name, u.name as tutor_name, (SELECT COUNT(*) FROM attendance_logs a WHERE a.session_id=s.session_id AND a.leave_time IS NULL) as active_participants FROM sessions s JOIN courses c ON c.id=s.course_id LEFT JOIN users u ON u.id=s.tutor_id WHERE s.status='live' ORDER BY s.start_time DESC");
      // Dashboard charts (read-only aggregates).
      data.charts = {
        sessions_by_status: await db.all("SELECT status, COUNT(*) as count FROM sessions GROUP BY status ORDER BY count DESC"),
        enrollment_by_category: await db.all("SELECT c.category, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.category ORDER BY count DESC"),
        progress_distribution: await db.all(`SELECT bucket, COUNT(*) as count FROM (
            SELECT CASE
              WHEN progress_percentage <= 25 THEN '0-25%'
              WHEN progress_percentage <= 50 THEN '26-50%'
              WHEN progress_percentage <= 75 THEN '51-75%'
              ELSE '76-100%' END as bucket
            FROM enrollments
          ) AS pd GROUP BY bucket ORDER BY bucket`),
      };
      break;
    }
  }
  res.json(data);
});

// Students
app.get('/api/students', async (req, res) => {
  const user = await requireRole(req, res, ['tutor','advisor','manager','superadmin']); if (!user) return;
  res.json(await db.all("SELECT u.id,u.name,u.email,u.role,u.specialization,u.status,u.avatar_color,u.created_at, COUNT(e.enrollment_id) as enrolled_courses, ROUND(AVG(e.progress_percentage),1) as avg_progress FROM users u LEFT JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY u.name"));
});

// Full profile for a single student (everything related to them)
app.get('/api/students/:id', async (req, res) => {
  const user = await requireRole(req, res, ['tutor','advisor','manager','superadmin']); if (!user) return;
  const id = parseInt(req.params.id);
  // A tutor may only view a student enrolled in one of their own courses.
  if (user.role === 'tutor') {
    const own = await db.get("SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=? AND c.tutor_id=? LIMIT 1", [id, user.id]);
    if (!own) return res.status(403).json({ error: 'Not your student' });
  }
  const profile = await db.get("SELECT id,name,email,status,avatar_color,avatar_url,created_at FROM users WHERE id=? AND role='student'", [id]);
  if (!profile) return res.status(404).json({ error: 'Student not found' });

  const enrollments = await db.all("SELECT e.enrollment_id,e.course_id,e.progress_percentage,e.grade,e.status,e.enrollment_date,c.name as course_name,c.category,u.name as tutor_name FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN users u ON u.id=c.tutor_id WHERE e.student_id=? ORDER BY e.enrollment_date DESC", [id]);

  const sessions = await db.all("SELECT s.session_id,s.start_time,s.end_time,s.status,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id LEFT JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE (s.student_id IS NULL OR s.student_id=?) ORDER BY s.start_time DESC LIMIT 50", [id, id]);

  const attendance = await db.all("SELECT a.log_id,a.session_id,a.join_time,a.leave_time,a.duration_minutes,c.name as course_name,s.start_time FROM attendance_logs a JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE a.student_id=? ORDER BY a.timestamp DESC LIMIT 100", [id]);

  const stats = {
    enrolled_courses: enrollments.length,
    avg_progress: enrollments.length ? Math.round(enrollments.reduce((s, e) => s + (e.progress_percentage || 0), 0) / enrollments.length) : 0,
    total_sessions: sessions.length,
    sessions_attended: attendance.length,
  };

  res.json({ profile, enrollments, sessions, attendance, stats });
});

// Tutors
app.get('/api/tutors', async (req, res) => {
  const user = await requireRole(req, res, ['manager','superadmin']); if (!user) return;
  res.json(await db.all("SELECT u.id,u.name,u.email,u.role,u.status,u.avatar_color,u.specialization,u.payout_rate,u.payout_type,u.team_id, (SELECT name FROM teams WHERE id=u.team_id) AS team_name, COUNT(DISTINCT c.id) as course_count FROM users u LEFT JOIN courses c ON c.tutor_id=u.id WHERE u.role='tutor' GROUP BY u.id ORDER BY u.name"));
});

// Courses
app.get('/api/courses', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  res.json(await db.all("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name"));
});

app.post('/api/courses', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { name, category, tutor_id, color, icon } = req.body;
  if (!name || !category || !tutor_id) return res.status(400).json({ error: 'Name, category, and tutor required' });
  const r = await db.run("INSERT INTO courses (name,category,tutor_id,color,icon) VALUES (?,?,?,?,?)", [name, category, tutor_id, color || '#3B82F6', icon || 'book']);
  auditLog(user.id, 'create_course', 'course', r.lastInsertRowid, `Created: ${name}`);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Course created' });
});

app.put('/api/courses', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'Course ID required' });
  const allowed = ['name','category','tutor_id','color','icon','status'];
  const sets = []; const vals = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); } }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  await db.run(`UPDATE courses SET ${sets.join(',')} WHERE id=?`, vals);
  auditLog(user.id, 'update_course', 'course', id);
  res.json({ message: 'Course updated' });
});

app.delete('/api/courses', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Course ID required' });
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    try {
      await db.tx(async (t) => {
        const sids = (await t.all("SELECT session_id FROM sessions WHERE course_id=?", [id])).map(s => s.session_id);
        for (const sid of sids) {
          await t.run("DELETE FROM attendance_logs WHERE session_id=?", [sid]);
          await t.run("DELETE FROM meeting_records WHERE session_id=?", [sid]);
          await t.run("DELETE FROM signaling WHERE session_id=?", [sid]);
        }
        await t.run("DELETE FROM sessions WHERE course_id=?", [id]);
        await t.run("DELETE FROM enrollments WHERE course_id=?", [id]);
        await t.run("DELETE FROM courses WHERE id=?", [id]);
      });
      auditLog(user.id, 'delete_course', 'course', id);
      res.json({ message: 'Course permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete course: ' + err.message });
    }
  } else {
    await db.run("UPDATE courses SET status='archived' WHERE id=?", [id]);
    auditLog(user.id, 'archive_course', 'course', id);
    res.json({ message: 'Course archived' });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  res.json(await db.all("SELECT id,name FROM categories ORDER BY name"));
});

app.post('/api/categories', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = await db.run("INSERT INTO categories (name) VALUES (?)", [name]);
    auditLog(user.id, 'create_category', 'category', r.lastInsertRowid, `Created: ${name}`);
    res.status(201).json({ id: r.lastInsertRowid, name });
  } catch (err) {
    if (isDup(err)) return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { id, name } = req.body;
  const newName = (name || '').trim();
  if (!id || !newName) return res.status(400).json({ error: 'ID and name required' });
  const cat = await db.get("SELECT name FROM categories WHERE id=?", [id]);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  if (cat.name === newName) return res.json({ message: 'No change' });
  try {
    await db.tx(async (t) => {
      await t.run("UPDATE categories SET name=? WHERE id=?", [newName, id]);
      await t.run("UPDATE courses SET category=? WHERE category=?", [newName, cat.name]);
    });
    auditLog(user.id, 'update_category', 'category', id, `Renamed: ${cat.name} -> ${newName}`);
    res.json({ message: 'Category updated' });
  } catch (err) {
    if (isDup(err)) return res.status(400).json({ error: 'Category name already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Category ID required' });
  const cat = await db.get("SELECT name FROM categories WHERE id=?", [id]);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const inUse = (await db.get("SELECT COUNT(*) as n FROM courses WHERE category=?", [cat.name])).n;
  if (inUse > 0) return res.status(400).json({ error: `Category in use by ${inUse} course(s)` });
  await db.run("DELETE FROM categories WHERE id=?", [id]);
  auditLog(user.id, 'delete_category', 'category', id, `Deleted: ${cat.name}`);
  res.json({ message: 'Category deleted' });
});

// ============================================================
// Course Materials
// ============================================================
async function canManageMaterials(user, courseId) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const row = await db.get("SELECT 1 FROM course_material_managers WHERE course_id=? AND user_id=?", [courseId, user.id]);
  return !!row;
}

// List materials for a course
app.get('/api/course-materials', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  const canManage = await canManageMaterials(user, courseId);
  let rows;
  if (canManage) {
    rows = await db.all("SELECT m.*, u.name as created_by_name FROM course_materials m LEFT JOIN users u ON u.id=m.created_by WHERE m.course_id=? ORDER BY m.sort_order, m.created_at DESC", [courseId]);
  } else {
    // Students & non-managers see enabled only; must be enrolled (students) or any auth user otherwise
    if (user.role === 'student') {
      const enrolled = await db.get("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'", [user.id, courseId]);
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
    }
    rows = await db.all("SELECT id, course_id, title, description, type, file_path, url, original_name, sort_order, created_at FROM course_materials WHERE course_id=? AND is_enabled=1 ORDER BY sort_order, created_at DESC", [courseId]);
  }
  res.json({ can_manage: canManage, materials: rows });
});

// Create material — file upload or link
app.post('/api/course-materials', materialUpload.single('file'), async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const courseId = parseInt(req.body.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  if (!(await canManageMaterials(user, courseId))) return res.status(403).json({ error: 'Not authorized to manage materials for this course' });
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const url = (req.body.url || '').trim();
  if (!title) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'Title required' });
  }
  let type, filePath = '', originalName = '';
  if (req.file) {
    type = 'file';
    filePath = `/uploads/materials/${req.file.filename}`;
    originalName = req.file.originalname;
  } else if (url) {
    type = 'link';
  } else {
    return res.status(400).json({ error: 'Provide either a file or a URL' });
  }
  const r = await db.run(
    "INSERT INTO course_materials (course_id, title, description, type, file_path, url, original_name, created_by) VALUES (?,?,?,?,?,?,?,?)",
    [courseId, title, description, type, filePath, url, originalName, user.id]
  );
  auditLog(user.id, 'create_material', 'course_material', r.lastInsertRowid, `Course ${courseId}: ${title}`);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Material added' });
});

// Update material (title/description/is_enabled/sort_order)
app.put('/api/course-materials', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const mat = await db.get("SELECT course_id FROM course_materials WHERE id=?", [id]);
  if (!mat) return res.status(404).json({ error: 'Material not found' });
  if (!(await canManageMaterials(user, mat.course_id))) return res.status(403).json({ error: 'Not authorized' });
  const allowed = ['title','description','is_enabled','sort_order','url'];
  const sets = []; const vals = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k}=?`);
      vals.push(k === 'is_enabled' ? (fields[k] ? 1 : 0) : fields[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  await db.run(`UPDATE course_materials SET ${sets.join(',')} WHERE id=?`, vals);
  auditLog(user.id, 'update_material', 'course_material', id);
  res.json({ message: 'Material updated' });
});

// Delete material
app.delete('/api/course-materials', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const mat = await db.get("SELECT * FROM course_materials WHERE id=?", [id]);
  if (!mat) return res.status(404).json({ error: 'Material not found' });
  if (!(await canManageMaterials(user, mat.course_id))) return res.status(403).json({ error: 'Not authorized' });
  await db.run("DELETE FROM course_materials WHERE id=?", [id]);
  if (mat.type === 'file' && mat.file_path) {
    const abs = path.join(__dirname, mat.file_path.replace(/^\/+/, ''));
    try { fs.unlinkSync(abs); } catch {}
  }
  auditLog(user.id, 'delete_material', 'course_material', id);
  res.json({ message: 'Material deleted' });
});

// ============================================================
// Course Material Managers (assign / unassign)
// ============================================================
app.get('/api/course-material-managers', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  const rows = await db.all(
    "SELECT mm.user_id, u.name, u.email, u.role, mm.assigned_at FROM course_material_managers mm JOIN users u ON u.id=mm.user_id WHERE mm.course_id=? ORDER BY u.name",
    [courseId]
  );
  res.json(rows);
});

app.post('/api/course-material-managers', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const courseId = parseInt(req.body.course_id);
  const userId = parseInt(req.body.user_id);
  if (!courseId || !userId) return res.status(400).json({ error: 'course_id and user_id required' });
  const target = await db.get("SELECT id,role FROM users WHERE id=?", [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!['tutor','manager','advisor','superadmin'].includes(target.role)) return res.status(400).json({ error: 'User role cannot manage materials' });
  try {
    await db.run("INSERT INTO course_material_managers (course_id,user_id,assigned_by) VALUES (?,?,?)", [courseId, userId, user.id]);
    auditLog(user.id, 'assign_material_manager', 'course', courseId, `Assigned user ${userId}`);
    res.status(201).json({ message: 'Manager assigned' });
  } catch (err) {
    if (isDup(err)) return res.status(400).json({ error: 'Already assigned' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/course-material-managers', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  const userId = parseInt(req.query.user_id);
  if (!courseId || !userId) return res.status(400).json({ error: 'course_id and user_id required' });
  await db.run("DELETE FROM course_material_managers WHERE course_id=? AND user_id=?", [courseId, userId]);
  auditLog(user.id, 'unassign_material_manager', 'course', courseId, `Removed user ${userId}`);
  res.json({ message: 'Manager removed' });
});

// Enrollments
app.get('/api/enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  res.json(await db.all("SELECT e.*,u.name as student_name,u.email as student_email,u.avatar_color, c.name as course_name,c.category as course_category,t.name as tutor_name FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses c ON c.id=e.course_id JOIN users t ON t.id=c.tutor_id ORDER BY e.enrollment_date DESC"));
});

app.post('/api/enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  const { student_id, course_id } = req.body;
  if (!student_id || !course_id) return res.status(400).json({ error: 'Student and Course required' });
  const existing = await db.get("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?", [student_id, course_id]);
  if (existing) return res.status(400).json({ error: 'Already enrolled' });
  const r = await db.run("INSERT INTO enrollments (student_id,course_id) VALUES (?,?)", [student_id, course_id]);
  await db.run("UPDATE courses SET students_count=(SELECT COUNT(*) FROM enrollments WHERE course_id=courses.id AND status IN ('active','completed')) WHERE id=?", [course_id]);
  auditLog(user.id, 'create_enrollment', 'enrollment', r.lastInsertRowid);
  res.status(201).json({ enrollment_id: r.lastInsertRowid, message: 'Enrolled' });
});

app.put('/api/enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  const { enrollment_id, ...fields } = req.body;
  if (!enrollment_id) return res.status(400).json({ error: 'Enrollment ID required' });
  const allowed = ['progress_percentage','grade','status'];
  const sets = []; const vals = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); } }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(enrollment_id);
  await db.run(`UPDATE enrollments SET ${sets.join(',')} WHERE enrollment_id=?`, vals);
  auditLog(user.id, 'update_enrollment', 'enrollment', enrollment_id);
  res.json({ message: 'Updated' });
});

app.delete('/api/enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'ID required' });
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    try {
      await db.run("DELETE FROM enrollments WHERE enrollment_id=?", [id]);
      auditLog(user.id, 'delete_enrollment', 'enrollment', id);
      res.json({ message: 'Enrollment permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete enrollment: ' + err.message });
    }
  } else {
    await db.run("UPDATE enrollments SET status='dropped' WHERE enrollment_id=?", [id]);
    auditLog(user.id, 'drop_enrollment', 'enrollment', id);
    res.json({ message: 'Dropped' });
  }
});

// Sessions
app.get('/api/sessions', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  let rows;
  if (user.role === 'student') {
    // Common sessions (student_id IS NULL) for enrolled courses, plus any
    // session assigned privately to this student.
    rows = await db.all("SELECT s.*,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE (s.student_id IS NULL OR s.student_id=?) ORDER BY s.start_time DESC", [user.id, user.id]);
  } else if (user.role === 'tutor') {
    rows = await db.all("SELECT s.*,c.name as course_name,su.name as student_name FROM sessions s JOIN courses c ON c.id=s.course_id LEFT JOIN users su ON su.id=s.student_id WHERE s.tutor_id=? ORDER BY s.start_time DESC", [user.id]);
  } else {
    rows = await db.all("SELECT s.*,c.name as course_name,u.name as tutor_name,su.name as student_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id LEFT JOIN users su ON su.id=s.student_id ORDER BY s.start_time DESC");
  }
  res.json(rows);
});

app.post('/api/sessions', async (req, res) => {
  const user = await requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const { course_id, start_time, end_time, tutor_id, student_id } = req.body;
  if (!course_id || !start_time || !end_time) return res.status(400).json({ error: 'Missing fields' });
  const room = 'tijus-' + course_id + '-' + crypto.randomBytes(6).toString('hex');
  const tid = user.role === 'tutor' ? user.id : (tutor_id || user.id);
  // student_id null/empty/'all' => a common session visible to every enrolled
  // student; a numeric id => a private session for just that student.
  const sid = (student_id && student_id !== 'all') ? parseInt(student_id) || null : null;
  const r = await db.run("INSERT INTO sessions (course_id,tutor_id,student_id,start_time,end_time,room_name) VALUES (?,?,?,?,?,?)", [course_id, tid, sid, start_time, end_time, room]);
  auditLog(user.id, 'create_session', 'session', r.lastInsertRowid);
  res.status(201).json({ session_id: r.lastInsertRowid, room_name: room });
});

app.delete('/api/sessions', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Session ID required' });
  try {
    await db.tx(async (t) => {
      await t.run("DELETE FROM attendance_logs WHERE session_id=?", [id]);
      await t.run("DELETE FROM meeting_records WHERE session_id=?", [id]);
      await t.run("DELETE FROM signaling WHERE session_id=?", [id]);
      await t.run("DELETE FROM sessions WHERE session_id=?", [id]);
    });
    auditLog(user.id, 'delete_session', 'session', id);
    res.json({ message: 'Session permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session: ' + err.message });
  }
});

// Test video call
app.post('/api/test-call', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  try {
    // Create or reuse hidden test course
    let testCourse = await db.get("SELECT id FROM courses WHERE name='__test_call__'");
    if (!testCourse) {
      const r = await db.run("INSERT INTO courses (name,category,tutor_id,status) VALUES ('__test_call__','Technology',?,?)", [user.id, 'draft']);
      testCourse = { id: r.lastInsertRowid };
    }
    const room = 'test-' + crypto.randomBytes(8).toString('hex');
    const now = new Date();
    const end = new Date(now.getTime() + 3600000);
    const r = await db.run("INSERT INTO sessions (course_id,tutor_id,start_time,end_time,room_name) VALUES (?,?,?,?,?)",
      [testCourse.id, user.id, now.toISOString(), end.toISOString(), room]);
    const sessionId = r.lastInsertRowid;
    auditLog(user.id, 'create_test_call', 'session', sessionId);
    res.status(201).json({ session_id: sessionId, room_name: room });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create test call: ' + err.message });
  }
});

// ============================================================
// Temporary meetings (link + 5-digit passcode, no account needed)
// ============================================================
const meetingRoomName = (code) => `meet-${code}`;
async function genMeetingCode() {
  for (let i = 0; i < 20; i++) {
    const code = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    if (!(await db.get("SELECT 1 FROM meetings WHERE code=?", [code]))) return code;
  }
  return crypto.randomBytes(8).toString('hex');
}
const genPasscode = () => String(10000 + (crypto.randomBytes(4).readUInt32BE(0) % 90000)); // 5 digits

// Admin: create a meeting → returns the join code + passcode.
app.post('/api/meetings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const title = (req.body?.title || 'Meeting').toString().trim().slice(0, 80) || 'Meeting';
  const hostName = (req.body?.name || '').toString().trim().slice(0, 80);
  const hostEmail = (req.body?.email || '').toString().trim().slice(0, 120);
  const code = await genMeetingCode();
  const passcode = genPasscode();
  const r = await db.run("INSERT INTO meetings (code,passcode,title,host_name,host_email,created_by) VALUES (?,?,?,?,?,?)",
    [code, passcode, title, hostName, hostEmail, user.id]);
  auditLog(user.id, 'create_meeting', 'meeting', r.lastInsertRowid, title);
  res.status(201).json({ id: r.lastInsertRowid, code, passcode, title, host_name: hostName, host_email: hostEmail, status: 'active' });
});

// Admin: list meetings (newest first), active and ended.
app.get('/api/meetings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  res.json(await db.all("SELECT id,code,passcode,title,host_name,host_email,status,created_at FROM meetings ORDER BY created_at DESC"));
});

// Admin: end a meeting (passcode stops working) or, with ?permanent=true,
// delete it from history entirely. Ending also drops the LiveKit room.
app.delete('/api/meetings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Meeting ID required' });
  const permanent = req.query.permanent === 'true';
  const m = await db.get("SELECT * FROM meetings WHERE id=?", [id]);
  if (!m) return res.status(404).json({ error: 'Meeting not found' });
  if (livekitConfigured()) {
    try {
      const { RoomServiceClient } = await getLiveKit();
      const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
      await svc.deleteRoom(meetingRoomName(m.code));
    } catch { /* room may not exist */ }
  }
  if (permanent) {
    await db.run("DELETE FROM meetings WHERE id=?", [id]);
    auditLog(user.id, 'delete_meeting', 'meeting', id, m.title);
    return res.json({ message: 'Meeting deleted' });
  }
  await db.run("UPDATE meetings SET status='ended' WHERE id=?", [id]);
  auditLog(user.id, 'end_meeting', 'meeting', id, m.title);
  res.json({ message: 'Meeting ended' });
});

// Public: basic info for the join page (no passcode required).
app.get('/api/meetings/info', async (req, res) => {
  const code = (req.query.code || '').toString();
  const m = await db.get("SELECT title,status FROM meetings WHERE code=?", [code]);
  if (!m) return res.status(404).json({ error: 'Meeting not found' });
  res.json({ title: m.title, active: m.status === 'active' });
});

// Public: exchange code + passcode + display name for a LiveKit token. No login.
app.post('/api/meetings/token', async (req, res) => {
  const { code, passcode, name } = req.body || {};
  if (!code || !passcode) return res.status(400).json({ error: 'Code and passcode required' });
  const m = await db.get("SELECT * FROM meetings WHERE code=?", [code.toString()]);
  if (!m || m.status !== 'active') return res.status(404).json({ error: 'Meeting not found or ended' });
  if (m.passcode !== passcode.toString().trim()) return res.status(403).json({ error: 'Invalid passcode' });
  if (!livekitConfigured()) return res.status(503).json({ error: 'Video is not configured on the server' });
  const displayName = (name || 'Guest').toString().trim().slice(0, 40) || 'Guest';
  const room = meetingRoomName(m.code);
  const identity = 'g-' + crypto.randomBytes(6).toString('hex');
  try {
    const { AccessToken, RoomServiceClient } = await getLiveKit();
    try {
      const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
      await svc.createRoom({ name: room, emptyTimeout: 8 * 60 });
    } catch { /* room already exists */ }
    const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      name: displayName,
      metadata: JSON.stringify({ name: displayName, guest: true }),
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    const token = await at.toJwt();
    res.json({ url: livekit.url, token, room, identity, title: m.title, name: displayName });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to join meeting' });
  }
});

// Join session
app.post('/api/join-session', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  const sess = await db.get("SELECT s.*, CASE WHEN c.name='__test_call__' THEN 'Test Call' ELSE c.name END as course_name FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.session_id=?", [session_id]);
  if (!sess) return res.status(404).json({ error: 'Not found' });
  const isTestCall = await db.get("SELECT 1 FROM courses WHERE id=? AND name='__test_call__'", [sess.course_id]);
  if (!isTestCall && user.role === 'student') {
    const enrolled = await db.get("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?", [user.id, sess.course_id]);
    // A student who booked this session (1-on-1 slot) gets in without enrollment.
    const booked = enrolled ? null : await db.get("SELECT 1 FROM availability_slots WHERE session_id=? AND booked_by=?", [session_id, user.id]);
    if (!enrolled && !booked) return res.status(403).json({ error: 'Not enrolled' });
  }
  await db.run("INSERT INTO attendance_logs (session_id,student_id,join_time) VALUES (?,?,?)", [session_id, user.id, nowStr()]);
  if (sess.status === 'scheduled') await db.run("UPDATE sessions SET status='live' WHERE session_id=?", [session_id]);
  await db.run("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'join',?)", [session_id, user.id, JSON.stringify({ name: user.name, role: user.role })]);
  res.json({ room_name: sess.room_name, session: sess, user: { id: user.id, name: user.name, role: user.role } });
});

// Leave session
app.post('/api/leave-session', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  // Close this user's open attendance log(s), computing duration in JS.
  const open = await db.all("SELECT log_id, join_time FROM attendance_logs WHERE session_id=? AND student_id=? AND leave_time IS NULL", [session_id, user.id]);
  const leave = nowStr();
  for (const l of open) {
    await db.run("UPDATE attendance_logs SET leave_time=?, duration_minutes=? WHERE log_id=?", [leave, durationMinutes(l.join_time, leave), l.log_id]);
  }
  await db.run("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'leave','')", [session_id, user.id]);
  res.json({ message: 'Left session' });
});

// End a live session: mark it completed, close open attendance logs, and
// (LiveKit) disconnect everyone by deleting the room. Tutors may only end
// their own sessions; admins/managers any.
app.post('/api/end-session', async (req, res) => {
  const user = await requireRole(req, res, ['tutor', 'advisor', 'manager', 'superadmin']); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  const sess = await db.get("SELECT * FROM sessions WHERE session_id=?", [session_id]);
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  if (user.role === 'tutor' && sess.tutor_id !== user.id) {
    return res.status(403).json({ error: 'Not your session' });
  }
  await db.run("UPDATE sessions SET status='completed' WHERE session_id=?", [session_id]);
  const open = await db.all("SELECT log_id, join_time FROM attendance_logs WHERE session_id=? AND leave_time IS NULL", [session_id]);
  const leave = nowStr();
  for (const l of open) {
    await db.run("UPDATE attendance_logs SET leave_time=?, duration_minutes=? WHERE log_id=?", [leave, durationMinutes(l.join_time, leave), l.log_id]);
  }
  // Tell WebRTC peers the session ended, and tear down the LiveKit room.
  await db.run("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'leave','')", [session_id, user.id]);
  if (livekitConfigured()) {
    try {
      const { RoomServiceClient } = await getLiveKit();
      const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
      await svc.deleteRoom(livekitRoomName(session_id));
    } catch { /* room may not exist */ }
  }
  auditLog(user.id, 'end_session', 'session', session_id);
  res.json({ message: 'Session ended' });
});

// ============================================================
// Tutor availability & student booking
//
// Tutors publish specific date/time slots they're free. A student can browse
// any tutor's open slots and book one — booking creates a real session (with a
// LiveKit room) that both sides join. The booked student is granted access to
// that session via availability_slots.booked_by (see join-session /
// canAccessSession), so no course enrollment is needed. Booked sessions hang off
// one shared hidden '1-on-1 Session' course (tutor_id 0, status 'draft') purely
// to satisfy sessions.course_id — it stays out of course lists because those
// INNER JOIN users.
// ============================================================

// Tutors that have at least one open, future slot (student browse list).
app.get('/api/availability/tutors', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const rows = await db.all(
    `SELECT u.id, u.name, u.avatar_color, u.avatar_url, u.specialization,
       (SELECT COUNT(*) FROM availability_slots a WHERE a.tutor_id=u.id AND a.status='open' AND a.start_time > ?) AS open_slots
     FROM users u WHERE u.role='tutor' AND u.status='active'
     HAVING open_slots > 0 ORDER BY u.name`, [nowStr()]);
  res.json(rows);
});

// List slots. A tutor sees ALL their own slots (with the booking student's name);
// everyone else must pass ?tutor_id and sees only that tutor's OPEN future slots.
app.get('/api/availability', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  if (user.role === 'tutor') {
    const rows = await db.all(
      `SELECT a.*, u.name AS student_name, u.avatar_color AS student_color
       FROM availability_slots a LEFT JOIN users u ON u.id=a.booked_by
       WHERE a.tutor_id=? ORDER BY a.start_time`, [user.id]);
    return res.json(rows);
  }
  // Admin overview: every tutor's slots (with tutor + booking-student names).
  if (user.role === 'superadmin' && !req.query.tutor_id) {
    const rows = await db.all(
      `SELECT a.*, t.name AS tutor_name, t.avatar_color AS tutor_color, st.name AS student_name
       FROM availability_slots a
       JOIN users t ON t.id=a.tutor_id
       LEFT JOIN users st ON st.id=a.booked_by
       ORDER BY a.start_time DESC`);
    return res.json(rows);
  }
  const tutorId = parseInt(req.query.tutor_id);
  if (!tutorId) return res.status(400).json({ error: 'tutor_id required' });
  const rows = await db.all(
    `SELECT a.id, a.tutor_id, a.start_time, a.end_time, a.note, a.status
     FROM availability_slots a
     WHERE a.tutor_id=? AND a.status='open' AND a.start_time > ?
     ORDER BY a.start_time`, [tutorId, nowStr()]);
  res.json(rows);
});

// Tutor (or admin on a tutor's behalf) publishes a new availability slot.
app.post('/api/availability', async (req, res) => {
  const user = await requireRole(req, res, ['tutor', 'superadmin']); if (!user) return;
  const start_time = (req.body.start_time || '').toString().trim();
  const end_time = (req.body.end_time || '').toString().trim();
  const note = (req.body.note || '').toString().trim().slice(0, 255);
  if (!start_time || !end_time) return res.status(400).json({ error: 'Start and end time required' });
  const tid = user.role === 'tutor' ? user.id : (parseInt(req.body.tutor_id) || user.id);
  if (!(new Date(start_time) < new Date(end_time))) return res.status(400).json({ error: 'End time must be after start time' });
  if (!(new Date(end_time) > new Date())) return res.status(400).json({ error: 'Slot must be in the future' });
  // Reject overlap with an existing (non-cancelled) slot for this tutor.
  const clash = await db.get(
    "SELECT 1 FROM availability_slots WHERE tutor_id=? AND status<>'cancelled' AND start_time < ? AND end_time > ? LIMIT 1",
    [tid, end_time, start_time]);
  if (clash) return res.status(400).json({ error: 'Overlaps an existing slot' });
  const r = await db.run("INSERT INTO availability_slots (tutor_id,start_time,end_time,note) VALUES (?,?,?,?)", [tid, start_time, end_time, note]);
  auditLog(user.id, 'create_availability', 'availability_slot', r.lastInsertRowid);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Availability added' });
});

// Tutor removes one of their OPEN slots (booked slots can't be deleted here).
app.delete('/api/availability', async (req, res) => {
  const user = await requireRole(req, res, ['tutor', 'superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Slot ID required' });
  const slot = await db.get("SELECT * FROM availability_slots WHERE id=?", [id]);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (user.role === 'tutor' && slot.tutor_id !== user.id) return res.status(403).json({ error: 'Not your slot' });
  if (slot.status === 'booked') return res.status(400).json({ error: 'This slot is booked — end/cancel the session instead' });
  await db.run("DELETE FROM availability_slots WHERE id=?", [id]);
  auditLog(user.id, 'delete_availability', 'availability_slot', id);
  res.json({ message: 'Slot removed' });
});

// Tutor (or admin) edits one of their OPEN slots (booked slots can't be edited here).
app.put('/api/availability', async (req, res) => {
  const user = await requireRole(req, res, ['tutor', 'superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Slot ID required' });
  const slot = await db.get("SELECT * FROM availability_slots WHERE id=?", [id]);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (user.role === 'tutor' && slot.tutor_id !== user.id) return res.status(403).json({ error: 'Not your slot' });
  if (slot.status === 'booked') return res.status(400).json({ error: 'This slot is booked — end/cancel the session instead' });
  const start_time = (req.body.start_time || '').toString().trim();
  const end_time = (req.body.end_time || '').toString().trim();
  const note = (req.body.note || '').toString().trim().slice(0, 255);
  if (!start_time || !end_time) return res.status(400).json({ error: 'Start and end time required' });
  if (!(new Date(start_time) < new Date(end_time))) return res.status(400).json({ error: 'End time must be after start time' });
  if (!(new Date(end_time) > new Date())) return res.status(400).json({ error: 'Slot must be in the future' });
  // Reject overlap with any OTHER (non-cancelled) slot for this tutor.
  const clash = await db.get(
    "SELECT 1 FROM availability_slots WHERE tutor_id=? AND id<>? AND status<>'cancelled' AND start_time < ? AND end_time > ? LIMIT 1",
    [slot.tutor_id, id, end_time, start_time]);
  if (clash) return res.status(400).json({ error: 'Overlaps an existing slot' });
  await db.run("UPDATE availability_slots SET start_time=?, end_time=?, note=? WHERE id=?", [start_time, end_time, note, id]);
  auditLog(user.id, 'update_availability', 'availability_slot', id);
  res.json({ message: 'Slot updated' });
});

// Student books an open slot → creates a session (+ room) atomically.
app.post('/api/book-slot', async (req, res) => {
  const user = await requireRole(req, res, ['student']); if (!user) return;
  const slotId = parseInt(req.body.slot_id);
  if (!slotId) return res.status(400).json({ error: 'slot_id required' });
  try {
    const result = await db.tx(async (t) => {
      const slot = await t.get("SELECT * FROM availability_slots WHERE id=? FOR UPDATE", [slotId]);
      if (!slot) throw Object.assign(new Error('Slot not found'), { http: 404 });
      if (slot.status !== 'open') throw Object.assign(new Error('Slot is no longer available'), { http: 409 });
      if (!(new Date(slot.start_time) > new Date())) throw Object.assign(new Error('Slot is in the past'), { http: 400 });
      // Shared hidden course that exists only to satisfy sessions.course_id.
      let c = await t.get("SELECT id FROM courses WHERE name='1-on-1 Session' AND status='draft' LIMIT 1");
      if (!c) {
        const cr = await t.run("INSERT INTO courses (name,category,tutor_id,status) VALUES ('1-on-1 Session','Tutoring',0,'draft')", []);
        c = { id: cr.lastInsertRowid };
      }
      const room = 'tijus-bk-' + slotId + '-' + crypto.randomBytes(5).toString('hex');
      const sr = await t.run("INSERT INTO sessions (course_id,tutor_id,start_time,end_time,room_name) VALUES (?,?,?,?,?)",
        [c.id, slot.tutor_id, slot.start_time, slot.end_time, room]);
      await t.run("UPDATE availability_slots SET status='booked', booked_by=?, session_id=? WHERE id=?", [user.id, sr.lastInsertRowid, slotId]);
      return { session_id: sr.lastInsertRowid, room_name: room, start_time: slot.start_time, end_time: slot.end_time, tutor_id: slot.tutor_id };
    });
    auditLog(user.id, 'book_slot', 'availability_slot', slotId);
    res.status(201).json({ message: 'Booked', ...result });
  } catch (err) {
    res.status(err.http || 500).json({ error: err.message || 'Failed to book slot' });
  }
});

// A student's booked sessions (upcoming + past), with tutor + session status.
app.get('/api/my-bookings', async (req, res) => {
  const user = await requireRole(req, res, ['student']); if (!user) return;
  const rows = await db.all(
    `SELECT a.id, a.start_time, a.end_time, a.note, a.session_id,
       s.status AS session_status, s.room_name,
       t.name AS tutor_name, t.avatar_color AS tutor_color
     FROM availability_slots a
     JOIN sessions s ON s.session_id=a.session_id
     JOIN users t ON t.id=a.tutor_id
     WHERE a.booked_by=? ORDER BY a.start_time DESC`, [user.id]);
  res.json(rows);
});

// Signaling
app.get('/api/signaling', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const sid = parseInt(req.query.session_id);
  const lastId = parseInt(req.query.last_id) || 0;
  if (!sid) return res.status(400).json({ error: 'Session ID required' });
  const signals = await db.all("SELECT * FROM signaling WHERE session_id=? AND id>? AND from_user_id!=? AND (to_user_id IS NULL OR to_user_id=?) AND consumed=0 ORDER BY id", [sid, lastId, user.id, user.id]);
  if (signals.length) {
    // Only consume DIRECTED signals (offer/answer/ice aimed at one peer).
    // Broadcast join/leave (to_user_id NULL) must stay readable so that EVERY
    // other participant — including someone who joins later — receives them.
    const directed = signals.filter(s => s.to_user_id != null).map(s => s.id);
    if (directed.length) {
      await db.run(`UPDATE signaling SET consumed=1 WHERE id IN (${directed.join(',')})`);
    }
  }
  res.json(signals);
});

app.post('/api/signaling', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const { session_id, type, payload, to_user_id } = req.body;
  if (!session_id || !type) return res.status(400).json({ error: 'Missing fields' });
  const p = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const r = await db.run("INSERT INTO signaling (session_id,from_user_id,to_user_id,type,payload) VALUES (?,?,?,?,?)", [session_id, user.id, to_user_id || null, type, p]);
  res.json({ id: r.lastInsertRowid });
});

// Attendance
app.get('/api/attendance-logs', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const sid = req.query.session_id;
  let rows;
  if (sid) {
    rows = await db.all("SELECT a.*,u.name as student_name,u.avatar_color FROM attendance_logs a JOIN users u ON u.id=a.student_id WHERE a.session_id=? ORDER BY a.join_time", [parseInt(sid)]);
  } else if (user.role === 'student') {
    rows = await db.all("SELECT a.*,c.name as course_name,s.start_time FROM attendance_logs a JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE a.student_id=? ORDER BY a.timestamp DESC", [user.id]);
  } else if (user.role === 'tutor') {
    // Scope tutors to attendance for their own sessions only
    rows = await db.all("SELECT a.*,u.name as student_name,u.avatar_color,c.name as course_name,s.start_time FROM attendance_logs a JOIN users u ON u.id=a.student_id JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY a.timestamp DESC LIMIT 200", [user.id]);
  } else {
    rows = await db.all("SELECT a.*,u.name as student_name,u.avatar_color,c.name as course_name,s.start_time FROM attendance_logs a JOIN users u ON u.id=a.student_id JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id ORDER BY a.timestamp DESC LIMIT 200");
  }
  res.json(rows);
});

// ============================================================
// Staff Attendance & Salary / Payroll
// ============================================================
// Roles that draw a salary (and can clock in). Students are excluded.
const STAFF_ROLES = ['tutor', 'advisor', 'manager'];

// 'YYYY-MM' -> bounds for that calendar month. `start`/`end` are datetime
// strings for the half-open range [start, end) used against session timestamps;
// `startDate`/`endDate` are the date-only ('YYYY-MM-DD') bounds used against the
// staff_attendance.work_date column. Returns null for a malformed period.
function periodBounds(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  const ny = mo === 12 ? y + 1 : y;
  const nmo = mo === 12 ? 1 : mo + 1;
  const startDate = `${period}-01`;
  const endDate = `${ny}-${String(nmo).padStart(2, '0')}-01`;
  return { start: `${startDate} 00:00:00`, end: `${endDate} 00:00:00`, startDate, endDate };
}

// Actual teaching time a tutor delivered in [start,end). We use the REAL time
// taken, measured from each conducted session's attendance records — the span
// from the earliest join to the latest leave, or the longest single participant
// duration — and fall back to the scheduled start→end only when a session has
// no usable attendance timing. Hours are computed in JS over the string
// timestamps so we don't rely on SQL date math.
async function tutorSessionHours(tutorId, start, end) {
  const rows = await db.all(
    `SELECT s.session_id, s.start_time, s.end_time,
            MIN(a.join_time)        AS first_join,
            MAX(a.leave_time)       AS last_leave,
            MAX(a.duration_minutes) AS max_dur
     FROM sessions s
     LEFT JOIN attendance_logs a ON a.session_id = s.session_id
     WHERE s.tutor_id=? AND s.start_time>=? AND s.start_time<?
       AND (s.status='completed' OR EXISTS(SELECT 1 FROM attendance_logs a2 WHERE a2.session_id=s.session_id))
     GROUP BY s.session_id, s.start_time, s.end_time`,
    [tutorId, start, end]
  );
  let hours = 0;
  let sessions = 0;
  for (const r of rows) {
    let mins = 0;
    // Real time taken: earliest join → latest leave across all participants.
    if (r.first_join && r.last_leave) {
      mins = (new Date(r.last_leave) - new Date(r.first_join)) / 60000;
    }
    // Fallbacks: longest recorded participant duration, then scheduled length.
    if (!(mins > 0) && Number(r.max_dur) > 0) mins = Number(r.max_dur);
    if (!(mins > 0)) mins = (new Date(r.end_time) - new Date(r.start_time)) / 60000;
    if (Number.isFinite(mins) && mins > 0) { hours += mins / 60; sessions += 1; }
  }
  return { hours, sessions };
}

// Build salary rows for a period — one per active tutor. Salary is simply
// (hours worked × payout_rate), where "hours worked" is the actual time taken
// in their sessions (from attendance records). Joined against payroll_runs so
// the caller knows who's already been marked paid.
async function computePayroll(period) {
  const b = periodBounds(period);
  if (!b) return null;
  const currency = (await db.get("SELECT currency FROM app_settings WHERE id=1"))?.currency || 'INR';
  const staff = await db.all(
    "SELECT id, name, email, role, avatar_color, payout_rate FROM users WHERE role='tutor' AND status='active' ORDER BY name"
  );
  const paidRows = await db.all("SELECT * FROM payroll_runs WHERE period=?", [period]);
  const paidByUser = new Map(paidRows.map((r) => [r.user_id, r]));
  const rows = [];
  for (const u of staff) {
    const rate = Number(u.payout_rate) || 0;
    const t = await tutorSessionHours(u.id, b.start, b.end);
    const hours = Math.round(t.hours * 100) / 100;
    const gross = Math.round(hours * rate * 100) / 100;
    const paid = paidByUser.get(u.id);
    rows.push({
      user_id: u.id, name: u.name, email: u.email, role: u.role, avatar_color: u.avatar_color,
      payout_rate: rate, hours, sessions: t.sessions, days: 0,
      source: 'sessions',
      gross_amount: gross,
      paid: !!paid,
      paid_at: paid ? paid.paid_at : null,
      paid_amount: paid ? Number(paid.gross_amount) || 0 : null,
    });
  }
  const totals = {
    staff_count: rows.length,
    gross_total: Math.round(rows.reduce((s, r) => s + r.gross_amount, 0) * 100) / 100,
    paid_count: rows.filter((r) => r.paid).length,
    pending_count: rows.filter((r) => !r.paid).length,
    paid_total: Math.round(paidRows.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0) * 100) / 100,
  };
  return { period, currency, rows, totals };
}

// List staff-attendance rows. Superadmin sees everyone (optionally filtered by
// user_id and/or period); staff see only their own.
app.get('/api/staff-attendance', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const isAdmin = user.role === 'superadmin';
  const params = [];
  let where = '1=1';
  if (!isAdmin) { where += ' AND sa.user_id=?'; params.push(user.id); }
  else if (req.query.user_id) { where += ' AND sa.user_id=?'; params.push(parseInt(req.query.user_id)); }
  if (req.query.period) {
    const b = periodBounds(req.query.period);
    if (b) { where += ' AND sa.work_date>=? AND sa.work_date<?'; params.push(b.startDate, b.endDate); }
  }
  const rows = await db.all(
    `SELECT sa.*, u.name as staff_name, u.role as staff_role, u.avatar_color FROM staff_attendance sa JOIN users u ON u.id=sa.user_id WHERE ${where} ORDER BY sa.work_date DESC, u.name LIMIT 500`,
    params
  );
  res.json(rows);
});

// Self clock in / out for the logged-in staff member. One row per day: first
// call of the day records check-in, the next records check-out and hours.
app.post('/api/staff-attendance/clock', async (req, res) => {
  const user = await requireRole(req, res, [...STAFF_ROLES, 'superadmin']); if (!user) return;
  const now = nowStr();
  const today = now.slice(0, 10);
  const existing = await db.get("SELECT * FROM staff_attendance WHERE user_id=? AND work_date=?", [user.id, today]);
  if (!existing) {
    await db.run("INSERT INTO staff_attendance (user_id,work_date,check_in,status,recorded_by) VALUES (?,?,?,'present',?)", [user.id, today, now, user.id]);
    return res.json({ message: 'Clocked in', action: 'in', check_in: now });
  }
  if (!existing.check_out) {
    const hrs = Math.round(((new Date(now) - new Date(existing.check_in)) / 3600000) * 100) / 100;
    await db.run("UPDATE staff_attendance SET check_out=?, hours=? WHERE id=?", [now, hrs > 0 ? hrs : 0, existing.id]);
    return res.json({ message: 'Clocked out', action: 'out', check_out: now, hours: hrs > 0 ? hrs : 0 });
  }
  return res.status(400).json({ error: 'Already clocked out for today' });
});

// Admin upsert — create or adjust one staff member's day (manual entry). Hours
// are taken as given, or derived from check_in/check_out when both are present.
app.post('/api/staff-attendance', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const { user_id, work_date, check_in, check_out, hours, status, note } = req.body;
  if (!user_id || !work_date) return res.status(400).json({ error: 'Staff and date required' });
  let h = Number(hours) || 0;
  if (!h && check_in && check_out) {
    const d = (new Date(check_out) - new Date(check_in)) / 3600000;
    if (Number.isFinite(d) && d > 0) h = Math.round(d * 100) / 100;
  }
  const st = ['present', 'half_day', 'leave', 'absent'].includes(status) ? status : 'present';
  await db.run(
    `INSERT INTO staff_attendance (user_id,work_date,check_in,check_out,hours,status,note,recorded_by)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE check_in=VALUES(check_in), check_out=VALUES(check_out), hours=VALUES(hours), status=VALUES(status), note=VALUES(note), recorded_by=VALUES(recorded_by)`,
    [user_id, work_date, check_in || '', check_out || '', h, st, note || '', admin.id]
  );
  auditLog(admin.id, 'upsert_staff_attendance', 'staff_attendance', user_id, `${work_date}: ${st} ${h}h`);
  res.json({ message: 'Attendance saved' });
});

app.delete('/api/staff-attendance', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Record ID required' });
  await db.run("DELETE FROM staff_attendance WHERE id=?", [id]);
  auditLog(admin.id, 'delete_staff_attendance', 'staff_attendance', id);
  res.json({ message: 'Deleted' });
});

// Computed payroll for a period (defaults to the current month).
app.get('/api/payroll', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const period = req.query.period || nowStr().slice(0, 7);
  const result = await computePayroll(period);
  if (!result) return res.status(400).json({ error: 'Invalid period (expected YYYY-MM)' });
  res.json(result);
});

// Mark one, several, or all staff as paid for a period. The computed salary is
// snapshotted into payroll_runs so the history doesn't drift if rates or
// records change later. Idempotent per (user, period).
app.post('/api/payroll/pay', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const { period } = req.body;
  if (!periodBounds(period)) return res.status(400).json({ error: 'Invalid period (expected YYYY-MM)' });
  const computed = await computePayroll(period);
  let targets = computed.rows;
  if (req.body.user_id) {
    targets = targets.filter((r) => r.user_id === Number(req.body.user_id));
  } else if (Array.isArray(req.body.user_ids)) {
    const set = new Set(req.body.user_ids.map(Number));
    targets = targets.filter((r) => set.has(r.user_id));
  } // else: everyone in the run
  if (!targets.length) return res.status(400).json({ error: 'No matching staff to pay' });
  const now = nowStr();
  for (const r of targets) {
    await db.run(
      `INSERT INTO payroll_runs (user_id,period,role,payout_type,payout_rate,units,unit_label,gross_amount,currency,status,paid_by,paid_at)
       VALUES (?,?,?,'per_hour',?,?,'hours',?,?,'paid',?,?)
       ON DUPLICATE KEY UPDATE payout_rate=VALUES(payout_rate), units=VALUES(units), gross_amount=VALUES(gross_amount), currency=VALUES(currency), paid_by=VALUES(paid_by), paid_at=VALUES(paid_at)`,
      [r.user_id, period, r.role, r.payout_rate, r.hours, r.gross_amount, computed.currency, admin.id, now]
    );
  }
  auditLog(admin.id, 'pay_payroll', 'payroll', null, `${period}: paid ${targets.length} staff`);
  res.json({ message: `Marked ${targets.length} staff as paid`, count: targets.length });
});

// Undo a payment for a user in a period (removes the run so it shows Pending).
app.post('/api/payroll/unpay', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const { period, user_id } = req.body;
  if (!period || !user_id) return res.status(400).json({ error: 'Period and user required' });
  await db.run("DELETE FROM payroll_runs WHERE period=? AND user_id=?", [period, user_id]);
  auditLog(admin.id, 'unpay_payroll', 'payroll', user_id, period);
  res.json({ message: 'Payment reverted' });
});

// Paid-run history, newest first (optionally filtered by staff member).
app.get('/api/payroll/history', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin']); if (!admin) return;
  const params = [];
  let where = '1=1';
  if (req.query.user_id) { where += ' AND pr.user_id=?'; params.push(parseInt(req.query.user_id)); }
  const rows = await db.all(
    `SELECT pr.*, u.name as staff_name, u.role as staff_role FROM payroll_runs pr JOIN users u ON u.id=pr.user_id WHERE ${where} ORDER BY pr.period DESC, u.name LIMIT 500`,
    params
  );
  res.json(rows);
});

// Meeting records
app.get('/api/meeting-records', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  let rows;
  if (user.role === 'student') {
    rows = await db.all("SELECT mr.*,c.name as course_name,s.start_time FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? ORDER BY mr.creation_date DESC", [user.id]);
  } else if (user.role === 'tutor') {
    // Tutors only see recordings from their own sessions.
    rows = await db.all("SELECT mr.*,c.name as course_name,s.start_time FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY mr.creation_date DESC", [user.id]);
  } else {
    rows = await db.all("SELECT mr.*,c.name as course_name,s.start_time,u.name as tutor_name FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id ORDER BY mr.creation_date DESC");
  }
  // Flag orphaned rows whose underlying file is gone (e.g. uploads wiped on a
  // redeploy) so the UI can disable Play/Download instead of 404-ing. Resolve
  // against UPLOADS_ROOT via playback_url (served at /uploads) — file_path
  // holds an absolute path that may be stale across machines/deploys.
  for (const r of rows) {
    const pb = r.playback_url || '';
    const rel = pb.startsWith('/uploads/') ? pb.slice('/uploads/'.length) : pb.replace(/^\/+/, '');
    r.file_exists = !!rel && fs.existsSync(path.join(UPLOADS_ROOT, rel));
  }
  res.json(rows);
});

// Delete a recording (file + row). Tutors may delete only their own sessions'
// recordings; superadmin any.
app.delete('/api/meeting-records', async (req, res) => {
  const user = await requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Record ID required' });
  const rec = await db.get("SELECT mr.*, s.tutor_id FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id WHERE mr.record_id=?", [id]);
  if (!rec) return res.status(404).json({ error: 'Recording not found' });
  if (user.role === 'tutor' && rec.tutor_id !== user.id) return res.status(403).json({ error: 'Not your recording' });
  try { if (rec.file_path && fs.existsSync(rec.file_path)) fs.unlinkSync(rec.file_path); } catch { /* file already gone */ }
  await db.run("DELETE FROM meeting_records WHERE record_id=?", [id]);
  auditLog(user.id, 'delete_recording', 'meeting_record', id);
  res.json({ message: 'Recording deleted' });
});

// Reports
app.get('/api/reports', async (req, res) => {
  const user = await requireRole(req, res, ['advisor','manager','superadmin']); if (!user) return;
  const data = {
    total_students: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='student'")).c,
    active_students: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='student' AND status='active'")).c,
    total_tutors: (await db.get("SELECT COUNT(*) as c FROM users WHERE role='tutor'")).c,
    total_courses: (await db.get("SELECT COUNT(*) as c FROM courses WHERE status='active'")).c,
    total_enrollments: (await db.get("SELECT COUNT(*) as c FROM enrollments")).c,
    active_enrollments: (await db.get("SELECT COUNT(*) as c FROM enrollments WHERE status='active'")).c,
    completed_enrollments: (await db.get("SELECT COUNT(*) as c FROM enrollments WHERE status='completed'")).c,
    total_sessions: (await db.get("SELECT COUNT(*) as c FROM sessions")).c,
    completed_sessions: (await db.get("SELECT COUNT(*) as c FROM sessions WHERE status='completed'")).c,
    avg_progress: +((await db.get("SELECT AVG(progress_percentage) as v FROM enrollments")).v || 0).toFixed(1),
    courses_by_category: await db.all("SELECT category, COUNT(*) as count FROM courses GROUP BY category ORDER BY count DESC"),
    enrollments_by_course: await db.all("SELECT c.name, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.id ORDER BY count DESC LIMIT 10"),
    student_status_breakdown: await db.all("SELECT status, COUNT(*) as count FROM users WHERE role='student' GROUP BY status"),
    grade_distribution: await db.all("SELECT grade, COUNT(*) as count FROM enrollments WHERE grade!='' GROUP BY grade ORDER BY grade"),
  };
  const totalLogs = (await db.get("SELECT COUNT(*) as c FROM attendance_logs")).c;
  const totalPossible = (await db.get("SELECT COUNT(*) as c FROM sessions s JOIN enrollments e ON e.course_id=s.course_id WHERE s.status='completed'")).c;
  data.avg_attendance_rate = totalPossible > 0 ? +((totalLogs / totalPossible) * 100).toFixed(1) : 0;
  res.json(data);
});

// Users CRUD
app.get('/api/users', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  res.json(await db.all("SELECT id,name,email,portal,role,status,avatar_color,specialization,must_change_password,created_at FROM users ORDER BY created_at DESC"));
});

app.post('/api/users', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { name, email, role, password, specialization, avatar_color, gender, team_id } = req.body;
  if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, role required' });
  if (!['student','tutor','advisor','manager','superadmin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (await db.get("SELECT 1 FROM users WHERE email=?", [email])) return res.status(400).json({ error: 'Email exists' });
  const plainPassword = password || 'password123';
  const hash = bcrypt.hashSync(plainPassword, 10);
  const r = await db.run("INSERT INTO users (name,email,portal,role,password_hash,avatar_color,specialization,gender,team_id,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,1)", [name, email, role, role, hash, avatar_color || '#4F46E5', specialization || '', gender || '', team_id || null]);
  auditLog(user.id, 'create_user', 'user', r.lastInsertRowid, `Created: ${name} (${role})`);
  // Send welcome email (non-blocking, don't fail user creation if email fails)
  const loginUrl = `${req.protocol}://${req.get('host')}/login`;
  sendEmail(email, "Welcome to Tiju's Academy",
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#4F46E5">Welcome to Tiju's Academy!</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your account has been created with the following details:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 16px;font-weight:bold;color:#555">Role:</td><td style="padding:8px 16px">${role.charAt(0).toUpperCase() + role.slice(1)}</td></tr>
        <tr><td style="padding:8px 16px;font-weight:bold;color:#555">Email:</td><td style="padding:8px 16px">${email}</td></tr>
        <tr><td style="padding:8px 16px;font-weight:bold;color:#555">Password:</td><td style="padding:8px 16px"><code>${plainPassword}</code></td></tr>
      </table>
      <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px">Log In Now</a></p>
      <p style="color:#888;font-size:14px;margin-top:20px">Please change your password after your first login.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
      <p style="color:#aaa;font-size:12px">Tiju's Academy LMS</p>
    </div>`
  ).catch(() => {});
  res.status(201).json({ id: r.lastInsertRowid, message: 'User created' });
});

app.put('/api/users', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { id, password, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'User ID required' });
  const allowed = ['name','email','role','status','specialization','avatar_color','payout_rate','payout_type','gender','team_id','advisor_id','assigned_tutor_id'];
  const nullable = ['team_id','advisor_id','assigned_tutor_id'];
  const sets = []; const vals = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k}=?`); vals.push(nullable.includes(k) && (fields[k] === '' || fields[k] === null) ? null : fields[k]);
      if (k === 'role') { sets.push('portal=?'); vals.push(fields[k]); }
    }
  }
  if (password) { sets.push('password_hash=?'); vals.push(bcrypt.hashSync(password, 10)); sets.push('must_change_password=1'); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
  auditLog(user.id, 'update_user', 'user', id);
  res.json({ message: 'Updated' });
});

// Invite: reset the user's password to a fresh temp one and email the login
// link + password. The temp password is also returned so the admin can share
// it if SMTP is off.
app.post('/api/users/invite', async (req, res) => {
  const admin = await requireRole(req, res, ['superadmin', 'manager']); if (!admin) return;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID required' });
  const u = await db.get("SELECT id,name,email,role FROM users WHERE id=?", [user_id]);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '1!';
  await db.run("UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?", [bcrypt.hashSync(tempPassword, 10), u.id]);
  const loginUrl = `${req.protocol}://${req.get('host')}/login`;
  const emailResult = await sendEmail(u.email, "Your Tiju's Academy login",
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#4F46E5">You're invited to Tiju's Academy</h2>
      <p>Hello <strong>${u.name}</strong>,</p>
      <p>Use the details below to log in:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 16px;font-weight:bold;color:#555">Email:</td><td style="padding:8px 16px">${u.email}</td></tr>
        <tr><td style="padding:8px 16px;font-weight:bold;color:#555">Password:</td><td style="padding:8px 16px"><code>${tempPassword}</code></td></tr>
      </table>
      <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px">Log In</a></p>
      <p style="color:#888;font-size:14px;margin-top:20px">You'll be asked to set your own password after the first login.</p>
    </div>`);
  auditLog(admin.id, 'invite_user', 'user', u.id);
  res.json({ message: 'Invite ready', email: u.email, password: tempPassword, login_url: loginUrl, emailed: emailResult.sent });
});

app.delete('/api/users', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'ID required' });
  if (id === user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    try {
      await db.tx(async (t) => {
        // Delete attendance logs for sessions this user tutored
        const tutorSessionIds = (await t.all("SELECT session_id FROM sessions WHERE tutor_id=?", [id])).map(s => s.session_id);
        for (const sid of tutorSessionIds) {
          await t.run("DELETE FROM attendance_logs WHERE session_id=?", [sid]);
          await t.run("DELETE FROM meeting_records WHERE session_id=?", [sid]);
          await t.run("DELETE FROM signaling WHERE session_id=?", [sid]);
        }
        await t.run("DELETE FROM attendance_logs WHERE student_id=?", [id]);
        await t.run("DELETE FROM enrollments WHERE student_id=?", [id]);
        await t.run("DELETE FROM sessions WHERE tutor_id=?", [id]);
        await t.run("DELETE FROM courses WHERE tutor_id=?", [id]);
        await t.run("DELETE FROM password_resets WHERE user_id=?", [id]);
        await t.run("DELETE FROM audit_logs WHERE user_id=?", [id]);
        await t.run("DELETE FROM signaling WHERE from_user_id=?", [id]);
        await t.run("DELETE FROM users WHERE id=?", [id]);
      });
      auditLog(user.id, 'delete_user', 'user', id);
      res.json({ message: 'Permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
  } else {
    await db.run("UPDATE users SET status='inactive' WHERE id=?", [id]);
    auditLog(user.id, 'deactivate_user', 'user', id);
    res.json({ message: 'Deactivated' });
  }
});

// Clear data
app.post('/api/clear-data', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { target } = req.body;
  try {
    if (target === 'all') {
      await db.tx(async (t) => {
        await t.run("DELETE FROM signaling");
        await t.run("DELETE FROM meeting_records");
        await t.run("DELETE FROM attendance_logs");
        await t.run("DELETE FROM enrollments");
        await t.run("DELETE FROM sessions");
        await t.run("DELETE FROM courses");
        await t.run("DELETE FROM ticket_messages");
        await t.run("DELETE FROM tickets");
        await t.run("DELETE FROM password_resets");
        await t.run("DELETE FROM audit_logs");
        await t.run("DELETE FROM users WHERE id != ?", [user.id]);
      });
      auditLog(user.id, 'clear_all_data', 'system', null);
      res.json({ message: 'All data cleared (except your account)' });
    } else if (target === 'students') {
      await db.tx(async (t) => {
        const ids = (await t.all("SELECT id FROM users WHERE role='student'")).map(u => u.id);
        for (const id of ids) {
          await t.run("DELETE FROM attendance_logs WHERE student_id=?", [id]);
          await t.run("DELETE FROM enrollments WHERE student_id=?", [id]);
          await t.run("DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE student_id=?)", [id]);
          await t.run("DELETE FROM tickets WHERE student_id=?", [id]);
          await t.run("DELETE FROM password_resets WHERE user_id=?", [id]);
          await t.run("DELETE FROM users WHERE id=?", [id]);
        }
      });
      auditLog(user.id, 'clear_students', 'system', null);
      res.json({ message: 'All students cleared' });
    } else if (target === 'tutors') {
      await db.tx(async (t) => {
        const ids = (await t.all("SELECT id FROM users WHERE role='tutor'")).map(u => u.id);
        for (const id of ids) {
          const sids = (await t.all("SELECT session_id FROM sessions WHERE tutor_id=?", [id])).map(s => s.session_id);
          for (const sid of sids) {
            await t.run("DELETE FROM attendance_logs WHERE session_id=?", [sid]);
            await t.run("DELETE FROM meeting_records WHERE session_id=?", [sid]);
            await t.run("DELETE FROM signaling WHERE session_id=?", [sid]);
          }
          await t.run("DELETE FROM sessions WHERE tutor_id=?", [id]);
          await t.run("DELETE FROM enrollments WHERE course_id IN (SELECT id FROM courses WHERE tutor_id=?)", [id]);
          await t.run("DELETE FROM courses WHERE tutor_id=?", [id]);
          await t.run("DELETE FROM password_resets WHERE user_id=?", [id]);
          await t.run("DELETE FROM users WHERE id=?", [id]);
        }
      });
      auditLog(user.id, 'clear_tutors', 'system', null);
      res.json({ message: 'All tutors cleared' });
    } else if (target === 'courses') {
      await db.tx(async (t) => {
        await t.run("DELETE FROM attendance_logs");
        await t.run("DELETE FROM meeting_records");
        await t.run("DELETE FROM signaling");
        await t.run("DELETE FROM sessions");
        await t.run("DELETE FROM enrollments");
        await t.run("DELETE FROM courses");
      });
      auditLog(user.id, 'clear_courses', 'system', null);
      res.json({ message: 'All courses, sessions, and enrollments cleared' });
    } else if (target === 'sessions') {
      await db.tx(async (t) => {
        await t.run("DELETE FROM attendance_logs");
        await t.run("DELETE FROM meeting_records");
        await t.run("DELETE FROM signaling");
        await t.run("DELETE FROM sessions");
      });
      auditLog(user.id, 'clear_sessions', 'system', null);
      res.json({ message: 'All sessions and attendance cleared' });
    } else if (target === 'audit_logs') {
      await db.run("DELETE FROM audit_logs");
      res.json({ message: 'Audit logs cleared' });
    } else {
      res.status(400).json({ error: 'Invalid target. Use: all, students, tutors, courses, sessions, audit_logs' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear data: ' + err.message });
  }
});

// ============================================================
// App Settings (currency, etc.)
// ============================================================
app.get('/api/app-settings', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const s = (await db.get("SELECT currency, video_provider, zoom_account_id, zoom_client_id, zoom_client_secret, hubspot_token, kajabi_client_id, kajabi_client_secret FROM app_settings WHERE id=1")) || {};
  const isAdmin = user.role === 'superadmin';
  res.json({
    currency: s.currency || 'INR',
    // Default to LiveKit when it's configured; otherwise fall back to WebRTC.
    video_provider: s.video_provider || (livekitConfigured() ? 'livekit' : 'webrtc'),
    zoom_account_id: s.zoom_account_id || '',
    zoom_client_id: s.zoom_client_id || '',
    // Never echo the secret back; just report whether one is stored.
    zoom_has_secret: !!s.zoom_client_secret,
    // Availability is safe for everyone; the actual server url/key identify the
    // LiveKit server and are only exposed to the superadmin (Integrations panel).
    livekit_configured: livekitConfigured(),
    ...(isAdmin ? {
      // `source` is 'database' (added in the UI), 'env' (from .env) or 'none';
      // the secret is write-only (presence only).
      livekit_url: livekit.url || '',
      livekit_api_key: livekit.apiKey || '',
      livekit_has_secret: !!livekit.apiSecret,
      livekit_source: livekit.source,
    } : {}),
    // Never echo the HubSpot token back; report whether one is stored or
    // available via the .env default.
    hubspot_connected: !!(s.hubspot_token || process.env.HUBSPOT_TOKEN),
    // Kajabi: report whether a Client ID + Secret are stored (or env defaults).
    kajabi_connected: !!((s.kajabi_client_id && s.kajabi_client_secret) || (process.env.KAJABI_CLIENT_ID && process.env.KAJABI_CLIENT_SECRET)),
  });
});

app.put('/api/app-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const currency = (req.body.currency || '').trim().toUpperCase();
  const allowed = ['INR','USD','EUR','GBP','AED','AUD','CAD','SGD','JPY'];
  if (!allowed.includes(currency)) return res.status(400).json({ error: 'Unsupported currency' });
  await db.run(`INSERT INTO app_settings (id, currency) VALUES (1, ?)
    ON DUPLICATE KEY UPDATE currency=VALUES(currency)`, [currency]);
  auditLog(user.id, 'update_currency', 'app_settings', 1, `Set currency to ${currency}`);
  res.json({ message: 'Settings updated', currency });
});

// Video / meeting provider settings (WebRTC built-in, or Zoom)
app.put('/api/video-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const provider = (req.body.video_provider || 'webrtc').trim();
  if (!['webrtc', 'zoom', 'livekit'].includes(provider)) {
    return res.status(400).json({ error: 'Unsupported video provider' });
  }
  const accountId = (req.body.zoom_account_id || '').trim();
  const clientId = (req.body.zoom_client_id || '').trim();
  const clientSecret = (req.body.zoom_client_secret || '').trim(); // optional — blank keeps existing
  const lkUrl = (req.body.livekit_url || '').trim();
  const lkKey = (req.body.livekit_api_key || '').trim();
  const lkSecret = (req.body.livekit_api_secret || '').trim();    // optional — blank keeps existing
  await db.run("INSERT IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')");
  const existing = (await db.get("SELECT zoom_client_secret, livekit_url, livekit_api_key, livekit_api_secret FROM app_settings WHERE id=1")) || {};

  if (provider === 'zoom') {
    const hasSecret = clientSecret || existing.zoom_client_secret;
    if (!accountId || !clientId || !hasSecret) {
      return res.status(400).json({ error: 'Zoom requires Account ID, Client ID and Client Secret' });
    }
  }

  // LiveKit server fields are saved whenever provided, regardless of the active
  // provider, so an admin can add a server then switch to it. When switching TO
  // LiveKit, ensure a complete set of credentials is available (DB, this save,
  // or env), otherwise live sessions would fail.
  const effUrl = lkUrl || existing.livekit_url || '';
  const effKey = lkKey || existing.livekit_api_key || '';
  const effSecret = lkSecret || existing.livekit_api_secret || '';
  const envComplete = !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  if (provider === 'livekit' && !((effUrl && effKey && effSecret) || envComplete)) {
    return res.status(400).json({ error: 'LiveKit requires a Server URL, API Key and API Secret. Add a server below, or set the LIVEKIT_* env vars.' });
  }

  // Persist zoom fields (secret only when provided) and livekit fields (secret
  // only when provided), in one update.
  const sets = ['video_provider=?', 'zoom_account_id=?', 'zoom_client_id=?'];
  const params = [provider, accountId, clientId];
  if (clientSecret) { sets.push('zoom_client_secret=?'); params.push(clientSecret); }
  if (lkUrl) { sets.push('livekit_url=?'); params.push(lkUrl); }
  if (lkKey) { sets.push('livekit_api_key=?'); params.push(lkKey); }
  if (lkSecret) { sets.push('livekit_api_secret=?'); params.push(lkSecret); }
  await db.run(`UPDATE app_settings SET ${sets.join(', ')} WHERE id=1`, params);

  // Refresh the in-memory LiveKit cache so a newly added server takes effect
  // immediately, without a backend restart.
  await loadLivekitCreds();
  auditLog(user.id, 'update_video_settings', 'app_settings', 1, `Set video provider to ${provider}`);
  res.json({ message: 'Video settings saved', video_provider: provider, livekit_source: livekit.source });
});

// Request a Server-to-Server OAuth token from Zoom using stored credentials.
async function getZoomAccessToken() {
  const s = (await db.get("SELECT zoom_account_id, zoom_client_id, zoom_client_secret FROM app_settings WHERE id=1")) || {};
  if (!s.zoom_account_id || !s.zoom_client_id || !s.zoom_client_secret) {
    const e = new Error('Zoom credentials not configured'); e.code = 'NOT_CONFIGURED'; throw e;
  }
  const basic = Buffer.from(`${s.zoom_client_id}:${s.zoom_client_secret}`).toString('base64');
  const resp = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(s.zoom_account_id)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(data.reason || data.error || `Zoom auth failed (HTTP ${resp.status})`);
  }
  return data.access_token;
}

// Live Zoom integration status — actually tries to obtain a token.
app.get('/api/zoom-status', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const s = (await db.get("SELECT video_provider, zoom_account_id, zoom_client_id, zoom_client_secret FROM app_settings WHERE id=1")) || {};
  const provider = s.video_provider || 'webrtc';
  const configured = !!(s.zoom_account_id && s.zoom_client_id && s.zoom_client_secret);
  if (!configured) return res.json({ provider, configured: false, connected: false });
  try {
    await getZoomAccessToken();
    res.json({ provider, configured: true, connected: true });
  } catch (err) {
    res.json({ provider, configured: true, connected: false, error: err.message });
  }
});

// ============================================================
// HubSpot CRM — pull the contact list into the admin Contacts page
// ============================================================
// A token saved in Settings always wins; otherwise fall back to the default
// HUBSPOT_TOKEN from .env so the contact list works out of the box.
async function getHubspotToken() {
  const s = (await db.get("SELECT hubspot_token FROM app_settings WHERE id=1")) || {};
  return s.hubspot_token || process.env.HUBSPOT_TOKEN || '';
}

// Save / update the HubSpot private-app access token. Blank token disconnects.
app.put('/api/hubspot-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  // Strip every whitespace/invisible character — pasted PATs often carry a
  // trailing newline, non-breaking space, or zero-width char that .trim() misses
  // and that makes HubSpot reject the token as MALFORMED_TOKEN.
  const token = (req.body.hubspot_token || '').replace(/[\s​-‍﻿]/g, '');
  await db.run("INSERT IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')");
  // Blank means "disconnect"; only that explicitly clears the stored token.
  if (req.body.hubspot_token !== undefined) {
    await db.run("UPDATE app_settings SET hubspot_token=? WHERE id=1", [token]);
  }
  auditLog(user.id, 'update_hubspot_settings', 'app_settings', 1, token ? 'Connected HubSpot' : 'Disconnected HubSpot');
  res.json({ message: token ? 'HubSpot connected' : 'HubSpot disconnected', hubspot_connected: !!token });
});

// Live HubSpot status — verifies the token by hitting the account-info endpoint.
app.get('/api/hubspot-status', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const token = await getHubspotToken();
  if (!token) return res.json({ connected: false, configured: false });
  try {
    const resp = await fetch('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return res.json({ connected: false, configured: true, error: data.message || `HTTP ${resp.status}` });
    }
    const info = await resp.json().catch(() => ({}));
    const count = await hubspotContactCount(token);
    res.json({ connected: true, configured: true, portal_id: info.portalId, count });
  } catch (err) {
    res.json({ connected: false, configured: true, error: err.message });
  }
});

const HUBSPOT_CONTACT_PROPS = ['email', 'firstname', 'lastname', 'phone', 'company', 'lifecyclestage', 'createdate'];

// Map a raw HubSpot contact record into the shape the Contacts table expects.
function mapHubspotContact(r) {
  const p = r.properties || {};
  const name = [p.firstname, p.lastname].filter(Boolean).join(' ').trim();
  return {
    id: r.id,
    name: name || '—',
    email: p.email || '',
    phone: p.phone || '',
    company: p.company || '',
    lifecycle_stage: p.lifecyclestage || '',
    created_at: p.createdate || r.createdAt || '',
  };
}

// Total number of contacts in the portal.
async function hubspotContactCount(token) {
  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    return typeof data.total === 'number' ? data.total : null;
  } catch { return null; }
}

// One page of contacts (100 at a time), paged server-side.
app.get('/api/hubspot/contacts', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const token = await getHubspotToken();
  if (!token) return res.status(400).json({ error: 'HubSpot is not connected. Add a private-app token in Settings.' });

  const q = (req.query.q || '').trim();
  const after = (req.query.after || '').trim();
  const LIMIT = 100;
  try {
    let resp;
    if (q) {
      resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          limit: LIMIT,
          ...(after ? { after } : {}),
          properties: HUBSPOT_CONTACT_PROPS,
          sorts: ['createdate'],
        }),
      });
    } else {
      const params = new URLSearchParams({ limit: String(LIMIT), properties: HUBSPOT_CONTACT_PROPS.join(',') });
      if (after) params.set('after', after);
      resp = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status === 401 ? 401 : 502).json({ error: data.message || `HubSpot request failed (HTTP ${resp.status})` });
    }
    const contacts = (data.results || []).map(mapHubspotContact);
    const next = data.paging && data.paging.next ? data.paging.next.after : '';
    let total = typeof data.total === 'number' ? data.total : null;
    if (total === null && !after) total = await hubspotContactCount(token);
    res.json({ contacts, after: next, total });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ============================================================
// Kajabi — pull the contact/people list into the Kajabi Contacts page
// ============================================================
// Kajabi exposes an OAuth2 (client-credentials) API. Create an API client in
// Kajabi (Settings → … → API) to get a Client ID + Client Secret, then this
// app exchanges them for a bearer token and lists contacts. The base URL is
// overridable via KAJABI_API_BASE so it can be retargeted without code changes.
const KAJABI_API_BASE = (process.env.KAJABI_API_BASE || 'https://api.kajabi.com').replace(/\/+$/, '');

// Stored credentials win; otherwise fall back to env (KAJABI_CLIENT_ID/SECRET).
async function getKajabiCreds() {
  const s = (await db.get("SELECT kajabi_client_id, kajabi_client_secret FROM app_settings WHERE id=1")) || {};
  return {
    clientId: s.kajabi_client_id || process.env.KAJABI_CLIENT_ID || '',
    clientSecret: s.kajabi_client_secret || process.env.KAJABI_CLIENT_SECRET || '',
  };
}

// Cached bearer token (refreshed shortly before expiry). Reset on cred changes.
let _kajabiToken = { value: '', exp: 0 };
function resetKajabiToken() { _kajabiToken = { value: '', exp: 0 }; }
async function getKajabiToken() {
  const now = Date.now();
  if (_kajabiToken.value && now < _kajabiToken.exp) return _kajabiToken.value;
  const { clientId, clientSecret } = await getKajabiCreds();
  if (!clientId || !clientSecret) {
    const e = new Error('Kajabi credentials not configured'); e.code = 'NOT_CONFIGURED'; throw e;
  }
  // Kajabi's token endpoint is /v1/oauth/token and expects a form-encoded body.
  const resp = await fetch(`${KAJABI_API_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Kajabi auth failed (HTTP ${resp.status})`);
  }
  _kajabiToken = { value: data.access_token, exp: now + Math.max(60, (data.expires_in || 3600) - 60) * 1000 };
  return _kajabiToken.value;
}

// Map a Kajabi (JSON:API) contact record into the shared Contacts table shape.
// Kajabi contacts carry name/email/phone_number/subscribed/created_at; there's
// no company, so the "Stage" column shows the subscription state instead.
function mapKajabiContact(r) {
  const a = r.attributes || r || {};
  const name = (a.name || [a.first_name, a.last_name].filter(Boolean).join(' ')).trim();
  return {
    id: String(r.id || a.id || ''),
    name: name || '—',
    email: a.email || '',
    phone: a.phone_number || a.phone || '',
    company: a.company || a.company_name || '',
    lifecycle_stage: a.subscribed === true ? 'subscribed' : (a.subscribed === false ? 'unsubscribed' : ''),
    created_at: a.created_at || a.createdAt || '',
  };
}

// Save / update Kajabi API credentials. `disconnect: true` (or both blank)
// clears them. The secret is only overwritten when a non-blank value is sent.
app.put('/api/kajabi-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  await db.run("INSERT IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')");
  const clientId = (req.body.kajabi_client_id || '').trim();
  const clientSecret = (req.body.kajabi_client_secret || '').trim();
  if (req.body.disconnect) {
    await db.run("UPDATE app_settings SET kajabi_client_id='', kajabi_client_secret='' WHERE id=1");
    resetKajabiToken();
    auditLog(user.id, 'update_kajabi_settings', 'app_settings', 1, 'Disconnected Kajabi');
    return res.json({ message: 'Kajabi disconnected', kajabi_connected: false });
  }
  if (!clientId) return res.status(400).json({ error: 'Client ID is required' });
  if (clientSecret) {
    await db.run("UPDATE app_settings SET kajabi_client_id=?, kajabi_client_secret=? WHERE id=1", [clientId, clientSecret]);
  } else {
    await db.run("UPDATE app_settings SET kajabi_client_id=? WHERE id=1", [clientId]);
  }
  resetKajabiToken();
  const { clientSecret: effSecret } = await getKajabiCreds();
  auditLog(user.id, 'update_kajabi_settings', 'app_settings', 1, 'Connected Kajabi');
  res.json({ message: 'Kajabi credentials saved', kajabi_connected: !!(clientId && effSecret) });
});

// Total number of Kajabi contacts (from the list endpoint's meta.total).
async function kajabiContactCount(token) {
  try {
    const resp = await fetch(`${KAJABI_API_BASE}/v1/contacts?${new URLSearchParams({ 'page[size]': '1' }).toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    const meta = data.meta || {};
    if (typeof meta.total === 'number') return meta.total;
    if (typeof meta.total_count === 'number') return meta.total_count;
    return null;
  } catch { return null; }
}

// Live Kajabi status — verifies the credentials by obtaining a token, and
// reports the total contact count for the dashboard card.
app.get('/api/kajabi-status', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  const { clientId, clientSecret } = await getKajabiCreds();
  const configured = !!(clientId && clientSecret);
  if (!configured) return res.json({ configured: false, connected: false });
  try {
    const token = await getKajabiToken();
    const count = await kajabiContactCount(token);
    res.json({ configured: true, connected: true, count });
  } catch (err) {
    res.json({ configured: true, connected: false, error: err.message });
  }
});

// One page of Kajabi contacts (100 at a time), paged server-side via JSON:API
// page[number]/page[size]. `q` is passed as a best-effort filter.
app.get('/api/kajabi/contacts', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { clientId, clientSecret } = await getKajabiCreds();
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'Kajabi is not connected. Add API credentials in Settings.' });

  const q = (req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const SIZE = 100;
  try {
    const token = await getKajabiToken();
    const params = new URLSearchParams({ 'page[size]': String(SIZE), 'page[number]': String(page) });
    if (q) params.set('filter[search]', q); // fuzzy search over name/email
    const resp = await fetch(`${KAJABI_API_BASE}/v1/contacts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status === 401 ? 401 : 502).json({ error: (data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].title)) || data.error || `Kajabi request failed (HTTP ${resp.status})` });
    }
    const records = Array.isArray(data.data) ? data.data : [];
    const contacts = records.map(mapKajabiContact);
    const meta = data.meta || {};
    const total = typeof meta.total === 'number' ? meta.total
      : (meta.pagination && typeof meta.pagination.total === 'number' ? meta.pagination.total : null);
    const hasNext = !!(data.links && data.links.next) || contacts.length === SIZE;
    res.json({ contacts, page, total, has_next: hasNext });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ============================================================
// Contact enrollments — intimations to managers & advisors
// ============================================================
// Record an enrollment for a HubSpot contact and email every manager & advisor.
app.post('/api/contact-enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { hubspot_contact_id, name, email, phone, company, stage } = req.body || {};
  if (!name && !email) return res.status(400).json({ error: 'Contact name or email is required' });

  const r = await db.run(
    `INSERT INTO contact_enrollments
      (hubspot_contact_id, contact_name, contact_email, contact_phone, contact_company, contact_stage, enrolled_by, enrolled_by_name, status)
     VALUES (?,?,?,?,?,?,?,?, 'pending')`,
    [hubspot_contact_id || '', name || '', email || '', phone || '', company || '', stage || '', user.id, user.name]
  );
  const enrollId = r.lastInsertRowid;
  auditLog(user.id, 'enroll_contact', 'contact_enrollment', enrollId, `Enrolled ${name || email}`);

  // Intimation → every manager & advisor with an email address.
  const recipients = await db.all(
    "SELECT name, email FROM users WHERE role IN ('manager','advisor') AND status!='inactive' AND email IS NOT NULL AND email!=''"
  );
  const subject = `New Enrollment: ${name || email}`;
  let emailed = 0;
  for (const rec of recipients) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#E97A2B;margin-bottom:4px">New Contact Enrolled</h2>
      <p style="color:#555;margin-top:0">Hello <strong>${rec.name}</strong>, a contact was just enrolled from the HubSpot Contacts module.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 10px;color:#888">Name</td><td style="padding:6px 10px;font-weight:600">${name || '—'}</td></tr>
        <tr><td style="padding:6px 10px;color:#888">Email</td><td style="padding:6px 10px">${email || '—'}</td></tr>
        <tr><td style="padding:6px 10px;color:#888">Phone</td><td style="padding:6px 10px">${phone || '—'}</td></tr>
        <tr><td style="padding:6px 10px;color:#888">Company</td><td style="padding:6px 10px">${company || '—'}</td></tr>
        <tr><td style="padding:6px 10px;color:#888">Stage</td><td style="padding:6px 10px">${stage || '—'}</td></tr>
        <tr><td style="padding:6px 10px;color:#888">Enrolled by</td><td style="padding:6px 10px">${user.name}</td></tr>
      </table>
      <p style="color:#888;font-size:13px">Open the <strong>Enrolls</strong> tab in your portal to review this enrollment.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
      <p style="color:#aaa;font-size:12px">Tiju's Academy LMS</p>
    </div>`;
    const result = await sendEmail(rec.email, subject, html);
    if (result.sent) emailed++;
  }
  await db.run("UPDATE contact_enrollments SET notified=? WHERE id=?", [emailed, enrollId]);
  res.status(201).json({ message: 'Contact enrolled', enrollment_id: enrollId, recipients: recipients.length, emailed });
});

// List intimations — feeds the "Enrolls" tab for managers, advisors & superadmin.
app.get('/api/contact-enrollments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin', 'manager', 'advisor']); if (!user) return;
  res.json(await db.all("SELECT * FROM contact_enrollments ORDER BY created_at DESC"));
});

// ============================================================
// Support tickets — student → advisor → manager → superadmin
// ============================================================

// Small HTML wrapper shared by every ticket notification email.
function ticketEmailHtml(heading, intro, ticket) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h2 style="color:#E97A2B;margin-bottom:4px">${heading}</h2>
    <p style="color:#555;margin-top:0">${intro}</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0">
      <tr><td style="padding:6px 10px;color:#888">Ticket #</td><td style="padding:6px 10px;font-weight:600">${ticket.id}</td></tr>
      <tr><td style="padding:6px 10px;color:#888">Subject</td><td style="padding:6px 10px;font-weight:600">${ticket.subject || '—'}</td></tr>
      <tr><td style="padding:6px 10px;color:#888">Priority</td><td style="padding:6px 10px">${ticket.priority || 'medium'}</td></tr>
      <tr><td style="padding:6px 10px;color:#888">Status</td><td style="padding:6px 10px">${ticket.status || 'open'}</td></tr>
    </table>
    <p style="color:#888;font-size:13px">Open the <strong>Tickets</strong> tab in your portal to respond.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="color:#aaa;font-size:12px">Tiju's Academy LMS</p>
  </div>`;
}

// Load a ticket plus the people on it (used for access checks & display).
async function getTicketWithContext(id) {
  return db.get(
    `SELECT t.*, s.name AS student_name, s.avatar_color AS student_color, s.team_id AS student_team_id,
            a.name AS advisor_name, m.name AS manager_name
     FROM tickets t
     JOIN users s ON s.id = t.student_id
     LEFT JOIN users a ON a.id = t.assigned_advisor_id
     LEFT JOIN users m ON m.id = t.assigned_manager_id
     WHERE t.id = ?`, [id]
  );
}

// Can `user` see/act on `ticket`? Student owner, the assigned advisor, the
// assigned manager (or the manager of the student's team), or any superadmin.
async function canAccessTicket(user, ticket) {
  if (!ticket) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'student') return ticket.student_id === user.id;
  if (user.role === 'advisor') return ticket.assigned_advisor_id === user.id;
  if (user.role === 'manager') {
    if (ticket.assigned_manager_id === user.id) return true;
    if (ticket.student_team_id) {
      const team = await db.get("SELECT manager_id FROM teams WHERE id=?", [ticket.student_team_id]);
      return !!(team && team.manager_id === user.id);
    }
  }
  return false;
}

// Student raises a ticket. It is routed to their currently-assigned advisor.
app.post('/api/tickets', async (req, res) => {
  const user = await requireRole(req, res, ['student']); if (!user) return;
  const { subject, message, category, priority } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const student = await db.get("SELECT id, advisor_id FROM users WHERE id=?", [user.id]);
  if (!student.advisor_id) {
    return res.status(400).json({ error: 'You have no advisor assigned yet. Please contact your manager.' });
  }
  const prio = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';

  const r = await db.run(
    `INSERT INTO tickets (student_id, subject, category, priority, status, assigned_advisor_id)
     VALUES (?,?,?,?, 'open', ?)`,
    [user.id, subject.trim(), (category || 'general').trim(), prio, student.advisor_id]
  );
  const ticketId = r.lastInsertRowid;
  await db.run(
    "INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body) VALUES (?,?,?,?,?)",
    [ticketId, user.id, user.name, 'student', message.trim()]
  );
  auditLog(user.id, 'create_ticket', 'ticket', ticketId, subject.trim());

  const advisor = await db.get("SELECT name, email FROM users WHERE id=? AND status!='inactive'", [student.advisor_id]);
  if (advisor && advisor.email) {
    const ticket = { id: ticketId, subject: subject.trim(), priority: prio, status: 'open' };
    await sendEmail(advisor.email, `New Support Ticket #${ticketId}: ${subject.trim()}`,
      ticketEmailHtml('New Support Ticket', `Hello <strong>${advisor.name}</strong>, ${user.name} has raised a support ticket.`, ticket));
  }
  res.status(201).json({ message: 'Ticket created', ticket_id: ticketId });
});

// Role-scoped ticket list.
app.get('/api/tickets', async (req, res) => {
  const user = await requireRole(req, res, ['student', 'advisor', 'manager', 'superadmin']); if (!user) return;
  let where = '1=1';
  let params = [];
  if (user.role === 'student') { where = 't.student_id = ?'; params = [user.id]; }
  else if (user.role === 'advisor') { where = 't.assigned_advisor_id = ?'; params = [user.id]; }
  else if (user.role === 'manager') {
    const tids = await managerTeamIds(user.id);
    const ids = tids.length ? tids : [0];
    const inClause = ids.map(() => '?').join(',');
    // Tickets escalated to this manager, or raised by a student in their team(s).
    where = `(t.assigned_manager_id = ? OR s.team_id IN (${inClause}))`;
    params = [user.id, ...ids];
  }
  const rows = await db.all(
    `SELECT t.*, s.name AS student_name, s.avatar_color AS student_color,
            a.name AS advisor_name, m.name AS manager_name,
            (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
     FROM tickets t
     JOIN users s ON s.id = t.student_id
     LEFT JOIN users a ON a.id = t.assigned_advisor_id
     LEFT JOIN users m ON m.id = t.assigned_manager_id
     WHERE ${where}
     ORDER BY t.updated_at DESC`, params);
  res.json(rows);
});

// Actionable ticket count for the current user — feeds the sidebar badge.
// Counts tickets in the user's scope that still need attention (open/escalated).
app.get('/api/tickets/count', async (req, res) => {
  const user = await requireRole(req, res, ['student', 'advisor', 'manager', 'superadmin']); if (!user) return;
  let where = "t.status IN ('open','escalated')";
  let params = [];
  if (user.role === 'student') { where = "t.student_id = ? AND " + where; params = [user.id]; }
  else if (user.role === 'advisor') { where = "t.assigned_advisor_id = ? AND " + where; params = [user.id]; }
  else if (user.role === 'manager') {
    const tids = await managerTeamIds(user.id);
    const ids = tids.length ? tids : [0];
    const inClause = ids.map(() => '?').join(',');
    where = `(t.assigned_manager_id = ? OR s.team_id IN (${inClause})) AND ` + where;
    params = [user.id, ...ids];
  }
  const row = await db.get(
    `SELECT COUNT(*) AS n FROM tickets t JOIN users s ON s.id = t.student_id WHERE ${where}`, params);
  res.json({ count: row ? row.n : 0 });
});

// Ticket detail + full conversation thread.
app.get('/api/tickets/thread', async (req, res) => {
  const user = await requireRole(req, res, ['student', 'advisor', 'manager', 'superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const ticket = await getTicketWithContext(id);
  if (!(await canAccessTicket(user, ticket))) return res.status(403).json({ error: 'Forbidden' });
  const messages = await db.all(
    `SELECT tm.*, u.avatar_color FROM ticket_messages tm
     LEFT JOIN users u ON u.id = tm.author_id
     WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC, tm.id ASC`, [id]);
  res.json({ ticket, messages });
});

// Post a reply on a ticket.
app.post('/api/tickets/reply', async (req, res) => {
  const user = await requireRole(req, res, ['student', 'advisor', 'manager', 'superadmin']); if (!user) return;
  const { ticket_id, message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
  const ticket = await getTicketWithContext(ticket_id);
  if (!(await canAccessTicket(user, ticket))) return res.status(403).json({ error: 'Forbidden' });

  await db.run(
    "INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body) VALUES (?,?,?,?,?)",
    [ticket_id, user.id, user.name, user.role, message.trim()]
  );
  // A staff reply on a resolved/closed ticket reopens it for the student.
  if (user.role !== 'student' && (ticket.status === 'resolved' || ticket.status === 'closed')) {
    await db.run("UPDATE tickets SET status='open' WHERE id=?", [ticket_id]);
  } else {
    await db.run("UPDATE tickets SET updated_at=NOW() WHERE id=?", [ticket_id]);
  }
  auditLog(user.id, 'reply_ticket', 'ticket', ticket_id);

  // Notify the "other side": student replies → advisor/manager; staff reply → student.
  const notifyEmails = [];
  if (user.role === 'student') {
    const target = ticket.assigned_manager_id || ticket.assigned_advisor_id;
    if (target) notifyEmails.push(await db.get("SELECT name,email FROM users WHERE id=? AND status!='inactive'", [target]));
  } else {
    notifyEmails.push(await db.get("SELECT name,email FROM users WHERE id=? AND status!='inactive'", [ticket.student_id]));
  }
  for (const rec of notifyEmails.filter((x) => x && x.email)) {
    await sendEmail(rec.email, `Re: Support Ticket #${ticket_id}: ${ticket.subject}`,
      ticketEmailHtml('New Reply on Your Ticket', `Hello <strong>${rec.name}</strong>, ${user.name} replied to ticket #${ticket_id}.`, ticket));
  }
  res.json({ message: 'Reply posted' });
});

// Advisor (or superadmin) escalates a ticket to the student's team manager.
app.post('/api/tickets/escalate', async (req, res) => {
  const user = await requireRole(req, res, ['advisor', 'superadmin']); if (!user) return;
  const { ticket_id, note } = req.body || {};
  const ticket = await getTicketWithContext(ticket_id);
  if (!(await canAccessTicket(user, ticket))) return res.status(403).json({ error: 'Forbidden' });
  if (ticket.escalated) return res.status(400).json({ error: 'Ticket is already escalated' });

  // Resolve the manager from the student's team.
  let managerId = null;
  if (ticket.student_team_id) {
    const team = await db.get("SELECT manager_id FROM teams WHERE id=?", [ticket.student_team_id]);
    managerId = team ? team.manager_id : null;
  }
  if (!managerId) return res.status(400).json({ error: 'No team manager is set for this student. Ask the superadmin to assign one.' });

  await db.run(
    "UPDATE tickets SET assigned_manager_id=?, escalated=1, escalated_at=NOW(), status='escalated' WHERE id=?",
    [managerId, ticket_id]
  );
  await db.run(
    "INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body, is_system) VALUES (?,?,?,?,?,1)",
    [ticket_id, user.id, user.name, user.role, `Escalated to manager${note && note.trim() ? `: ${note.trim()}` : '.'}`]
  );
  auditLog(user.id, 'escalate_ticket', 'ticket', ticket_id);

  const manager = await db.get("SELECT name,email FROM users WHERE id=? AND status!='inactive'", [managerId]);
  if (manager && manager.email) {
    const t = { ...ticket, status: 'escalated' };
    await sendEmail(manager.email, `Escalated Ticket #${ticket_id}: ${ticket.subject}`,
      ticketEmailHtml('Ticket Escalated to You', `Hello <strong>${manager.name}</strong>, ${user.name} escalated ticket #${ticket_id} (raised by ${ticket.student_name}).`, t));
  }
  res.json({ message: 'Ticket escalated', manager_id: managerId });
});

// Change ticket status (resolve / close / reopen) — staff only.
app.post('/api/tickets/status', async (req, res) => {
  const user = await requireRole(req, res, ['advisor', 'manager', 'superadmin']); if (!user) return;
  const { ticket_id, status } = req.body || {};
  if (!['open', 'resolved', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const ticket = await getTicketWithContext(ticket_id);
  if (!(await canAccessTicket(user, ticket))) return res.status(403).json({ error: 'Forbidden' });

  await db.run("UPDATE tickets SET status=? WHERE id=?", [status, ticket_id]);
  const label = status === 'open' ? 'reopened' : status;
  await db.run(
    "INSERT INTO ticket_messages (ticket_id, author_id, author_name, author_role, body, is_system) VALUES (?,?,?,?,?,1)",
    [ticket_id, user.id, user.name, user.role, `Marked ticket as ${label}.`]
  );
  auditLog(user.id, 'ticket_status', 'ticket', ticket_id, status);
  res.json({ message: `Ticket ${label}` });
});

// ============================================================
// Teams, manual assignment & ratings
// ============================================================

// Team ids a manager owns (helper used for scoping).
async function managerTeamIds(managerId) {
  return (await db.all("SELECT id FROM teams WHERE manager_id=?", [managerId])).map((t) => t.id);
}

// Resolve a student's three rateable people: manager (via team), advisor, tutor.
async function resolveStudentTeam(student) {
  const out = { manager: null, advisor: null, tutor: null };
  const pick = (u) => (u ? { id: u.id, name: u.name, role: u.role, avatar_color: u.avatar_color } : null);
  if (student.advisor_id) out.advisor = pick(await db.get("SELECT id,name,role,avatar_color FROM users WHERE id=?", [student.advisor_id]));
  if (student.assigned_tutor_id) out.tutor = pick(await db.get("SELECT id,name,role,avatar_color FROM users WHERE id=?", [student.assigned_tutor_id]));
  if (student.team_id) {
    const team = await db.get("SELECT manager_id FROM teams WHERE id=?", [student.team_id]);
    if (team && team.manager_id) out.manager = pick(await db.get("SELECT id,name,role,avatar_color FROM users WHERE id=?", [team.manager_id]));
  }
  return out;
}

// --- Teams CRUD ---
app.get('/api/teams', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin', 'manager']); if (!user) return;
  const where = user.role === 'manager' ? 'WHERE t.manager_id=?' : '';
  const params = user.role === 'manager' ? [user.id] : [];
  const teams = await db.all(
    `SELECT t.*, m.name as manager_name,
       (SELECT COUNT(*) FROM users u WHERE u.team_id=t.id AND u.role='advisor') as advisors,
       (SELECT COUNT(*) FROM users u WHERE u.team_id=t.id AND u.role='tutor') as tutors,
       (SELECT COUNT(*) FROM users u WHERE u.team_id=t.id AND u.role='student') as students
     FROM teams t LEFT JOIN users m ON m.id=t.manager_id ${where} ORDER BY t.name`, params);
  res.json(teams);
});

app.post('/api/teams', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { name, manager_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Team name required' });
  const r = await db.run("INSERT INTO teams (name, manager_id) VALUES (?,?)", [name.trim(), manager_id || null]);
  auditLog(user.id, 'create_team', 'team', r.lastInsertRowid, `Created team ${name}`);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Team created' });
});

app.put('/api/teams', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { id, ...fields } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Team ID required' });
  const allowed = ['name', 'manager_id', 'status'];
  const sets = []; const vals = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k] === '' ? null : fields[k]); } }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  await db.run(`UPDATE teams SET ${sets.join(',')} WHERE id=?`, vals);
  auditLog(user.id, 'update_team', 'team', id);
  res.json({ message: 'Team updated' });
});

app.delete('/api/teams', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Team ID required' });
  await db.tx(async (t) => {
    // Detach members and clear student assignments tied to this team.
    await t.run("UPDATE users SET team_id=NULL WHERE team_id=?", [id]);
    await t.run("DELETE FROM teams WHERE id=?", [id]);
  });
  auditLog(user.id, 'delete_team', 'team', id);
  res.json({ message: 'Team deleted' });
});

// --- Assignment: set a student's team / advisor / tutor ---
app.post('/api/assignments', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin', 'manager']); if (!user) return;
  const { student_id, team_id, advisor_id, assigned_tutor_id } = req.body || {};
  if (!student_id) return res.status(400).json({ error: 'student_id required' });
  const student = await db.get("SELECT id, role, team_id FROM users WHERE id=?", [student_id]);
  if (!student || student.role !== 'student') return res.status(404).json({ error: 'Student not found' });

  // Managers may only touch their own team's students, and may only assign
  // advisors/tutors that belong to one of their teams.
  if (user.role === 'manager') {
    const myTeams = await managerTeamIds(user.id);
    if (!myTeams.includes(student.team_id)) return res.status(403).json({ error: 'Student is not in your team' });
    for (const [field, val] of [['advisor', advisor_id], ['tutor', assigned_tutor_id]]) {
      if (val) {
        const u = await db.get("SELECT team_id, role FROM users WHERE id=?", [val]);
        if (!u || !myTeams.includes(u.team_id)) return res.status(400).json({ error: `Selected ${field} is not in your team` });
      }
    }
  }

  const sets = []; const vals = [];
  if (team_id !== undefined) { sets.push('team_id=?'); vals.push(team_id || null); }
  if (advisor_id !== undefined) { sets.push('advisor_id=?'); vals.push(advisor_id || null); }
  if (assigned_tutor_id !== undefined) { sets.push('assigned_tutor_id=?'); vals.push(assigned_tutor_id || null); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to assign' });
  vals.push(student_id);
  await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
  auditLog(user.id, 'assign_student', 'user', student_id, 'Updated team/advisor/tutor assignment');
  res.json({ message: 'Assignment saved' });
});

// --- Ratings ---
// Student view: their three people + their current rating of each.
app.get('/api/my-team', async (req, res) => {
  const user = await requireRole(req, res, ['student']); if (!user) return;
  const student = await db.get("SELECT id, team_id, advisor_id, assigned_tutor_id FROM users WHERE id=?", [user.id]);
  const people = await resolveStudentTeam(student);
  const mine = await db.all("SELECT ratee_id, stars, comment FROM ratings WHERE student_id=?", [user.id]);
  const byId = Object.fromEntries(mine.map((r) => [r.ratee_id, { stars: r.stars, comment: r.comment }]));
  const attach = (p) => (p ? { ...p, my_rating: byId[p.id] || null } : null);
  res.json({ manager: attach(people.manager), advisor: attach(people.advisor), tutor: attach(people.tutor) });
});

// Student submits/updates a rating (re-ratable; one live row per pair).
app.post('/api/ratings', async (req, res) => {
  const user = await requireRole(req, res, ['student']); if (!user) return;
  const { ratee_id, ratee_role, stars, comment } = req.body || {};
  const s = parseInt(stars);
  if (!ratee_id || !(s >= 1 && s <= 5)) return res.status(400).json({ error: 'ratee_id and stars (1-5) required' });
  // Only allow rating one of the student's resolved manager/advisor/tutor.
  const student = await db.get("SELECT id, team_id, advisor_id, assigned_tutor_id FROM users WHERE id=?", [user.id]);
  const people = await resolveStudentTeam(student);
  const allowedIds = [people.manager, people.advisor, people.tutor].filter(Boolean).map((p) => p.id);
  if (!allowedIds.includes(ratee_id)) return res.status(403).json({ error: 'You can only rate your assigned manager, advisor or tutor' });
  const role = ['manager', 'advisor', 'tutor'].includes(ratee_role) ? ratee_role : '';
  await db.run(
    `INSERT INTO ratings (student_id, ratee_id, ratee_role, stars, comment) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE stars=VALUES(stars), comment=VALUES(comment), ratee_role=VALUES(ratee_role)`,
    [user.id, ratee_id, role, s, comment || '']
  );
  auditLog(user.id, 'submit_rating', 'user', ratee_id, `${s}★`);
  res.json({ message: 'Rating saved' });
});

// Aggregated ratings — superadmin sees all; manager sees their team's people.
app.get('/api/ratings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin', 'manager']); if (!user) return;
  let scope = '';
  let params = [];
  if (user.role === 'manager') {
    const myTeams = await managerTeamIds(user.id);
    const tids = myTeams.length ? myTeams : [0];
    const inClause = tids.map(() => '?').join(',');
    // The manager themself + advisors/tutors in their teams.
    scope = `AND (u.id=? OR u.team_id IN (${inClause}))`;
    params = [user.id, ...tids];
  }
  const rows = await db.all(
    `SELECT u.id, u.name, u.role, u.avatar_color,
        ROUND(AVG(r.stars),2) as avg_stars, COUNT(r.id) as rating_count
     FROM ratings r JOIN users u ON u.id=r.ratee_id
     WHERE 1=1 ${scope}
     GROUP BY u.id ORDER BY avg_stars DESC`, params);
  // Per-person detail (each student's rating).
  const detail = await db.all(
    `SELECT r.ratee_id, r.stars, r.comment, r.updated_at, s.name as student_name
     FROM ratings r JOIN users u ON u.id=r.ratee_id JOIN users s ON s.id=r.student_id
     WHERE 1=1 ${scope} ORDER BY r.updated_at DESC`, params);
  res.json({ people: rows, detail });
});

// ============================================================
// Database export / import (MySQL)
// ============================================================
// Render a value as a SQL literal for the dump.
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// Export as a plain-text .sql dump (schema + INSERT statements), MySQL dialect.
app.get('/api/export-sql', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tijuspro-backup-${stamp}.sql"`);
  try {
    res.write('SET FOREIGN_KEY_CHECKS=0;\n');
    const tables = (await db.all(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'"
    )).map((r) => r.t);
    for (const t of tables) {
      const created = await db.get(`SHOW CREATE TABLE \`${t}\``);
      const createSql = created['Create Table'] || created['CREATE TABLE'];
      res.write(`DROP TABLE IF EXISTS \`${t}\`;\n${createSql};\n`);
      const rows = await db.all(`SELECT * FROM \`${t}\``);
      for (const row of rows) {
        const cols = Object.keys(row);
        const colList = cols.map((c) => `\`${c}\``).join(', ');
        const vals = cols.map((c) => sqlLiteral(row[c])).join(', ');
        res.write(`INSERT INTO \`${t}\` (${colList}) VALUES (${vals});\n`);
      }
    }
    res.write('SET FOREIGN_KEY_CHECKS=1;\n');
    auditLog(user.id, 'export_sql', 'app_settings', 1, 'Exported database as SQL');
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate SQL dump' });
    else res.end(`\n-- ERROR: ${err.message}\n`);
  }
});

// Import a database from a .sql dump (executes it). Superadmin only.
// NOTE: there is no automatic backup — take a dump (Export SQL) first.
app.post('/api/import-db', upload.single('database'), async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']);
  if (!user) { if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} } return; }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field "database")' });

  const tmpPath = req.file.path;
  const cleanup = () => { try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {} };

  try {
    const sql = fs.readFileSync(tmpPath, 'utf8');
    if (!sql.trim()) throw new Error('the uploaded file is empty');
    if (sql.includes(' ')) throw new Error('this looks like a binary file — upload a .sql dump');
    await db.exec(sql);
    const hasUsers = await db.get("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'");
    if (!hasUsers) throw new Error('the SQL dump produced no "users" table');
    // Make sure migrations/seeds are applied so older dumps come up to date.
    await db.initSchema();
    auditLog(user.id, 'import_db', 'app_settings', 1, `Imported database from ${req.file.originalname}`);
    cleanup();
    res.json({ message: 'Database imported successfully. Existing accounts were replaced — you may need to log in again.' });
  } catch (err) {
    cleanup();
    res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// ============================================================
// LiveKit (large webinar sessions)
// ============================================================
const PUBLISHER_ROLES = ['tutor', 'advisor', 'manager', 'superadmin'];

// Shared access check: can this user be in this session at all?
async function canAccessSession(user, sessionId) {
  const sess = await db.get("SELECT s.*, c.name as course_name FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.session_id=?", [sessionId]);
  if (!sess) return { ok: false, status: 404, error: 'Session not found' };
  const isTestCall = await db.get("SELECT 1 FROM courses WHERE id=? AND name='__test_call__'", [sess.course_id]);
  if (!isTestCall && user.role === 'student') {
    const enrolled = await db.get("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?", [user.id, sess.course_id]);
    // A student who booked this session (1-on-1 slot) gets in without enrollment.
    const booked = enrolled ? null : await db.get("SELECT 1 FROM availability_slots WHERE session_id=? AND booked_by=?", [sessionId, user.id]);
    if (!enrolled && !booked) return { ok: false, status: 403, error: 'Not enrolled' };
  }
  return { ok: true, sess };
}

// Issue a LiveKit access token for a session.
app.get('/api/livekit/token', async (req, res) => {
  const user = await requireAuth(req, res); if (!user) return;
  if (!livekitConfigured()) return res.status(503).json({ error: 'LiveKit not configured on the server' });
  const sessionId = parseInt(req.query.session_id);
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  const access = await canAccessSession(user, sessionId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const isHost = PUBLISHER_ROLES.includes(user.role);
  const canPublish = true;
  try {
    const { AccessToken, RoomServiceClient } = await getLiveKit();
    try {
      const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
      await svc.createRoom({ name: livekitRoomName(sessionId), emptyTimeout: 8 * 60 });
    } catch { /* room already exists */ }
    const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity: String(user.id),
      name: user.name,
      metadata: JSON.stringify({ role: user.role, name: user.name }),
    });
    at.addGrant({
      roomJoin: true,
      room: livekitRoomName(sessionId),
      canPublish,
      canSubscribe: true,
      canPublishData: true,         // raise-hand / chat signalling
      roomAdmin: isHost,
    });
    const token = await at.toJwt();
    res.json({ url: livekit.url, token, can_publish: canPublish, identity: String(user.id), room: livekitRoomName(sessionId) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to mint LiveKit token' });
  }
});

// Promote/demote a participant (tutor → student stage access).
app.post('/api/livekit/update-permission', async (req, res) => {
  const user = await requireRole(req, res, PUBLISHER_ROLES); if (!user) return;
  if (!livekitConfigured()) return res.status(503).json({ error: 'LiveKit not configured on the server' });
  const { session_id, identity, can_publish } = req.body;
  if (!session_id || !identity) return res.status(400).json({ error: 'session_id and identity required' });
  const sess = await db.get("SELECT tutor_id FROM sessions WHERE session_id=?", [session_id]);
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  if (user.role === 'tutor' && sess.tutor_id !== user.id) {
    return res.status(403).json({ error: 'Not your session' });
  }
  try {
    const { RoomServiceClient } = await getLiveKit();
    const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
    await svc.updateParticipant(livekitRoomName(session_id), String(identity), undefined, {
      canPublish: !!can_publish,
      canSubscribe: true,
      canPublishData: true,
    });
    res.json({ message: can_publish ? 'Promoted to stage' : 'Removed from stage', identity: String(identity), can_publish: !!can_publish });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update participant' });
  }
});

// Live LiveKit connection status — verifies the active credentials by hitting
// the server (listRooms). Feeds the "existing connection" panel in Settings.
app.get('/api/livekit/status', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const base = {
    configured: livekitConfigured(),
    source: livekit.source,
    url: livekit.url || '',
    api_key: livekit.apiKey || '',
    has_secret: !!livekit.apiSecret,
  };
  if (!livekitConfigured()) return res.json({ ...base, connected: false });
  try {
    const { RoomServiceClient } = await getLiveKit();
    const svc = new RoomServiceClient(livekitHttpUrl(), livekit.apiKey, livekit.apiSecret);
    const rooms = await svc.listRooms();
    res.json({ ...base, connected: true, active_rooms: Array.isArray(rooms) ? rooms.length : 0 });
  } catch (err) {
    res.json({ ...base, connected: false, error: err.message || 'Could not reach LiveKit server' });
  }
});

// Remove the LiveKit server stored in the DB, reverting to the .env credentials
// (or none). Does not touch env vars.
app.delete('/api/livekit/server', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  await db.run("UPDATE app_settings SET livekit_url='', livekit_api_key='', livekit_api_secret='' WHERE id=1");
  await loadLivekitCreds();
  // If LiveKit was the active provider but is no longer configured, fall back to
  // WebRTC so live sessions keep working.
  if (!livekitConfigured()) {
    const cur = await db.get("SELECT video_provider FROM app_settings WHERE id=1");
    if (cur && cur.video_provider === 'livekit') {
      await db.run("UPDATE app_settings SET video_provider='webrtc' WHERE id=1");
    }
  }
  auditLog(user.id, 'remove_livekit_server', 'app_settings', 1);
  res.json({ message: 'Stored LiveKit server removed', livekit_source: livekit.source, livekit_configured: livekitConfigured() });
});

// Estimated video data transfer, derived from our own attendance logs.
const EST_MBPS_PER_PARTICIPANT = 2;            // ~2 Mbps up+down combined, typical
const EST_MB_PER_MINUTE = (EST_MBPS_PER_PARTICIPANT / 8) * 60; // = 15 MB/min
app.get('/api/livekit/usage', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  // Participant-minutes, computed in JS over the attendance logs (closed logs
  // use leave_time; ongoing ones count up to now).
  const logs = await db.all("SELECT session_id, join_time, leave_time FROM attendance_logs");
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowStats = (since) => {
    const sessions = new Set();
    let participants = 0, minutes = 0;
    for (const l of logs) {
      const jt = new Date(l.join_time);
      if (!(jt >= since)) continue;
      participants++;
      sessions.add(l.session_id);
      const end = l.leave_time ? new Date(l.leave_time) : now;
      const m = (end - jt) / 60000;
      if (Number.isFinite(m) && m > 0) minutes += m;
    }
    return { sessions: sessions.size, participants, minutes };
  };
  const shape = (s) => {
    const minutes = Math.max(0, Math.round(s.minutes));
    return {
      sessions: s.sessions,
      participants: s.participants,
      minutes,
      est_gb: +(minutes * EST_MB_PER_MINUTE / 1024).toFixed(2),
    };
  };
  res.json({
    configured: livekitConfigured(),
    assumed_mbps: EST_MBPS_PER_PARTICIPANT,
    today: shape(windowStats(startOfDay)),
    month: shape(windowStats(startOfMonth)),
  });
});

// ============================================================
// SMTP Settings
// ============================================================
app.get('/api/smtp-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const smtp = await db.get("SELECT host, port, `user`, pass, from_email, provider, resend_api_key, resend_monthly_cap, resend_quota_used, resend_quota_at FROM smtp_settings WHERE id=1");
  res.json(smtp || { host: '', port: 587, user: '', pass: '', from_email: '', provider: 'smtp', resend_api_key: '', resend_monthly_cap: 0, resend_quota_used: '', resend_quota_at: null });
});

app.post('/api/smtp-settings', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { host, port, user: smtpUser, pass, from_email, provider, resend_api_key, resend_monthly_cap } = req.body;
  // Note: resend_quota_used/resend_quota_at are written only by sendEmail (from
  // Resend's response header) and deliberately left out here so saving settings
  // never clobbers the cached usage figure.
  await db.run(`INSERT INTO smtp_settings (id, host, port, \`user\`, pass, from_email, provider, resend_api_key, resend_monthly_cap) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE host=VALUES(host), port=VALUES(port), \`user\`=VALUES(\`user\`), pass=VALUES(pass), from_email=VALUES(from_email), provider=VALUES(provider), resend_api_key=VALUES(resend_api_key), resend_monthly_cap=VALUES(resend_monthly_cap)`,
    [host || '', port || 587, smtpUser || '', pass || '', from_email || '', provider || 'smtp', resend_api_key || '', parseInt(resend_monthly_cap) || 0]);
  auditLog(user.id, 'update_smtp_settings', 'settings', 1);
  res.json({ message: 'SMTP settings saved' });
});

app.post('/api/smtp-test', async (req, res) => {
  const user = await requireRole(req, res, ['superadmin']); if (!user) return;
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });
  const result = await sendEmail(to, 'Test Email - Tiju\'s Academy',
    '<h2>SMTP Test</h2><p>If you received this email, your SMTP configuration is working correctly.</p><p>— Tiju\'s Academy LMS</p>');
  if (result.sent) {
    res.json({ message: `Test email sent to ${to}` });
  } else {
    res.status(400).json({ error: `Failed to send: ${result.reason}` });
  }
});

// Password reset
app.post('/api/request-password-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const u = await db.get("SELECT id, name FROM users WHERE email=?", [email]);
  if (!u) return res.json({ message: 'If the email exists, a reset link has been sent' });
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString();
  await db.run("INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)", [u.id, token, expires]);
  const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
  const emailResult = await sendEmail(email, "Password Reset - Tiju's Academy",
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#4F46E5">Password Reset</h2>
      <p>Hello <strong>${u.name}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to set a new password:</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
      <p style="color:#888;font-size:14px">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
      <p style="color:#aaa;font-size:12px">Tiju's Academy LMS</p>
    </div>`
  );
  const response = { message: 'If the email exists, a reset link has been sent' };
  if (!emailResult.sent) {
    response.dev_token = token;
    response.dev_note = 'SMTP not configured — use this token directly';
  }
  res.json(response);
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
  const reset = await db.get("SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at>?", [token, nowStr()]);
  if (!reset) return res.status(400).json({ error: 'Invalid or expired token' });
  await db.run("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?", [bcrypt.hashSync(password, 10), reset.user_id]);
  await db.run("UPDATE password_resets SET used=1 WHERE id=?", [reset.id]);
  auditLog(reset.user_id, 'password_reset', 'user', reset.user_id);
  res.json({ message: 'Password reset successfully' });
});

// Upload recording
app.post('/api/upload-recording', upload.single('recording'), async (req, res) => {
  const user = await requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const sessionId = parseInt(req.body.session_id);
  if (!sessionId || !req.file) return res.status(400).json({ error: 'Session ID and file required' });
  // Reject empty captures — they'd create an unplayable record that just shows
  // up as "Missing"/0 bytes in the recordings list.
  if (!req.file.size) {
    try { fs.unlinkSync(req.file.path); } catch { /* temp already gone */ }
    return res.status(400).json({ error: 'Recording was empty (0 bytes) and was not saved.' });
  }
  const ext = path.extname(req.file.originalname) || '.webm';
  const filename = `recording-${sessionId}-${Date.now()}${ext}`;
  const dest = path.join(UPLOAD_DIR, filename);
  fs.renameSync(req.file.path, dest);
  const r = await db.run("INSERT INTO meeting_records (session_id,file_path,playback_url) VALUES (?,?,?)", [sessionId, dest, `/uploads/recordings/${filename}`]);
  auditLog(user.id, 'upload_recording', 'meeting_record', r.lastInsertRowid);
  console.log(`[recording] saved ${filename} (${(req.file.size / 1048576).toFixed(1)} MB) for session ${sessionId}`);
  res.status(201).json({ message: 'Uploaded', playback_url: `/uploads/recordings/${filename}` });
});

// Any unmatched /api or /uploads request must return JSON, never the SPA's HTML
// — otherwise the client does JSON.parse('<!DOCTYPE ...') and throws "Unexpected
// token '<'". This guard runs after all real routes are registered, so it only
// catches paths that matched nothing above.
app.use(['/api', '/uploads'], (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
});

// ============================================================
// Serve frontend in production
// ============================================================
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ============================================================
// Start — initialise the database (schema + seeds) before listening.
// ============================================================
db.initSchema()
  .then(() => loadLivekitCreds())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`TijusPro LMS running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
