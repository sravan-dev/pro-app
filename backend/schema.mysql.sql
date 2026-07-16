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
  gender VARCHAR(20) DEFAULT '',
  team_id INT NULL,
  advisor_id INT NULL,
  assigned_tutor_id INT NULL,
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
  student_id INT NULL,
  start_time VARCHAR(40) NOT NULL,
  end_time VARCHAR(40) NOT NULL,
  room_name VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_course (course_id),
  INDEX idx_sessions_tutor (tutor_id),
  INDEX idx_sessions_student (student_id),
  INDEX idx_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tutor-published availability slots that students can book. A booked slot
-- points at the session created for it (session_id) and the student who booked
-- it (booked_by). start_time/end_time are stored as the same datetime strings
-- sessions use, so ordering/display stay consistent.
CREATE TABLE IF NOT EXISTS availability_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tutor_id INT NOT NULL,
  start_time VARCHAR(40) NOT NULL,
  end_time VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  booked_by INT DEFAULT NULL,
  session_id INT DEFAULT NULL,
  note VARCHAR(255) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avail_tutor (tutor_id),
  INDEX idx_avail_status (status),
  INDEX idx_avail_booked (booked_by)
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
  from_email VARCHAR(255),
  provider VARCHAR(20) DEFAULT 'smtp',
  resend_api_key VARCHAR(255) DEFAULT '',
  resend_monthly_cap INT DEFAULT 0,
  resend_quota_used VARCHAR(64) DEFAULT '',
  resend_quota_at DATETIME NULL,
  gmail_user VARCHAR(255) DEFAULT '',
  gmail_app_password VARCHAR(255) DEFAULT ''
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
  hubspot_token TEXT,
  livekit_url VARCHAR(255) DEFAULT '',
  livekit_api_key VARCHAR(255) DEFAULT '',
  livekit_api_secret VARCHAR(255) DEFAULT '',
  kajabi_client_id VARCHAR(255) DEFAULT '',
  kajabi_client_secret VARCHAR(255) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Teams — a configurable unit owned by one manager. Advisors, tutors and
-- students belong to a team via users.team_id. Superadmin manages these.
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  manager_id INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_teams_manager (manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Additional faculty — extra tutors assigned to a student beyond the primary
-- users.assigned_tutor_id. One row per (student, tutor) pair.
CREATE TABLE IF NOT EXISTS student_tutors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  tutor_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_tutor (student_id, tutor_id),
  INDEX idx_student_tutors_tutor (tutor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ratings — a student rates their Manager, Advisor and Tutor (1-5 + comment).
-- Re-ratable: one live row per (student, ratee), upserted on uq_rating.
CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  ratee_id INT NOT NULL,
  ratee_role VARCHAR(20) NOT NULL,
  stars INT NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating (student_id, ratee_id),
  INDEX idx_rating_ratee (ratee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Support tickets — raised by an enrolled student to their assigned advisor.
-- An advisor can escalate to their team's manager; superadmin sees everything.
-- status: open → (escalated) → resolved → closed. assigned_advisor_id is the
-- student's advisor at creation; assigned_manager_id is set on escalation.
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  assigned_advisor_id INT NULL,
  assigned_manager_id INT NULL,
  escalated TINYINT DEFAULT 0,
  escalated_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_student (student_id),
  INDEX idx_tickets_advisor (assigned_advisor_id),
  INDEX idx_tickets_manager (assigned_manager_id),
  INDEX idx_tickets_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ticket conversation — the initial message and every reply live here, one row
-- each, ordered by created_at. author_role records who wrote it for display.
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  author_id INT NOT NULL,
  author_name VARCHAR(255) DEFAULT '',
  author_role VARCHAR(20) DEFAULT '',
  body TEXT,
  is_system TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_messages_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Staff attendance — daily work-attendance for non-teaching staff (advisors,
-- managers) who don't have session records to derive hours from. Each staff
-- member has at most one row per day (uq_staff_att). check_in/check_out are the
-- same datetime strings sessions use; `hours` is computed in JS on clock-out.
-- status: present / half_day / leave / absent. Tutors are normally paid from
-- their session records instead, but may also appear here if they clock in.
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  work_date VARCHAR(10) NOT NULL,
  check_in VARCHAR(40) DEFAULT '',
  check_out VARCHAR(40) DEFAULT '',
  hours DOUBLE DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'present',
  note VARCHAR(255) DEFAULT '',
  recorded_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_att (user_id, work_date),
  INDEX idx_staff_att_user (user_id),
  INDEX idx_staff_att_date (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payroll runs — the "mark as paid" history. One locked row per staff member
-- per month (uq_payroll). The salary is computed from attendance/session
-- records at pay time and snapshotted here (payout_type/rate/units/gross_amount)
-- so historical payslips don't change if rates or records change later.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  period VARCHAR(7) NOT NULL,
  role VARCHAR(20) DEFAULT '',
  payout_type VARCHAR(20) DEFAULT 'monthly',
  payout_rate DOUBLE DEFAULT 0,
  units DOUBLE DEFAULT 0,
  unit_label VARCHAR(20) DEFAULT '',
  gross_amount DOUBLE DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'paid',
  note VARCHAR(255) DEFAULT '',
  paid_by INT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll (user_id, period),
  INDEX idx_payroll_period (period),
  INDEX idx_payroll_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contact enrollments — an intimation created when a superadmin enrolls a
-- HubSpot contact. Emailed to all managers & advisors and listed under their
-- "Enrolls" tab.
CREATE TABLE IF NOT EXISTS contact_enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hubspot_contact_id VARCHAR(64) DEFAULT '',
  contact_name VARCHAR(255) DEFAULT '',
  contact_email VARCHAR(255) DEFAULT '',
  contact_phone VARCHAR(64) DEFAULT '',
  contact_company VARCHAR(255) DEFAULT '',
  contact_stage VARCHAR(64) DEFAULT '',
  enrolled_by INT,
  enrolled_by_name VARCHAR(255) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  notified INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_enroll_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
