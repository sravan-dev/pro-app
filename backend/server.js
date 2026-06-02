// TijusPro LMS - Node.js Backend (Express + better-sqlite3)
require('dotenv').config(); // load .env (LiveKit creds, secrets) into process.env
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 8000;
const DB_PATH = path.join(__dirname, 'tijuspro.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'recordings');
const MATERIALS_DIR = path.join(__dirname, 'uploads', 'materials');
const AVATARS_DIR = path.join(__dirname, 'uploads', 'avatars');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

// LiveKit (SFU) — used for large webinar-style sessions (50-100+ participants).
// Credentials live in env, NOT the database. Get them from a LiveKit Cloud
// project (https://cloud.livekit.io) or a self-hosted server.
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';            // wss://your-project.livekit.cloud
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const livekitConfigured = () => !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
// livekit-server-sdk v2 is ESM-only; load it lazily via dynamic import so this
// CommonJS file keeps working even when the package isn't installed.
let _livekitSdk = null;
async function getLiveKit() {
  if (!_livekitSdk) _livekitSdk = await import('livekit-server-sdk');
  return _livekitSdk;
}
const livekitRoomName = (sessionId) => `session-${sessionId}`;
const livekitHttpUrl = () => LIVEKIT_URL.replace(/^ws/, 'http');

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
  cookie: {
    maxAge: 86400000,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Serve uploaded files
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MATERIALS_DIR)) fs.mkdirSync(MATERIALS_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
// Database
// ============================================================
let db;

function getDB() {
  if (db) return db;
  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  if (isNew) initDB();
  // Ensure smtp_settings table exists for existing databases
  db.exec(`CREATE TABLE IF NOT EXISTS smtp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT, port INTEGER DEFAULT 587, user TEXT, pass TEXT, from_email TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS course_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT NOT NULL CHECK(type IN ('file','link')),
    file_path TEXT DEFAULT '',
    url TEXT DEFAULT '',
    original_name TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_enabled INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS course_material_managers (
    course_id INTEGER NOT NULL REFERENCES courses(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    assigned_by INTEGER REFERENCES users(id),
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (course_id, user_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_materials_course ON course_materials(course_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mat_managers_user ON course_material_managers(user_id)`);
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    currency TEXT DEFAULT 'INR'
  )`);
  db.prepare("INSERT OR IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')").run();
  // Video/meeting provider settings on app_settings
  const appCols = db.prepare("PRAGMA table_info(app_settings)").all().map((c) => c.name);
  if (!appCols.includes('video_provider')) {
    db.exec("ALTER TABLE app_settings ADD COLUMN video_provider TEXT DEFAULT 'livekit'");
  }
  if (!appCols.includes('zoom_account_id')) {
    db.exec("ALTER TABLE app_settings ADD COLUMN zoom_account_id TEXT DEFAULT ''");
  }
  if (!appCols.includes('zoom_client_id')) {
    db.exec("ALTER TABLE app_settings ADD COLUMN zoom_client_id TEXT DEFAULT ''");
  }
  if (!appCols.includes('zoom_client_secret')) {
    db.exec("ALTER TABLE app_settings ADD COLUMN zoom_client_secret TEXT DEFAULT ''");
  }
  // Add payout columns to users if missing
  const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!userCols.includes('payout_rate')) {
    db.exec("ALTER TABLE users ADD COLUMN payout_rate REAL DEFAULT 0");
  }
  if (!userCols.includes('payout_type')) {
    db.exec("ALTER TABLE users ADD COLUMN payout_type TEXT DEFAULT 'monthly'");
  }
  if (!userCols.includes('avatar_url')) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
  }
  const catCount = db.prepare("SELECT COUNT(*) as n FROM categories").get().n;
  if (catCount === 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
    ['Technology', 'Marketing', 'Language', 'Design'].forEach((c) => ins.run(c));
  }
  return db;
}

// ============================================================
// Email Helper
// ============================================================
async function sendEmail(to, subject, html) {
  const d = getDB();
  const smtp = d.prepare("SELECT * FROM smtp_settings WHERE id=1").get();
  if (!smtp || !smtp.host || !smtp.user) {
    console.log(`[EMAIL] SMTP not configured. Would send to ${to}: ${subject}`);
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.sendMail({
      from: smtp.from_email || smtp.user,
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

function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const insert = (sql, params) => db.prepare(sql).run(...params);

  // Seed superadmin
  const adminHash = bcrypt.hashSync('admin123', 10);
  insert(
    "INSERT OR IGNORE INTO users (name,email,portal,role,password_hash,avatar_color,must_change_password) VALUES (?,?,?,?,?,?,?)",
    ['Super Admin', 'admin@tijuspro.com', 'superadmin', 'superadmin', adminHash, '#E97A2B', 0]
  );

  // Seed tutor
  const tutorHash = bcrypt.hashSync('tutor123', 10);
  insert(
    "INSERT OR IGNORE INTO users (name,email,portal,role,password_hash,avatar_color,specialization) VALUES (?,?,?,?,?,?,?)",
    ['Rahul Sharma', 'rahul@tijuspro.com', 'tutor', 'tutor', tutorHash, '#2563EB', 'Web Development']
  );

  // Seed student
  const studentHash = bcrypt.hashSync('student123', 10);
  insert(
    "INSERT OR IGNORE INTO users (name,email,portal,role,password_hash,avatar_color) VALUES (?,?,?,?,?,?)",
    ['Aarav Mehta', 'aarav.mehta@student.tijuspro.com', 'student', 'student', studentHash, '#3B82F6']
  );

  // Seed manager
  const mgrHash = bcrypt.hashSync('manager123', 10);
  insert(
    "INSERT OR IGNORE INTO users (name,email,portal,role,password_hash,avatar_color) VALUES (?,?,?,?,?,?)",
    ['Vikram Singh', 'vikram@tijuspro.com', 'manager', 'manager', mgrHash, '#0891B2']
  );

  // Seed advisor
  const advHash = bcrypt.hashSync('advisor123', 10);
  insert(
    "INSERT OR IGNORE INTO users (name,email,portal,role,password_hash,avatar_color) VALUES (?,?,?,?,?,?)",
    ['Dr. Meena Iyer', 'meena@tijuspro.com', 'advisor', 'advisor', advHash, '#8B5CF6']
  );
}

// ============================================================
// Auth helpers
// ============================================================
function requireAuth(req, res) {
  if (!req.session.userId) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const user = getDB().prepare("SELECT id,name,email,portal,role,specialization,status,avatar_color,avatar_url,must_change_password FROM users WHERE id=?").get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); res.status(401).json({ error: 'User not found' }); return null; }
  return user;
}

function requireRole(req, res, roles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return user;
}

function auditLog(userId, action, targetType, targetId, details) {
  getDB().prepare("INSERT INTO audit_logs (user_id,action,target_type,target_id,details,ip_address) VALUES (?,?,?,?,?,?)").run(userId, action, targetType || null, targetId || null, details || null, '');
}

// ============================================================
// Routes
// ============================================================

// Health
app.get('/api/health', (req, res) => {
  const d = getDB();
  const count = d.prepare("SELECT COUNT(*) as c FROM users").get().c;
  res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected', users_count: count });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const d = getDB();
  const user = d.prepare("SELECT * FROM users WHERE email=?").get(email);
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
app.get('/api/auth/session', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const user = getDB().prepare("SELECT id,name,email,portal,role,specialization,status,avatar_color,avatar_url,must_change_password FROM users WHERE id=?").get(req.session.userId);
  if (!user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user });
});

// Profile avatar upload (self-service for any logged-in user)
app.post('/api/profile/avatar', (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 10 MB)' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (req.fileValidationError) return res.status(400).json({ error: req.fileValidationError });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const d = getDB();
    const prior = d.prepare("SELECT avatar_url FROM users WHERE id=?").get(u.id);
    const url = `/uploads/avatars/${req.file.filename}`;
    d.prepare("UPDATE users SET avatar_url=? WHERE id=?").run(url, u.id);
    if (prior && prior.avatar_url) {
      const abs = path.join(__dirname, prior.avatar_url.replace(/^\/+/, ''));
      try { fs.unlinkSync(abs); } catch {}
    }
    auditLog(u.id, 'update_avatar', 'user', u.id);
    res.json({ message: 'Avatar updated', avatar_url: url });
  });
});

app.delete('/api/profile/avatar', (req, res) => {
  const u = requireAuth(req, res); if (!u) return;
  const d = getDB();
  const prior = d.prepare("SELECT avatar_url FROM users WHERE id=?").get(u.id);
  d.prepare("UPDATE users SET avatar_url='' WHERE id=?").run(u.id);
  if (prior && prior.avatar_url) {
    const abs = path.join(__dirname, prior.avatar_url.replace(/^\/+/, ''));
    try { fs.unlinkSync(abs); } catch {}
  }
  auditLog(u.id, 'remove_avatar', 'user', u.id);
  res.json({ message: 'Avatar removed' });
});

// Bootstrap
app.get('/api/bootstrap', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  const data = { user, courses: [], students: [], tutors: [] };

  if (user.role === 'student') {
    data.courses = d.prepare("SELECT c.*,u.name as tutor_name,e.progress_percentage,e.grade,e.status as enrollment_status FROM courses c JOIN enrollments e ON e.course_id=c.id JOIN users u ON u.id=c.tutor_id WHERE e.student_id=?").all(user.id);
  } else if (user.role === 'tutor') {
    data.courses = d.prepare("SELECT c.* FROM courses c WHERE c.tutor_id=?").all(user.id);
    data.students = d.prepare("SELECT u.id,u.name,u.email,u.status,u.avatar_color,e.course_id,e.progress_percentage,e.grade,c.name as course_name FROM users u JOIN enrollments e ON e.student_id=u.id JOIN courses c ON c.id=e.course_id WHERE c.tutor_id=? ORDER BY u.name").all(user.id);
  } else {
    data.courses = d.prepare("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name").all();
    data.students = d.prepare("SELECT id,name,email,status,avatar_color,specialization FROM users WHERE role='student' ORDER BY name").all();
    data.tutors = d.prepare("SELECT id,name,email,status,avatar_color,specialization FROM users WHERE role='tutor' ORDER BY name").all();
  }
  res.json(data);
});

// Portal data
app.get('/api/portal-data', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  const data = {};

  switch (user.role) {
    case 'student': {
      data.courses = d.prepare("SELECT c.*,u.name as tutor_name,e.progress_percentage,e.grade,e.status as enrollment_status FROM courses c JOIN enrollments e ON e.course_id=c.id JOIN users u ON u.id=c.tutor_id WHERE e.student_id=? ORDER BY c.name").all(user.id);
      data.upcoming_sessions = d.prepare("SELECT s.*,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE s.start_time>datetime('now') AND s.status='scheduled' ORDER BY s.start_time LIMIT 20").all(user.id);
      // Sessions in the student's enrolled courses happening right now.
      data.live_sessions = d.prepare("SELECT s.*, c.name as course_name, u.name as tutor_name, (SELECT COUNT(*) FROM attendance_logs a WHERE a.session_id=s.session_id AND a.leave_time IS NULL) as active_participants FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? WHERE s.status='live' ORDER BY s.start_time DESC").all(user.id);
      data.attendance_stats = d.prepare("SELECT COUNT(*) as total_sessions, SUM(CASE WHEN a.log_id IS NOT NULL THEN 1 ELSE 0 END) as attended FROM sessions s JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? LEFT JOIN attendance_logs a ON a.session_id=s.session_id AND a.student_id=? WHERE s.status='completed'").get(user.id, user.id);
      break;
    }
    case 'tutor': {
      data.courses = d.prepare("SELECT c.* FROM courses c WHERE c.tutor_id=? ORDER BY c.name").all(user.id);
      data.students = d.prepare("SELECT DISTINCT u.id,u.name,u.email,u.status,u.avatar_color,e.course_id,e.progress_percentage,e.grade,c.name as course_name FROM users u JOIN enrollments e ON e.student_id=u.id JOIN courses c ON c.id=e.course_id WHERE c.tutor_id=? ORDER BY u.name").all(user.id);
      // A session counts as "conducted" if it was completed OR anyone actually
      // joined (attendance log exists). Sessions are never explicitly marked
      // 'completed', so relying on status alone left payouts/hours at 0.
      data.sessions = d.prepare("SELECT s.*, c.name as course_name, (s.status='completed' OR EXISTS(SELECT 1 FROM attendance_logs a WHERE a.session_id=s.session_id)) as conducted FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY s.start_time DESC LIMIT 50").all(user.id);
      data.teaching_stats = d.prepare("SELECT COUNT(*) as total_sessions, COALESCE(SUM(CAST((julianday(s.end_time)-julianday(s.start_time))*24 AS REAL)),0) as total_hours FROM sessions s WHERE s.tutor_id=? AND (s.status='completed' OR EXISTS(SELECT 1 FROM attendance_logs a WHERE a.session_id=s.session_id))").get(user.id);
      data.payout = d.prepare("SELECT payout_rate, payout_type FROM users WHERE id=?").get(user.id);
      break;
    }
    case 'advisor': {
      data.students = d.prepare("SELECT u.id,u.name,u.email,u.status,u.avatar_color, COUNT(e.enrollment_id) as enrolled_courses, ROUND(AVG(e.progress_percentage),1) as avg_progress, GROUP_CONCAT(DISTINCT e.grade) as grades FROM users u LEFT JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY u.name").all();
      data.at_risk = d.prepare("SELECT u.id,u.name,u.email,u.avatar_color, ROUND(AVG(e.progress_percentage),1) as avg_progress FROM users u JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' GROUP BY u.id HAVING avg_progress<40 ORDER BY avg_progress").all();
      data.courses = d.prepare("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id").all();
      break;
    }
    case 'manager': {
      data.stats = {
        total_students: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='student'").get().c,
        total_tutors: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='tutor'").get().c,
        total_courses: d.prepare("SELECT COUNT(*) as c FROM courses WHERE status='active'").get().c,
        total_enrollments: d.prepare("SELECT COUNT(*) as c FROM enrollments WHERE status='active'").get().c,
        total_sessions: d.prepare("SELECT COUNT(*) as c FROM sessions").get().c,
        completed_sessions: d.prepare("SELECT COUNT(*) as c FROM sessions WHERE status='completed'").get().c,
      };
      data.tutors = d.prepare("SELECT u.id,u.name,u.email,u.status,u.avatar_color,u.specialization, COUNT(DISTINCT c.id) as course_count, SUM(c.students_count) as total_students, COUNT(DISTINCT CASE WHEN s.status='completed' THEN s.session_id END) as sessions_completed FROM users u LEFT JOIN courses c ON c.tutor_id=u.id LEFT JOIN sessions s ON s.tutor_id=u.id WHERE u.role='tutor' GROUP BY u.id ORDER BY u.name").all();
      data.courses = d.prepare("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.category,c.name").all();
      data.enrollment_by_category = d.prepare("SELECT c.category, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.category ORDER BY count DESC").all();
      break;
    }
    case 'superadmin': {
      data.stats = {
        total_users: d.prepare("SELECT COUNT(*) as c FROM users").get().c,
        total_students: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='student'").get().c,
        total_tutors: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='tutor'").get().c,
        total_advisors: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='advisor'").get().c,
        total_managers: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='manager'").get().c,
        total_courses: d.prepare("SELECT COUNT(*) as c FROM courses").get().c,
        active_sessions: d.prepare("SELECT COUNT(*) as c FROM sessions WHERE status IN ('scheduled','live')").get().c,
        total_enrollments: d.prepare("SELECT COUNT(*) as c FROM enrollments").get().c,
      };
      data.users = d.prepare("SELECT id,name,email,portal,role,status,avatar_color,specialization,created_at FROM users ORDER BY created_at DESC").all();
      data.courses = d.prepare("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name").all();
      data.audit_logs = d.prepare("SELECT a.*,u.name as user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50").all();
      // Sessions happening right now (status='live'), with who's currently in.
      data.live_sessions = d.prepare("SELECT s.session_id, s.start_time, s.status, s.room_name, c.name as course_name, u.name as tutor_name, (SELECT COUNT(*) FROM attendance_logs a WHERE a.session_id=s.session_id AND a.leave_time IS NULL) as active_participants FROM sessions s JOIN courses c ON c.id=s.course_id LEFT JOIN users u ON u.id=s.tutor_id WHERE s.status='live' ORDER BY s.start_time DESC").all();
      // Dashboard charts (read-only aggregates).
      data.charts = {
        sessions_by_status: d.prepare("SELECT status, COUNT(*) as count FROM sessions GROUP BY status ORDER BY count DESC").all(),
        enrollment_by_category: d.prepare("SELECT c.category, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.category ORDER BY count DESC").all(),
        progress_distribution: d.prepare(`SELECT bucket, COUNT(*) as count FROM (
            SELECT CASE
              WHEN progress_percentage <= 25 THEN '0-25%'
              WHEN progress_percentage <= 50 THEN '26-50%'
              WHEN progress_percentage <= 75 THEN '51-75%'
              ELSE '76-100%' END as bucket
            FROM enrollments
          ) GROUP BY bucket ORDER BY bucket`).all(),
      };
      break;
    }
  }
  res.json(data);
});

// Students
app.get('/api/students', (req, res) => {
  const user = requireRole(req, res, ['tutor','advisor','manager','superadmin']); if (!user) return;
  res.json(getDB().prepare("SELECT u.id,u.name,u.email,u.status,u.avatar_color,u.created_at, COUNT(e.enrollment_id) as enrolled_courses, ROUND(AVG(e.progress_percentage),1) as avg_progress FROM users u LEFT JOIN enrollments e ON e.student_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY u.name").all());
});

// Full profile for a single student (everything related to them)
app.get('/api/students/:id', (req, res) => {
  const user = requireRole(req, res, ['tutor','advisor','manager','superadmin']); if (!user) return;
  const id = parseInt(req.params.id);
  const d = getDB();
  // A tutor may only view a student enrolled in one of their own courses.
  if (user.role === 'tutor') {
    const own = d.prepare("SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=? AND c.tutor_id=? LIMIT 1").get(id, user.id);
    if (!own) return res.status(403).json({ error: 'Not your student' });
  }
  const profile = d.prepare("SELECT id,name,email,status,avatar_color,avatar_url,created_at FROM users WHERE id=? AND role='student'").get(id);
  if (!profile) return res.status(404).json({ error: 'Student not found' });

  const enrollments = d.prepare("SELECT e.enrollment_id,e.course_id,e.progress_percentage,e.grade,e.status,e.enrollment_date,c.name as course_name,c.category,u.name as tutor_name FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN users u ON u.id=c.tutor_id WHERE e.student_id=? ORDER BY e.enrollment_date DESC").all(id);

  const sessions = d.prepare("SELECT s.session_id,s.start_time,s.end_time,s.status,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id LEFT JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? ORDER BY s.start_time DESC LIMIT 50").all(id);

  const attendance = d.prepare("SELECT a.log_id,a.session_id,a.join_time,a.leave_time,a.duration_minutes,c.name as course_name,s.start_time FROM attendance_logs a JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE a.student_id=? ORDER BY a.timestamp DESC LIMIT 100").all(id);

  const stats = {
    enrolled_courses: enrollments.length,
    avg_progress: enrollments.length ? Math.round(enrollments.reduce((s, e) => s + (e.progress_percentage || 0), 0) / enrollments.length) : 0,
    total_sessions: sessions.length,
    sessions_attended: attendance.length,
  };

  res.json({ profile, enrollments, sessions, attendance, stats });
});

// Tutors
app.get('/api/tutors', (req, res) => {
  const user = requireRole(req, res, ['manager','superadmin']); if (!user) return;
  res.json(getDB().prepare("SELECT u.id,u.name,u.email,u.status,u.avatar_color,u.specialization,u.payout_rate,u.payout_type, COUNT(DISTINCT c.id) as course_count FROM users u LEFT JOIN courses c ON c.tutor_id=u.id WHERE u.role='tutor' GROUP BY u.id ORDER BY u.name").all());
});

// Courses
app.get('/api/courses', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  res.json(getDB().prepare("SELECT c.*,u.name as tutor_name FROM courses c JOIN users u ON u.id=c.tutor_id ORDER BY c.name").all());
});

app.post('/api/courses', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { name, category, tutor_id, color, icon } = req.body;
  if (!name || !category || !tutor_id) return res.status(400).json({ error: 'Name, category, and tutor required' });
  const r = getDB().prepare("INSERT INTO courses (name,category,tutor_id,color,icon) VALUES (?,?,?,?,?)").run(name, category, tutor_id, color || '#3B82F6', icon || 'book');
  auditLog(user.id, 'create_course', 'course', r.lastInsertRowid, `Created: ${name}`);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Course created' });
});

app.put('/api/courses', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'Course ID required' });
  const allowed = ['name','category','tutor_id','color','icon','status'];
  const sets = []; const vals = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); } }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  getDB().prepare(`UPDATE courses SET ${sets.join(',')} WHERE id=?`).run(...vals);
  auditLog(user.id, 'update_course', 'course', id);
  res.json({ message: 'Course updated' });
});

app.delete('/api/courses', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Course ID required' });
  const permanent = req.query.permanent === 'true';
  const d = getDB();
  if (permanent) {
    try {
      d.transaction(() => {
        const sids = d.prepare("SELECT session_id FROM sessions WHERE course_id=?").all(id).map(s => s.session_id);
        for (const sid of sids) {
          d.prepare("DELETE FROM attendance_logs WHERE session_id=?").run(sid);
          d.prepare("DELETE FROM meeting_records WHERE session_id=?").run(sid);
          d.prepare("DELETE FROM signaling WHERE session_id=?").run(sid);
        }
        d.prepare("DELETE FROM sessions WHERE course_id=?").run(id);
        d.prepare("DELETE FROM enrollments WHERE course_id=?").run(id);
        d.prepare("DELETE FROM courses WHERE id=?").run(id);
      })();
      auditLog(user.id, 'delete_course', 'course', id);
      res.json({ message: 'Course permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete course: ' + err.message });
    }
  } else {
    d.prepare("UPDATE courses SET status='archived' WHERE id=?").run(id);
    auditLog(user.id, 'archive_course', 'course', id);
    res.json({ message: 'Course archived' });
  }
});

// Categories
app.get('/api/categories', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  res.json(getDB().prepare("SELECT id,name FROM categories ORDER BY name").all());
});

app.post('/api/categories', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = getDB().prepare("INSERT INTO categories (name) VALUES (?)").run(name);
    auditLog(user.id, 'create_category', 'category', r.lastInsertRowid, `Created: ${name}`);
    res.status(201).json({ id: r.lastInsertRowid, name });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const { id, name } = req.body;
  const newName = (name || '').trim();
  if (!id || !newName) return res.status(400).json({ error: 'ID and name required' });
  const d = getDB();
  const cat = d.prepare("SELECT name FROM categories WHERE id=?").get(id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  if (cat.name === newName) return res.json({ message: 'No change' });
  try {
    d.transaction(() => {
      d.prepare("UPDATE categories SET name=? WHERE id=?").run(newName, id);
      d.prepare("UPDATE courses SET category=? WHERE category=?").run(newName, cat.name);
    })();
    auditLog(user.id, 'update_category', 'category', id, `Renamed: ${cat.name} -> ${newName}`);
    res.json({ message: 'Category updated' });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'Category name already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Category ID required' });
  const d = getDB();
  const cat = d.prepare("SELECT name FROM categories WHERE id=?").get(id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const inUse = d.prepare("SELECT COUNT(*) as n FROM courses WHERE category=?").get(cat.name).n;
  if (inUse > 0) return res.status(400).json({ error: `Category in use by ${inUse} course(s)` });
  d.prepare("DELETE FROM categories WHERE id=?").run(id);
  auditLog(user.id, 'delete_category', 'category', id, `Deleted: ${cat.name}`);
  res.json({ message: 'Category deleted' });
});

// ============================================================
// Course Materials
// ============================================================
function canManageMaterials(user, courseId) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const row = getDB().prepare("SELECT 1 FROM course_material_managers WHERE course_id=? AND user_id=?").get(courseId, user.id);
  return !!row;
}

// List materials for a course
app.get('/api/course-materials', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  const d = getDB();
  const canManage = canManageMaterials(user, courseId);
  let rows;
  if (canManage) {
    rows = d.prepare("SELECT m.*, u.name as created_by_name FROM course_materials m LEFT JOIN users u ON u.id=m.created_by WHERE m.course_id=? ORDER BY m.sort_order, m.created_at DESC").all(courseId);
  } else {
    // Students & non-managers see enabled only; must be enrolled (students) or any auth user otherwise
    if (user.role === 'student') {
      const enrolled = d.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? AND status='active'").get(user.id, courseId);
      if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
    }
    rows = d.prepare("SELECT id, course_id, title, description, type, file_path, url, original_name, sort_order, created_at FROM course_materials WHERE course_id=? AND is_enabled=1 ORDER BY sort_order, created_at DESC").all(courseId);
  }
  res.json({ can_manage: canManage, materials: rows });
});

// Create material — file upload or link
app.post('/api/course-materials', materialUpload.single('file'), (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const courseId = parseInt(req.body.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  if (!canManageMaterials(user, courseId)) return res.status(403).json({ error: 'Not authorized to manage materials for this course' });
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
  const r = getDB().prepare(
    "INSERT INTO course_materials (course_id, title, description, type, file_path, url, original_name, created_by) VALUES (?,?,?,?,?,?,?,?)"
  ).run(courseId, title, description, type, filePath, url, originalName, user.id);
  auditLog(user.id, 'create_material', 'course_material', r.lastInsertRowid, `Course ${courseId}: ${title}`);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Material added' });
});

// Update material (title/description/is_enabled/sort_order)
app.put('/api/course-materials', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const d = getDB();
  const mat = d.prepare("SELECT course_id FROM course_materials WHERE id=?").get(id);
  if (!mat) return res.status(404).json({ error: 'Material not found' });
  if (!canManageMaterials(user, mat.course_id)) return res.status(403).json({ error: 'Not authorized' });
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
  d.prepare(`UPDATE course_materials SET ${sets.join(',')} WHERE id=?`).run(...vals);
  auditLog(user.id, 'update_material', 'course_material', id);
  res.json({ message: 'Material updated' });
});

// Delete material
app.delete('/api/course-materials', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const d = getDB();
  const mat = d.prepare("SELECT * FROM course_materials WHERE id=?").get(id);
  if (!mat) return res.status(404).json({ error: 'Material not found' });
  if (!canManageMaterials(user, mat.course_id)) return res.status(403).json({ error: 'Not authorized' });
  d.prepare("DELETE FROM course_materials WHERE id=?").run(id);
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
app.get('/api/course-material-managers', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  if (!courseId) return res.status(400).json({ error: 'course_id required' });
  const rows = getDB().prepare(
    "SELECT mm.user_id, u.name, u.email, u.role, mm.assigned_at FROM course_material_managers mm JOIN users u ON u.id=mm.user_id WHERE mm.course_id=? ORDER BY u.name"
  ).all(courseId);
  res.json(rows);
});

app.post('/api/course-material-managers', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const courseId = parseInt(req.body.course_id);
  const userId = parseInt(req.body.user_id);
  if (!courseId || !userId) return res.status(400).json({ error: 'course_id and user_id required' });
  const d = getDB();
  const target = d.prepare("SELECT id,role FROM users WHERE id=?").get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!['tutor','manager','advisor','superadmin'].includes(target.role)) return res.status(400).json({ error: 'User role cannot manage materials' });
  try {
    d.prepare("INSERT INTO course_material_managers (course_id,user_id,assigned_by) VALUES (?,?,?)").run(courseId, userId, user.id);
    auditLog(user.id, 'assign_material_manager', 'course', courseId, `Assigned user ${userId}`);
    res.status(201).json({ message: 'Manager assigned' });
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('PRIMARY')) return res.status(400).json({ error: 'Already assigned' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/course-material-managers', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const courseId = parseInt(req.query.course_id);
  const userId = parseInt(req.query.user_id);
  if (!courseId || !userId) return res.status(400).json({ error: 'course_id and user_id required' });
  getDB().prepare("DELETE FROM course_material_managers WHERE course_id=? AND user_id=?").run(courseId, userId);
  auditLog(user.id, 'unassign_material_manager', 'course', courseId, `Removed user ${userId}`);
  res.json({ message: 'Manager removed' });
});

// Enrollments
app.get('/api/enrollments', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  res.json(getDB().prepare("SELECT e.*,u.name as student_name,u.email as student_email,u.avatar_color, c.name as course_name,c.category as course_category,t.name as tutor_name FROM enrollments e JOIN users u ON u.id=e.student_id JOIN courses c ON c.id=e.course_id JOIN users t ON t.id=c.tutor_id ORDER BY e.enrollment_date DESC").all());
});

app.post('/api/enrollments', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  const { student_id, course_id } = req.body;
  if (!student_id || !course_id) return res.status(400).json({ error: 'Student and Course required' });
  const d = getDB();
  const existing = d.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?").get(student_id, course_id);
  if (existing) return res.status(400).json({ error: 'Already enrolled' });
  const r = d.prepare("INSERT INTO enrollments (student_id,course_id) VALUES (?,?)").run(student_id, course_id);
  d.prepare("UPDATE courses SET students_count=(SELECT COUNT(*) FROM enrollments WHERE course_id=courses.id AND status IN ('active','completed')) WHERE id=?").run(course_id);
  auditLog(user.id, 'create_enrollment', 'enrollment', r.lastInsertRowid);
  res.status(201).json({ enrollment_id: r.lastInsertRowid, message: 'Enrolled' });
});

app.put('/api/enrollments', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager','advisor']); if (!user) return;
  const { enrollment_id, ...fields } = req.body;
  if (!enrollment_id) return res.status(400).json({ error: 'Enrollment ID required' });
  const allowed = ['progress_percentage','grade','status'];
  const sets = []; const vals = [];
  for (const k of allowed) { if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); } }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(enrollment_id);
  getDB().prepare(`UPDATE enrollments SET ${sets.join(',')} WHERE enrollment_id=?`).run(...vals);
  auditLog(user.id, 'update_enrollment', 'enrollment', enrollment_id);
  res.json({ message: 'Updated' });
});

app.delete('/api/enrollments', (req, res) => {
  const user = requireRole(req, res, ['superadmin','manager']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'ID required' });
  const permanent = req.query.permanent === 'true';
  const d = getDB();
  if (permanent) {
    try {
      d.prepare("DELETE FROM enrollments WHERE enrollment_id=?").run(id);
      auditLog(user.id, 'delete_enrollment', 'enrollment', id);
      res.json({ message: 'Enrollment permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete enrollment: ' + err.message });
    }
  } else {
    d.prepare("UPDATE enrollments SET status='dropped' WHERE enrollment_id=?").run(id);
    auditLog(user.id, 'drop_enrollment', 'enrollment', id);
    res.json({ message: 'Dropped' });
  }
});

// Sessions
app.get('/api/sessions', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  let rows;
  if (user.role === 'student') {
    rows = d.prepare("SELECT s.*,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? ORDER BY s.start_time DESC").all(user.id);
  } else if (user.role === 'tutor') {
    rows = d.prepare("SELECT s.*,c.name as course_name FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY s.start_time DESC").all(user.id);
  } else {
    rows = d.prepare("SELECT s.*,c.name as course_name,u.name as tutor_name FROM sessions s JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id ORDER BY s.start_time DESC").all();
  }
  res.json(rows);
});

app.post('/api/sessions', (req, res) => {
  const user = requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const { course_id, start_time, end_time, tutor_id } = req.body;
  if (!course_id || !start_time || !end_time) return res.status(400).json({ error: 'Missing fields' });
  const room = 'tijus-' + course_id + '-' + crypto.randomBytes(6).toString('hex');
  const tid = user.role === 'tutor' ? user.id : (tutor_id || user.id);
  const r = getDB().prepare("INSERT INTO sessions (course_id,tutor_id,start_time,end_time,room_name) VALUES (?,?,?,?,?)").run(course_id, tid, start_time, end_time, room);
  auditLog(user.id, 'create_session', 'session', r.lastInsertRowid);
  res.status(201).json({ session_id: r.lastInsertRowid, room_name: room });
});

app.delete('/api/sessions', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  try {
    d.transaction(() => {
      d.prepare("DELETE FROM attendance_logs WHERE session_id=?").run(id);
      d.prepare("DELETE FROM meeting_records WHERE session_id=?").run(id);
      d.prepare("DELETE FROM signaling WHERE session_id=?").run(id);
      d.prepare("DELETE FROM sessions WHERE session_id=?").run(id);
    })();
    auditLog(user.id, 'delete_session', 'session', id);
    res.json({ message: 'Session permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session: ' + err.message });
  }
});

// Test video call
app.post('/api/test-call', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  try {
    const d = getDB();
    // Create or reuse hidden test course
    let testCourse = d.prepare("SELECT id FROM courses WHERE name='__test_call__'").get();
    if (!testCourse) {
      const r = d.prepare("INSERT INTO courses (name,category,tutor_id,status) VALUES ('__test_call__','Technology',?,?)").run(user.id, 'draft');
      testCourse = { id: r.lastInsertRowid };
    }
    const room = 'test-' + crypto.randomBytes(8).toString('hex');
    const now = new Date();
    const end = new Date(now.getTime() + 3600000);
    const r = d.prepare("INSERT INTO sessions (course_id,tutor_id,start_time,end_time,room_name) VALUES (?,?,?,?,?)")
      .run(testCourse.id, user.id, now.toISOString(), end.toISOString(), room);
    const sessionId = r.lastInsertRowid;
    auditLog(user.id, 'create_test_call', 'session', sessionId);
    res.status(201).json({ session_id: sessionId, room_name: room });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create test call: ' + err.message });
  }
});

// Join session
app.post('/api/join-session', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  const sess = d.prepare("SELECT s.*, CASE WHEN c.name='__test_call__' THEN 'Test Call' ELSE c.name END as course_name FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.session_id=?").get(session_id);
  if (!sess) return res.status(404).json({ error: 'Not found' });
  const isTestCall = d.prepare("SELECT 1 FROM courses WHERE id=? AND name='__test_call__'").get(sess.course_id);
  if (!isTestCall && user.role === 'student') {
    const enrolled = d.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?").get(user.id, sess.course_id);
    if (!enrolled) return res.status(403).json({ error: 'Not enrolled' });
  }
  d.prepare("INSERT INTO attendance_logs (session_id,student_id,join_time) VALUES (?,?,datetime('now'))").run(session_id, user.id);
  if (sess.status === 'scheduled') d.prepare("UPDATE sessions SET status='live' WHERE session_id=?").run(session_id);
  d.prepare("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'join',?)").run(session_id, user.id, JSON.stringify({ name: user.name, role: user.role }));
  res.json({ room_name: sess.room_name, session: sess, user: { id: user.id, name: user.name, role: user.role } });
});

// Leave session
app.post('/api/leave-session', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  d.prepare("UPDATE attendance_logs SET leave_time=datetime('now'), duration_minutes=CAST((julianday(datetime('now'))-julianday(join_time))*24*60 AS INTEGER) WHERE session_id=? AND student_id=? AND leave_time IS NULL").run(session_id, user.id);
  d.prepare("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'leave','')").run(session_id, user.id);
  res.json({ message: 'Left session' });
});

// End a live session: mark it completed, close open attendance logs, and
// (LiveKit) disconnect everyone by deleting the room. Tutors may only end
// their own sessions; admins/managers any.
app.post('/api/end-session', async (req, res) => {
  const user = requireRole(req, res, ['tutor', 'advisor', 'manager', 'superadmin']); if (!user) return;
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  const sess = d.prepare("SELECT * FROM sessions WHERE session_id=?").get(session_id);
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  if (user.role === 'tutor' && sess.tutor_id !== user.id) {
    return res.status(403).json({ error: 'Not your session' });
  }
  d.prepare("UPDATE sessions SET status='completed' WHERE session_id=?").run(session_id);
  d.prepare("UPDATE attendance_logs SET leave_time=datetime('now'), duration_minutes=CAST((julianday(datetime('now'))-julianday(join_time))*24*60 AS INTEGER) WHERE session_id=? AND leave_time IS NULL").run(session_id);
  // Tell WebRTC peers the session ended, and tear down the LiveKit room.
  d.prepare("INSERT INTO signaling (session_id,from_user_id,type,payload) VALUES (?,?,'leave','')").run(session_id, user.id);
  if (livekitConfigured()) {
    try {
      const { RoomServiceClient } = await getLiveKit();
      const svc = new RoomServiceClient(livekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await svc.deleteRoom(livekitRoomName(session_id));
    } catch { /* room may not exist */ }
  }
  auditLog(user.id, 'end_session', 'session', session_id);
  res.json({ message: 'Session ended' });
});

// Signaling
app.get('/api/signaling', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const sid = parseInt(req.query.session_id);
  const lastId = parseInt(req.query.last_id) || 0;
  if (!sid) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  const signals = d.prepare("SELECT * FROM signaling WHERE session_id=? AND id>? AND from_user_id!=? AND (to_user_id IS NULL OR to_user_id=?) AND consumed=0 ORDER BY id").all(sid, lastId, user.id, user.id);
  if (signals.length) {
    // Only consume DIRECTED signals (offer/answer/ice aimed at one peer).
    // Broadcast join/leave (to_user_id NULL) must stay readable so that EVERY
    // other participant — including someone who joins later — receives them;
    // this is what lets 3+ people mesh. The per-client last_id cursor already
    // stops a signal being re-delivered to the same client.
    const directed = signals.filter(s => s.to_user_id != null).map(s => s.id);
    if (directed.length) {
      d.prepare(`UPDATE signaling SET consumed=1 WHERE id IN (${directed.join(',')})`).run();
    }
  }
  res.json(signals);
});

app.post('/api/signaling', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const { session_id, type, payload, to_user_id } = req.body;
  if (!session_id || !type) return res.status(400).json({ error: 'Missing fields' });
  const p = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const r = getDB().prepare("INSERT INTO signaling (session_id,from_user_id,to_user_id,type,payload) VALUES (?,?,?,?,?)").run(session_id, user.id, to_user_id || null, type, p);
  res.json({ id: r.lastInsertRowid });
});

// Attendance
app.get('/api/attendance-logs', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  const sid = req.query.session_id;
  let rows;
  if (sid) {
    rows = d.prepare("SELECT a.*,u.name as student_name,u.avatar_color FROM attendance_logs a JOIN users u ON u.id=a.student_id WHERE a.session_id=? ORDER BY a.join_time").all(parseInt(sid));
  } else if (user.role === 'student') {
    rows = d.prepare("SELECT a.*,c.name as course_name,s.start_time FROM attendance_logs a JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE a.student_id=? ORDER BY a.timestamp DESC").all(user.id);
  } else if (user.role === 'tutor') {
    // Scope tutors to attendance for their own sessions only
    rows = d.prepare("SELECT a.*,u.name as student_name,u.avatar_color,c.name as course_name,s.start_time FROM attendance_logs a JOIN users u ON u.id=a.student_id JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY a.timestamp DESC LIMIT 200").all(user.id);
  } else {
    rows = d.prepare("SELECT a.*,u.name as student_name,u.avatar_color,c.name as course_name,s.start_time FROM attendance_logs a JOIN users u ON u.id=a.student_id JOIN sessions s ON s.session_id=a.session_id JOIN courses c ON c.id=s.course_id ORDER BY a.timestamp DESC LIMIT 200").all();
  }
  res.json(rows);
});

// Meeting records
app.get('/api/meeting-records', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  let rows;
  if (user.role === 'student') {
    rows = d.prepare("SELECT mr.*,c.name as course_name,s.start_time FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id JOIN enrollments e ON e.course_id=s.course_id AND e.student_id=? ORDER BY mr.creation_date DESC").all(user.id);
  } else if (user.role === 'tutor') {
    // Tutors only see recordings from their own sessions.
    rows = d.prepare("SELECT mr.*,c.name as course_name,s.start_time FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id WHERE s.tutor_id=? ORDER BY mr.creation_date DESC").all(user.id);
  } else {
    rows = d.prepare("SELECT mr.*,c.name as course_name,s.start_time,u.name as tutor_name FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=s.tutor_id ORDER BY mr.creation_date DESC").all();
  }
  res.json(rows);
});

// Delete a recording (file + row). Tutors may delete only their own sessions'
// recordings; superadmin any.
app.delete('/api/meeting-records', (req, res) => {
  const user = requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'Record ID required' });
  const d = getDB();
  const rec = d.prepare("SELECT mr.*, s.tutor_id FROM meeting_records mr JOIN sessions s ON s.session_id=mr.session_id WHERE mr.record_id=?").get(id);
  if (!rec) return res.status(404).json({ error: 'Recording not found' });
  if (user.role === 'tutor' && rec.tutor_id !== user.id) return res.status(403).json({ error: 'Not your recording' });
  try { if (rec.file_path && fs.existsSync(rec.file_path)) fs.unlinkSync(rec.file_path); } catch { /* file already gone */ }
  d.prepare("DELETE FROM meeting_records WHERE record_id=?").run(id);
  auditLog(user.id, 'delete_recording', 'meeting_record', id);
  res.json({ message: 'Recording deleted' });
});

// Reports
app.get('/api/reports', (req, res) => {
  const user = requireRole(req, res, ['advisor','manager','superadmin']); if (!user) return;
  const d = getDB();
  const data = {
    total_students: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='student'").get().c,
    active_students: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='student' AND status='active'").get().c,
    total_tutors: d.prepare("SELECT COUNT(*) as c FROM users WHERE role='tutor'").get().c,
    total_courses: d.prepare("SELECT COUNT(*) as c FROM courses WHERE status='active'").get().c,
    total_enrollments: d.prepare("SELECT COUNT(*) as c FROM enrollments").get().c,
    active_enrollments: d.prepare("SELECT COUNT(*) as c FROM enrollments WHERE status='active'").get().c,
    completed_enrollments: d.prepare("SELECT COUNT(*) as c FROM enrollments WHERE status='completed'").get().c,
    total_sessions: d.prepare("SELECT COUNT(*) as c FROM sessions").get().c,
    completed_sessions: d.prepare("SELECT COUNT(*) as c FROM sessions WHERE status='completed'").get().c,
    avg_progress: +(d.prepare("SELECT AVG(progress_percentage) as v FROM enrollments").get().v || 0).toFixed(1),
    courses_by_category: d.prepare("SELECT category, COUNT(*) as count FROM courses GROUP BY category ORDER BY count DESC").all(),
    enrollments_by_course: d.prepare("SELECT c.name, COUNT(e.enrollment_id) as count FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.id ORDER BY count DESC LIMIT 10").all(),
    student_status_breakdown: d.prepare("SELECT status, COUNT(*) as count FROM users WHERE role='student' GROUP BY status").all(),
    grade_distribution: d.prepare("SELECT grade, COUNT(*) as count FROM enrollments WHERE grade!='' GROUP BY grade ORDER BY grade").all(),
  };
  const totalLogs = d.prepare("SELECT COUNT(*) as c FROM attendance_logs").get().c;
  const totalPossible = d.prepare("SELECT COUNT(*) as c FROM sessions s JOIN enrollments e ON e.course_id=s.course_id WHERE s.status='completed'").get().c;
  data.avg_attendance_rate = totalPossible > 0 ? +((totalLogs / totalPossible) * 100).toFixed(1) : 0;
  res.json(data);
});

// Users CRUD
app.get('/api/users', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  res.json(getDB().prepare("SELECT id,name,email,portal,role,status,avatar_color,specialization,must_change_password,created_at FROM users ORDER BY created_at DESC").all());
});

app.post('/api/users', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const { name, email, role, password, specialization, avatar_color } = req.body;
  if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, role required' });
  if (!['student','tutor','advisor','manager','superadmin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const d = getDB();
  if (d.prepare("SELECT 1 FROM users WHERE email=?").get(email)) return res.status(400).json({ error: 'Email exists' });
  const plainPassword = password || 'password123';
  const hash = bcrypt.hashSync(plainPassword, 10);
  const r = d.prepare("INSERT INTO users (name,email,portal,role,password_hash,avatar_color,specialization,must_change_password) VALUES (?,?,?,?,?,?,?,1)").run(name, email, role, role, hash, avatar_color || '#4F46E5', specialization || '');
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

app.put('/api/users', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const { id, password, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'User ID required' });
  const allowed = ['name','email','role','status','specialization','avatar_color','payout_rate','payout_type'];
  const sets = []; const vals = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k}=?`); vals.push(fields[k]);
      if (k === 'role') { sets.push('portal=?'); vals.push(fields[k]); }
    }
  }
  if (password) { sets.push('password_hash=?'); vals.push(bcrypt.hashSync(password, 10)); sets.push('must_change_password=1'); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  getDB().prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  auditLog(user.id, 'update_user', 'user', id);
  res.json({ message: 'Updated' });
});

app.delete('/api/users', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'ID required' });
  if (id === user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const permanent = req.query.permanent === 'true';
  const d = getDB();
  if (permanent) {
    try {
      const deleteUser = d.transaction(() => {
        // Delete attendance logs for sessions this user attended or tutored
        const tutorSessionIds = d.prepare("SELECT session_id FROM sessions WHERE tutor_id=?").all(id).map(s => s.session_id);
        for (const sid of tutorSessionIds) {
          d.prepare("DELETE FROM attendance_logs WHERE session_id=?").run(sid);
          d.prepare("DELETE FROM meeting_records WHERE session_id=?").run(sid);
          d.prepare("DELETE FROM signaling WHERE session_id=?").run(sid);
        }
        d.prepare("DELETE FROM attendance_logs WHERE student_id=?").run(id);
        // Delete enrollments
        d.prepare("DELETE FROM enrollments WHERE student_id=?").run(id);
        // Delete sessions tutored by this user
        d.prepare("DELETE FROM sessions WHERE tutor_id=?").run(id);
        // Delete courses owned by this tutor
        d.prepare("DELETE FROM courses WHERE tutor_id=?").run(id);
        // Delete password resets
        d.prepare("DELETE FROM password_resets WHERE user_id=?").run(id);
        // Delete audit logs
        d.prepare("DELETE FROM audit_logs WHERE user_id=?").run(id);
        // Delete signaling records
        d.prepare("DELETE FROM signaling WHERE from_user_id=?").run(id);
        // Finally delete user
        d.prepare("DELETE FROM users WHERE id=?").run(id);
      });
      deleteUser();
      auditLog(user.id, 'delete_user', 'user', id);
      res.json({ message: 'Permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
  } else {
    d.prepare("UPDATE users SET status='inactive' WHERE id=?").run(id);
    auditLog(user.id, 'deactivate_user', 'user', id);
    res.json({ message: 'Deactivated' });
  }
});

// Clear data
app.post('/api/clear-data', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const { target } = req.body;
  const d = getDB();
  try {
    const clearAll = () => {
      d.prepare("DELETE FROM signaling").run();
      d.prepare("DELETE FROM meeting_records").run();
      d.prepare("DELETE FROM attendance_logs").run();
      d.prepare("DELETE FROM enrollments").run();
      d.prepare("DELETE FROM sessions").run();
      d.prepare("DELETE FROM courses").run();
      d.prepare("DELETE FROM password_resets").run();
      d.prepare("DELETE FROM audit_logs").run();
      d.prepare("DELETE FROM users WHERE id != ?").run(user.id);
    };

    if (target === 'all') {
      d.transaction(clearAll)();
      auditLog(user.id, 'clear_all_data', 'system', null);
      res.json({ message: 'All data cleared (except your account)' });
    } else if (target === 'students') {
      d.transaction(() => {
        const ids = d.prepare("SELECT id FROM users WHERE role='student'").all().map(u => u.id);
        for (const id of ids) {
          d.prepare("DELETE FROM attendance_logs WHERE student_id=?").run(id);
          d.prepare("DELETE FROM enrollments WHERE student_id=?").run(id);
          d.prepare("DELETE FROM password_resets WHERE user_id=?").run(id);
          d.prepare("DELETE FROM users WHERE id=?").run(id);
        }
      })();
      auditLog(user.id, 'clear_students', 'system', null);
      res.json({ message: 'All students cleared' });
    } else if (target === 'tutors') {
      d.transaction(() => {
        const ids = d.prepare("SELECT id FROM users WHERE role='tutor'").all().map(u => u.id);
        for (const id of ids) {
          const sids = d.prepare("SELECT session_id FROM sessions WHERE tutor_id=?").all(id).map(s => s.session_id);
          for (const sid of sids) {
            d.prepare("DELETE FROM attendance_logs WHERE session_id=?").run(sid);
            d.prepare("DELETE FROM meeting_records WHERE session_id=?").run(sid);
            d.prepare("DELETE FROM signaling WHERE session_id=?").run(sid);
          }
          d.prepare("DELETE FROM sessions WHERE tutor_id=?").run(id);
          d.prepare("DELETE FROM enrollments WHERE course_id IN (SELECT id FROM courses WHERE tutor_id=?)").run(id);
          d.prepare("DELETE FROM courses WHERE tutor_id=?").run(id);
          d.prepare("DELETE FROM password_resets WHERE user_id=?").run(id);
          d.prepare("DELETE FROM users WHERE id=?").run(id);
        }
      })();
      auditLog(user.id, 'clear_tutors', 'system', null);
      res.json({ message: 'All tutors cleared' });
    } else if (target === 'courses') {
      d.transaction(() => {
        d.prepare("DELETE FROM attendance_logs").run();
        d.prepare("DELETE FROM meeting_records").run();
        d.prepare("DELETE FROM signaling").run();
        d.prepare("DELETE FROM sessions").run();
        d.prepare("DELETE FROM enrollments").run();
        d.prepare("DELETE FROM courses").run();
      })();
      auditLog(user.id, 'clear_courses', 'system', null);
      res.json({ message: 'All courses, sessions, and enrollments cleared' });
    } else if (target === 'sessions') {
      d.transaction(() => {
        d.prepare("DELETE FROM attendance_logs").run();
        d.prepare("DELETE FROM meeting_records").run();
        d.prepare("DELETE FROM signaling").run();
        d.prepare("DELETE FROM sessions").run();
      })();
      auditLog(user.id, 'clear_sessions', 'system', null);
      res.json({ message: 'All sessions and attendance cleared' });
    } else if (target === 'audit_logs') {
      d.prepare("DELETE FROM audit_logs").run();
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
app.get('/api/app-settings', (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  const s = getDB().prepare("SELECT currency, video_provider, zoom_account_id, zoom_client_id, zoom_client_secret FROM app_settings WHERE id=1").get() || {};
  res.json({
    currency: s.currency || 'INR',
    // Default to LiveKit when it's configured; otherwise fall back to WebRTC.
    video_provider: s.video_provider || (livekitConfigured() ? 'livekit' : 'webrtc'),
    zoom_account_id: s.zoom_account_id || '',
    zoom_client_id: s.zoom_client_id || '',
    // Never echo the secret back; just report whether one is stored.
    zoom_has_secret: !!s.zoom_client_secret,
    // LiveKit is configured via env vars, not the DB — report availability only.
    livekit_configured: livekitConfigured(),
  });
});

app.put('/api/app-settings', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const currency = (req.body.currency || '').trim().toUpperCase();
  const allowed = ['INR','USD','EUR','GBP','AED','AUD','CAD','SGD','JPY'];
  if (!allowed.includes(currency)) return res.status(400).json({ error: 'Unsupported currency' });
  const d = getDB();
  d.prepare(`INSERT INTO app_settings (id, currency) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET currency=excluded.currency`).run(currency);
  auditLog(user.id, 'update_currency', 'app_settings', 1, `Set currency to ${currency}`);
  res.json({ message: 'Settings updated', currency });
});

// Video / meeting provider settings (WebRTC built-in, or Zoom)
app.put('/api/video-settings', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const provider = (req.body.video_provider || 'webrtc').trim();
  if (!['webrtc', 'zoom', 'livekit'].includes(provider)) {
    return res.status(400).json({ error: 'Unsupported video provider' });
  }
  if (provider === 'livekit' && !livekitConfigured()) {
    return res.status(400).json({ error: 'LiveKit env vars (LIVEKIT_URL/API_KEY/API_SECRET) are not set on the server' });
  }
  const accountId = (req.body.zoom_account_id || '').trim();
  const clientId = (req.body.zoom_client_id || '').trim();
  const clientSecret = (req.body.zoom_client_secret || '').trim(); // optional — blank keeps existing
  const d = getDB();
  d.prepare("INSERT OR IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')").run();

  if (provider === 'zoom') {
    const existing = d.prepare("SELECT zoom_client_secret FROM app_settings WHERE id=1").get();
    const hasSecret = clientSecret || (existing && existing.zoom_client_secret);
    if (!accountId || !clientId || !hasSecret) {
      return res.status(400).json({ error: 'Zoom requires Account ID, Client ID and Client Secret' });
    }
  }

  if (clientSecret) {
    d.prepare("UPDATE app_settings SET video_provider=?, zoom_account_id=?, zoom_client_id=?, zoom_client_secret=? WHERE id=1")
      .run(provider, accountId, clientId, clientSecret);
  } else {
    d.prepare("UPDATE app_settings SET video_provider=?, zoom_account_id=?, zoom_client_id=? WHERE id=1")
      .run(provider, accountId, clientId);
  }
  auditLog(user.id, 'update_video_settings', 'app_settings', 1, `Set video provider to ${provider}`);
  res.json({ message: 'Video settings saved', video_provider: provider });
});

// Request a Server-to-Server OAuth token from Zoom using stored credentials.
async function getZoomAccessToken(d) {
  const s = d.prepare("SELECT zoom_account_id, zoom_client_id, zoom_client_secret FROM app_settings WHERE id=1").get() || {};
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
  const user = requireAuth(req, res); if (!user) return;
  const d = getDB();
  const s = d.prepare("SELECT video_provider, zoom_account_id, zoom_client_id, zoom_client_secret FROM app_settings WHERE id=1").get() || {};
  const provider = s.video_provider || 'webrtc';
  const configured = !!(s.zoom_account_id && s.zoom_client_id && s.zoom_client_secret);
  if (!configured) return res.json({ provider, configured: false, connected: false });
  try {
    await getZoomAccessToken(d);
    res.json({ provider, configured: true, connected: true });
  } catch (err) {
    res.json({ provider, configured: true, connected: false, error: err.message });
  }
});

// ============================================================
// LiveKit (large webinar sessions)
// ============================================================
const PUBLISHER_ROLES = ['tutor', 'advisor', 'manager', 'superadmin'];

// Shared access check: can this user be in this session at all?
function canAccessSession(d, user, sessionId) {
  const sess = d.prepare("SELECT s.*, c.name as course_name FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.session_id=?").get(sessionId);
  if (!sess) return { ok: false, status: 404, error: 'Session not found' };
  const isTestCall = d.prepare("SELECT 1 FROM courses WHERE id=? AND name='__test_call__'").get(sess.course_id);
  if (!isTestCall && user.role === 'student') {
    const enrolled = d.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND course_id=?").get(user.id, sess.course_id);
    if (!enrolled) return { ok: false, status: 403, error: 'Not enrolled' };
  }
  return { ok: true, sess };
}

// Issue a LiveKit access token for a session. Tutors/admins publish; students
// join view-only (webinar mode) until a tutor promotes them to the stage.
app.get('/api/livekit/token', async (req, res) => {
  const user = requireAuth(req, res); if (!user) return;
  if (!livekitConfigured()) return res.status(503).json({ error: 'LiveKit not configured on the server' });
  const sessionId = parseInt(req.query.session_id);
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
  const d = getDB();
  const access = canAccessSession(d, user, sessionId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  // Everyone may publish camera + mic so sessions are interactive (e.g. OET
  // speaking practice needs the student seen and heard). Hosts also get room
  // admin rights (mute/remove others). For a true large webinar where students
  // should be silent by default, this is the single line to gate by role.
  const isHost = PUBLISHER_ROLES.includes(user.role);
  const canPublish = true;
  try {
    const { AccessToken } = await getLiveKit();
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
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
    res.json({ url: LIVEKIT_URL, token, can_publish: canPublish, identity: String(user.id), room: livekitRoomName(sessionId) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to mint LiveKit token' });
  }
});

// Promote/demote a participant (tutor → student stage access). Only the
// session's own tutor or an admin may change permissions.
app.post('/api/livekit/update-permission', async (req, res) => {
  const user = requireRole(req, res, PUBLISHER_ROLES); if (!user) return;
  if (!livekitConfigured()) return res.status(503).json({ error: 'LiveKit not configured on the server' });
  const { session_id, identity, can_publish } = req.body;
  if (!session_id || !identity) return res.status(400).json({ error: 'session_id and identity required' });
  const d = getDB();
  const sess = d.prepare("SELECT tutor_id FROM sessions WHERE session_id=?").get(session_id);
  if (!sess) return res.status(404).json({ error: 'Session not found' });
  if (user.role === 'tutor' && sess.tutor_id !== user.id) {
    return res.status(403).json({ error: 'Not your session' });
  }
  try {
    const { RoomServiceClient } = await getLiveKit();
    const svc = new RoomServiceClient(livekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
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

// Estimated video data transfer, derived from our own attendance logs.
// LiveKit Cloud does not expose billed bandwidth via API, so this is an
// approximation: participant-minutes × a typical per-participant bitrate.
// Exact billed usage lives in the LiveKit Cloud dashboard.
const EST_MBPS_PER_PARTICIPANT = 2;            // ~2 Mbps up+down combined, typical
const EST_MB_PER_MINUTE = (EST_MBPS_PER_PARTICIPANT / 8) * 60; // = 15 MB/min
app.get('/api/livekit/usage', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const d = getDB();
  // Participant-minutes (closed logs use leave_time, ongoing count up to now).
  const windowStats = (sinceExpr) => d.prepare(`
    SELECT
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(*) AS participants,
      COALESCE(SUM(
        CASE WHEN leave_time IS NOT NULL
          THEN (julianday(leave_time) - julianday(join_time)) * 24 * 60
          ELSE (julianday('now')      - julianday(join_time)) * 24 * 60 END
      ), 0) AS minutes
    FROM attendance_logs
    WHERE join_time >= ${sinceExpr}
  `).get();
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
    today: shape(windowStats("datetime('now','start of day')")),
    month: shape(windowStats("datetime('now','start of month')")),
  });
});

// ============================================================
// SMTP Settings
// ============================================================
app.get('/api/smtp-settings', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const smtp = getDB().prepare("SELECT host, port, user, pass, from_email FROM smtp_settings WHERE id=1").get();
  res.json(smtp || { host: '', port: 587, user: '', pass: '', from_email: '' });
});

app.post('/api/smtp-settings', (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
  const { host, port, user: smtpUser, pass, from_email } = req.body;
  const d = getDB();
  d.prepare(`INSERT INTO smtp_settings (id, host, port, user, pass, from_email) VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET host=excluded.host, port=excluded.port, user=excluded.user, pass=excluded.pass, from_email=excluded.from_email`
  ).run(host || '', port || 587, smtpUser || '', pass || '', from_email || '');
  auditLog(user.id, 'update_smtp_settings', 'settings', 1);
  res.json({ message: 'SMTP settings saved' });
});

app.post('/api/smtp-test', async (req, res) => {
  const user = requireRole(req, res, ['superadmin']); if (!user) return;
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
  const d = getDB();
  const u = d.prepare("SELECT id, name FROM users WHERE email=?").get(email);
  if (!u) return res.json({ message: 'If the email exists, a reset link has been sent' });
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString();
  d.prepare("INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)").run(u.id, token, expires);
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

app.post('/api/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
  const d = getDB();
  const reset = d.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at>datetime('now')").get(token);
  if (!reset) return res.status(400).json({ error: 'Invalid or expired token' });
  d.prepare("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?").run(bcrypt.hashSync(password, 10), reset.user_id);
  d.prepare("UPDATE password_resets SET used=1 WHERE id=?").run(reset.id);
  auditLog(reset.user_id, 'password_reset', 'user', reset.user_id);
  res.json({ message: 'Password reset successfully' });
});

// Upload recording
app.post('/api/upload-recording', upload.single('recording'), (req, res) => {
  const user = requireRole(req, res, ['tutor','superadmin']); if (!user) return;
  const sessionId = parseInt(req.body.session_id);
  if (!sessionId || !req.file) return res.status(400).json({ error: 'Session ID and file required' });
  const ext = path.extname(req.file.originalname) || '.webm';
  const filename = `recording-${sessionId}-${Date.now()}${ext}`;
  const dest = path.join(UPLOAD_DIR, filename);
  fs.renameSync(req.file.path, dest);
  const r = getDB().prepare("INSERT INTO meeting_records (session_id,file_path,playback_url) VALUES (?,?,?)").run(sessionId, dest, `/uploads/recordings/${filename}`);
  auditLog(user.id, 'upload_recording', 'meeting_record', r.lastInsertRowid);
  res.status(201).json({ message: 'Uploaded', playback_url: `/uploads/recordings/${filename}` });
});

// ============================================================
// Serve frontend in production
// ============================================================
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    }
  });
}

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
  getDB(); // initialize DB on startup
  console.log(`TijusPro LMS running at http://localhost:${PORT}`);
});
