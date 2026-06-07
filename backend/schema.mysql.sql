-- TijusPro LMS Database Schema (MySQL / MariaDB)
-- Translated from the original SQLite schema. Timestamp-ish columns that the
-- app stores as ISO/`YYYY-MM-DD HH:MM:SS` strings are kept as VARCHAR to
-- preserve exact string semantics for display/ordering; created_at columns use
-- a real DATETIME default.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  portal VARCHAR(20) NOT NULL,
  role VARCHAR(20) NOT NULL,
  specialization VARCHAR(255) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  avatar_color VARCHAR(20) DEFAULT '#4F46E5',
  password_hash VARCHAR(255) NOT NULL,
  must_change_password TINYINT DEFAULT 0,
  payout_rate DOUBLE DEFAULT 0,
  payout_type VARCHAR(20) DEFAULT 'monthly',
  avatar_url VARCHAR(512) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_portal_role (portal, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  tutor_id INT NOT NULL,
  students_count INT DEFAULT 0,
  progress DOUBLE DEFAULT 0,
  icon VARCHAR(50) DEFAULT 'book',
  color VARCHAR(20) DEFAULT '#3B82F6',
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  progress_percentage DOUBLE DEFAULT 0,
  grade VARCHAR(10) DEFAULT '',
  status VARCHAR(20) DEFAULT 'active',
  enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enroll (student_id, course_id),
  INDEX idx_enrollments_student (student_id),
  INDEX idx_enrollments_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  tutor_id INT NOT NULL,
  start_time VARCHAR(40) NOT NULL,
  end_time VARCHAR(40) NOT NULL,
  room_name VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_course (course_id),
  INDEX idx_sessions_tutor (tutor_id),
  INDEX idx_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  join_time VARCHAR(40),
  leave_time VARCHAR(40),
  duration_minutes INT DEFAULT 0,
  INDEX idx_attendance_session (session_id),
  INDEX idx_attendance_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meeting_records (
  record_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  duration_seconds INT DEFAULT 0,
  creation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  playback_url VARCHAR(1024) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signaling (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  from_user_id INT NOT NULL,
  to_user_id INT,
  type VARCHAR(20) NOT NULL,
  payload TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  consumed TINYINT DEFAULT 0,
  INDEX idx_signaling_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  details TEXT,
  ip_address VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at VARCHAR(40) NOT NULL,
  used TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INT PRIMARY KEY,
  host VARCHAR(255),
  port INT DEFAULT 587,
  `user` VARCHAR(255),
  pass VARCHAR(255),
  from_email VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(10) NOT NULL,
  file_path VARCHAR(1024) DEFAULT '',
  url VARCHAR(1024) DEFAULT '',
  original_name VARCHAR(255) DEFAULT '',
  sort_order INT DEFAULT 0,
  is_enabled TINYINT DEFAULT 1,
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_materials_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_material_managers (
  course_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_by INT,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, user_id),
  INDEX idx_mat_managers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS meetings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  passcode VARCHAR(20) NOT NULL,
  title VARCHAR(120) DEFAULT 'Meeting',
  host_name VARCHAR(120) DEFAULT '',
  host_email VARCHAR(160) DEFAULT '',
  created_by INT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY,
  currency VARCHAR(10) DEFAULT 'INR',
  video_provider VARCHAR(20) DEFAULT 'livekit',
  zoom_account_id VARCHAR(255) DEFAULT '',
  zoom_client_id VARCHAR(255) DEFAULT '',
  zoom_client_secret VARCHAR(255) DEFAULT '',
  hubspot_token TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
