// One-off, idempotent seed: OET tutors with a 120 payout rate + an OET course.
//
// Re-runnable safely — existing tutors (these 5 are also in db.js's tutor seed)
// are updated in place, and each tutor's OET course is only created if missing.
//
// Run from the project root so .env (DB credentials) and node_modules resolve:
//   node backend/scripts/seed-oet-tutors.js
//
// Each tutor is set to: role=tutor, password "password123" (usable immediately,
// no forced change), payout_rate 120, specialization "OET", and given their own
// "OET" course (courses hold a single tutor_id, so one course per tutor).

const bcrypt = require('bcryptjs');
const db = require('../db');

const PASSWORD = 'password123';
const PAYOUT_RATE = 120;
const PAYOUT_TYPE = 'monthly';
const COURSE_NAME = 'OET';
const COURSE_CATEGORY = 'Language';

// [display name, email] — names normalised to match the existing tutor seed.
const TUTORS = [
  ['Sreelekshmi', 'sreelekshmi@tijusacademy.in'],
  ['Chandana', 'chandana.sekhar@tijusacademy.in'],
  ['Mereena', 'mereena.james@tijusacademy.in'],
  ['Mahalekshmi', 'mahalekshmi@tijusacademy.in'],
  ['Aneesha', 'aneesha.s@tijusacademy.in'],
];

async function main() {
  const hash = bcrypt.hashSync(PASSWORD, 10);

  for (const [name, email] of TUTORS) {
    const existing = await db.get('SELECT id FROM users WHERE email=?', [email]);
    let tutorId;

    if (existing) {
      tutorId = existing.id;
      await db.run(
        `UPDATE users SET name=?, role='tutor', portal='tutor', specialization='OET',
           payout_rate=?, payout_type=?, status='active',
           password_hash=?, must_change_password=0
         WHERE id=?`,
        [name, PAYOUT_RATE, PAYOUT_TYPE, hash, tutorId]
      );
      console.log(`✓ updated tutor  ${name} <${email}>  (#${tutorId})`);
    } else {
      const r = await db.run(
        `INSERT INTO users (name,email,portal,role,specialization,payout_rate,payout_type,status,avatar_color,password_hash,must_change_password)
         VALUES (?,?, 'tutor','tutor','OET', ?, ?, 'active', '#10B981', ?, 0)`,
        [name, email, PAYOUT_RATE, PAYOUT_TYPE, hash]
      );
      tutorId = r.lastInsertRowid;
      console.log(`✓ created tutor  ${name} <${email}>  (#${tutorId})`);
    }

    // Ensure this tutor owns an "OET" course (one per tutor — courses.tutor_id
    // is a single owner).
    const course = await db.get('SELECT id FROM courses WHERE name=? AND tutor_id=?', [COURSE_NAME, tutorId]);
    if (course) {
      console.log(`    · OET course already present (#${course.id})`);
    } else {
      const cr = await db.run(
        `INSERT INTO courses (name,category,tutor_id,icon,color,status) VALUES (?,?,?, 'book','#3B82F6','active')`,
        [COURSE_NAME, COURSE_CATEGORY, tutorId]
      );
      console.log(`    · created OET course (#${cr.lastInsertRowid})`);
    }
  }

  console.log(`\nDone — ${TUTORS.length} OET tutors seeded (payout ${PAYOUT_RATE}/${PAYOUT_TYPE}, password "${PASSWORD}").`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
