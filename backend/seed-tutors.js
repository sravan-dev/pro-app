// One-time seed: add tutors with a shared password.
// Run on the server (where the DB lives):
//     node backend/seed-tutors.js
// Idempotent — emails that already exist are skipped; nothing else is touched.
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'tijuspro.db');
const PASSWORD = 'Tijus@321';

const tutors = [
  { name: 'Sreelekshmi', email: 'sreelekshmi@tijusacademy.in' },
  { name: 'Arya',        email: 'arya.krishnan@tijusacademy.in' },
  { name: 'Chandana',    email: 'chandana.sekhar@tijusacademy.in' },
  { name: 'Mereena',     email: 'mereena.james@tijusacademy.in' },
  { name: 'Alka',        email: 'alka.haridas@tijusacademy.in' },
  { name: 'Gayathri',    email: 'pr.gayathri@tijusacademy.in' },
  { name: 'Devi',        email: 'devikrishna@tijusacademy.in' },
  { name: 'Sonia',       email: 'sonia.william@tijusacademy.in' },
  { name: 'Mahalekshmi', email: 'mahalekshmi@tijusacademy.in' },
  { name: 'Aneesha',     email: 'aneesha.s@tijusacademy.in' },
];

const db = new Database(DB_PATH);
const hash = bcrypt.hashSync(PASSWORD, 10);
const exists = db.prepare('SELECT 1 FROM users WHERE email=?');
// Core columns only — status/payout_rate/payout_type/must_change_password use
// their column defaults (active / 0 / monthly / no forced change).
const insert = db.prepare(
  "INSERT INTO users (name,email,portal,role,password_hash,avatar_color) VALUES (?,?,?,?,?,?)"
);

let added = 0, skipped = 0;
for (const t of tutors) {
  if (exists.get(t.email)) { console.log('skip (exists):', t.email); skipped++; continue; }
  insert.run(t.name, t.email, 'tutor', 'tutor', hash, '#10B981');
  console.log('added:', t.name, '->', t.email);
  added++;
}
console.log(`\nDone. Added ${added}, skipped ${skipped}. Shared password: ${PASSWORD}`);
db.close();
