// Tutor seed. Creates the tutor accounts listed in TUTORS and does nothing else.
//
// Used two ways — the /seed page in the app (superadmin only, for hosts where
// there is no shell) and backend/scripts/import-tutors.js from a terminal.
//
// Deliberately not a startup migration: a startup seed that re-inserted a fixed
// tutor list used to resurrect accounts an admin had deleted on every restart.
//
// Safe to re-run: an email that already exists is reported and skipped, never
// overwritten — so re-running never resets a password somebody has changed.
// Each new tutor gets role=tutor, the shared password from SEED_TUTOR_PASSWORD, and
// must_change_password=1, matching what the admin UI's "Add User" does.

const bcrypt = require('bcryptjs');
const db = require('../db');

// Shared first-time password, read from SEED_TUTOR_PASSWORD in .env so it never
// lives in the repo.
const SEED_TUTOR_PASSWORD = (process.env.SEED_TUTOR_PASSWORD || '').trim();
const AVATAR_COLOR = '#10B981';

// [name, phone, email] — exactly as supplied.
const TUTORS = [
  ['ANJALI V BABU', '9846355708', 'anjali@tijusacademy.in'],
  ['MEENU VARGHESE', '7025223157', 'meenuvarghese98@gmail.com'],
  ['SREE GANESHAN', '15878940527', 'sreeganeshganesh19@gmail.com'],
  ['AISWARYA RAJ', '9645578562', 'aiswaryarj@gmail.com'],
  ['XIMIS XAVIER', '9175961214', 'ximis.xavier@gmail.com'],
  ['ANU DOMINIC', '9971121148', 'anudominic@gmail.com'],
  ['MEGHA MANOJ', '8137016540', 'meghamanoj2966@gmail.com'],
  ['SILJITH U', '9746391752', 'siljithuppenggal30@gmail.com'],
  ['KARTHIKA', '9567330778', 'karthikagbalan@gmail.com'],
  ['MANASA RAMESH', '9048479904', 'manasanair8807@gmail.com'],
  ['RISSY MARY MATHEW', '9567451358', 'rissy.mathew@tijusacademy.in'],
  ['FARZANA S', '9947276109', 'farzana.riswan@tijusacademy.in'],
  ['STAN', '6238006352', 'stan.sunny@tijusacademy.in'],
  ['NIKHIL ELIAS', '9995187206', 'nikhil.elias@tijusacademy.in'],
  ['ANU MARIA JOSE', '9497747230', 'anuribu@gmail.com'],
  ['TOMCY T KOSHY', '8943086835', 'tomcytkoshy1988@gmail.com'],
];

// Returns { dryRun, password, created: [{name,email}], existing: [email] }.
async function seedTutors({ dryRun = false } = {}) {
  if (!(await db.columnExists('users', 'phone'))) {
    throw new Error('users.phone is missing — restart the backend once so the startup migrations run, then try again.');
  }

  if (!dryRun && !SEED_TUTOR_PASSWORD) {
    throw new Error('SEED_TUTOR_PASSWORD is not set — add it to .env and restart the backend, then try again.');
  }

  const emails = TUTORS.map(([, , email]) => email.trim().toLowerCase());
  const taken = new Set(
    (await db.all(`SELECT LOWER(email) AS email FROM users WHERE LOWER(email) IN (${emails.map(() => '?').join(',')})`, emails))
      .map((r) => r.email)
  );

  const hash = dryRun ? '' : bcrypt.hashSync(SEED_TUTOR_PASSWORD, 10);
  const created = [];
  const existing = [];

  for (const [rawName, rawPhone, rawEmail] of TUTORS) {
    const name = rawName.trim();
    const email = rawEmail.trim();
    const phone = rawPhone.trim();

    if (taken.has(email.toLowerCase())) {
      existing.push(email);
      continue;
    }
    if (!dryRun) {
      await db.run(
        `INSERT INTO users (name,email,phone,portal,role,password_hash,avatar_color,payout_type,must_change_password)
         VALUES (?,?,?,'tutor','tutor',?,?,'shift',1)`,
        [name, email, phone, hash, AVATAR_COLOR]
      );
    }
    created.push({ name, email });
  }

  return { dryRun, password: SEED_TUTOR_PASSWORD, created, existing };
}

module.exports = { seedTutors, TUTORS };
