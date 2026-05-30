-- TijusPro LMS Database Schema (SQLite)

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    portal TEXT NOT NULL CHECK(portal IN ('student','tutor','advisor','manager','superadmin')),
    role TEXT NOT NULL CHECK(role IN ('student','tutor','advisor','manager','superadmin')),
    specialization TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','at-risk')),
    avatar_color TEXT DEFAULT '#4F46E5',
    password_hash TEXT NOT NULL,
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    tutor_id INTEGER NOT NULL REFERENCES users(id),
    students_count INTEGER DEFAULT 0,
    progress REAL DEFAULT 0.0,
    icon TEXT DEFAULT 'book',
    color TEXT DEFAULT '#3B82F6',
    status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','draft')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    progress_percentage REAL DEFAULT 0.0,
    grade TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','dropped')),
    enrollment_date TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, course_id)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    tutor_id INTEGER NOT NULL REFERENCES users(id),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room_name TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','completed','cancelled')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Attendance logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(session_id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    timestamp TEXT DEFAULT (datetime('now')),
    join_time TEXT,
    leave_time TEXT,
    duration_minutes INTEGER DEFAULT 0
);

-- Meeting records table
CREATE TABLE IF NOT EXISTS meeting_records (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(session_id),
    file_path TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    creation_date TEXT DEFAULT (datetime('now')),
    playback_url TEXT DEFAULT ''
);

-- WebRTC signaling table
CREATE TABLE IF NOT EXISTS signaling (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('offer','answer','ice-candidate','join','leave')),
    payload TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    consumed INTEGER DEFAULT 0
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- SMTP settings (single-row global config)
CREATE TABLE IF NOT EXISTS smtp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT,
    port INTEGER DEFAULT 587,
    user TEXT,
    pass TEXT,
    from_email TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_portal_role ON users(portal, role);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutor ON sessions(tutor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_signaling_session ON signaling(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
