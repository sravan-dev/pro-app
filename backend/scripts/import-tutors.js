// One-off tutor import. Creates the tutor accounts listed in TUTORS below and
// does nothing else.
//
// Deliberately a script rather than a startup migration: a startup seed that
// re-inserted a fixed tutor list used to resurrect accounts an admin had
// deleted on every restart, which is why it was removed. Run this once, by
// hand, from the project root so .env (DB credentials) and node_modules
// resolve:
//
//   node backend/scripts/import-tutors.js --dry-run   # report, change nothing
//   node backend/scripts/import-tutors.js             # create the accounts
//
// Safe to re-run: an email that already exists is reported and skipped, never
// overwritten — so re-running never resets a password somebody has changed.
//
// Each new tutor gets role=tutor, the shared password below, and
// must_change_password=1, so the shared password stops working the moment they
// first sign in. This matches what the admin UI's "Add User" does.

const bcrypt = require('bcryptjs');
const db = require('../db');

const PASSWORD = 'Tijus@321!';
const AVATAR_COLOR = '#10B981';

// [name, phone, email] — exactly as supplied.
const TUTORS = [
  ['MEENU VARGHESE', '7025223157', 'meenuvarghese98@gmail.com'],
  ['SREE GANESHAN', '15878940527', 'sreeganeshganesh19@gmail.com'],
  ['AISWARYA RAJ', '9645578562', 'aiswaryarj@gmail.com'],
  ['XIMIS XAVIER', '9175961214', 'ximis.xavier@gmail.com'],
  ['ANU DOMINIC', '9971121148', 'anudominic@gmail.com'],
  ['MEGHA MANOJ', '8137016540', 'meghamanoj2966@gmail.com'],
  ['SILJITH U', '9746391752', 'siljithuppenggal30@gmail.com'],
  ['KARTHIKA', '9567330778', 'karthikagbalan@gmail.com'],
  ['MANASA RAMESH', '9048479904', 'manasanair8807@gmail.com'],
  // NOTE: the domain on this one reads 'tijuscademy.in', not 'tijusacademy.in'.
  // Imported as given — correct it in Tutor Management if it is a typo, or
  // password resets and invites will bounce.
  ['RISSY MARY MATHEW', '9567451358', 'rissy.mathew@tijuscademy.in'],
  ['FARZANA S', '9947276109', 'farzana.riswan@tijusacademy.in'],
  ['STAN', '6238006352', 'stan.sunny@tijusacademy.in'],
  ['NIKHIL ELIAS', '9995187206', 'nikhil.elias@tijusacademy.in'],
  ['ANU MARIA JOSE', '9497747230', 'anuribu@gmail.com'],
];

const dryRun = process.argv.includes('--dry-run');

async function main() {
  // The phone column arrives with the normal startup migrations; don't run
  // them from here, so a --dry-run really does write nothing.
  if (!(await db.columnExists('users', 'phone'))) {
    throw new Error('users.phone is missing — restart the backend once so the startup migrations run, then re-run this script.');
  }

  const emails = TUTORS.map(([, , email]) => email.trim().toLowerCase());
  const taken = new Set(
    (await db.all(`SELECT LOWER(email) AS email FROM users WHERE LOWER(email) IN (${emails.map(() => '?').join(',')})`, emails))
      .map((r) => r.email)
  );

  const hash = dryRun ? '' : bcrypt.hashSync(PASSWORD, 10);
  let created = 0;
  const skipped = [];

  for (const [rawName, rawPhone, rawEmail] of TUTORS) {
    const name = rawName.trim();
    const email = rawEmail.trim();
    const phone = rawPhone.trim();

    if (taken.has(email.toLowerCase())) {
      skipped.push(email);
      continue;
    }
    if (dryRun) {
      console.log(`  would create  ${name} <${email}>`);
      created++;
      continue;
    }
    await db.run(
      `INSERT INTO users (name,email,phone,portal,role,password_hash,avatar_color,payout_type,must_change_password)
       VALUES (?,?,?,'tutor','tutor',?,?,'shift',1)`,
      [name, email, phone, hash, AVATAR_COLOR]
    );
    console.log(`  created  ${name} <${email}>`);
    created++;
  }

  console.log('');
  console.log(`${dryRun ? '[dry run] ' : ''}${created} tutor(s) ${dryRun ? 'would be created' : 'created'}, ${skipped.length} already existed.`);
  if (skipped.length) console.log(`  existing (left untouched): ${skipped.join(', ')}`);
  if (created && !dryRun) {
    console.log('');
    console.log(`Shared first-time password: ${PASSWORD}`);
    console.log('Each tutor is forced to set their own password at first login.');
  }
}

main()
  .then(() => db.getPool().end())
  .catch(async (err) => {
    console.error('Import failed:', err.message);
    await db.getPool().end().catch(() => {});
    process.exitCode = 1;
  });
