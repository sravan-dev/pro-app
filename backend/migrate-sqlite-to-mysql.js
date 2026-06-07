// One-time data migration: copy every row from the legacy SQLite database
// (tijuspro.db) into the configured MySQL/MariaDB database.
//
// Usage (run locally, where tijuspro.db lives and MySQL is reachable):
//   1. Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in backend/.env
//      (point them at the target MySQL — for Hostinger remote, use the public
//       host + your whitelisted IP; for local testing, your local MySQL).
//   2. node backend/migrate-sqlite-to-mysql.js
//
// It creates the schema first (via db.initSchema), then inserts the SQLite
// rows. Tables are migrated parent-first so foreign-key-like references line up.
// Re-running is safe-ish: pass --fresh to TRUNCATE the MySQL tables first.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const db = require('./db');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'tijuspro.db');

// Insert order respects references (users before courses, etc.).
const TABLES = [
  'users',
  'categories',
  'courses',
  'enrollments',
  'sessions',
  'attendance_logs',
  'meeting_records',
  'signaling',
  'audit_logs',
  'password_resets',
  'smtp_settings',
  'course_materials',
  'course_material_managers',
  'meetings',
  'app_settings',
];

const RESERVED = new Set(['user']); // column names needing backticks
const col = (c) => '`' + c + '`';

async function main() {
  const fresh = process.argv.includes('--fresh');
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite file not found: ${SQLITE_PATH}`);
    process.exit(1);
  }

  console.log(`Source SQLite : ${SQLITE_PATH}`);
  console.log(`Target MySQL  : ${db.CONFIG.user}@${db.CONFIG.host}:${db.CONFIG.port}/${db.CONFIG.database}`);

  const src = new Database(SQLITE_PATH, { readonly: true });

  console.log('Ensuring MySQL schema...');
  await db.initSchema();

  // Which tables actually exist in the source?
  const srcTables = new Set(
    src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name)
  );

  if (fresh) {
    console.log('--fresh: truncating target tables...');
    await db.exec('SET FOREIGN_KEY_CHECKS=0');
    for (const t of [...TABLES].reverse()) {
      if (srcTables.has(t)) await db.exec(`TRUNCATE TABLE \`${t}\``).catch(() => {});
    }
    await db.exec('SET FOREIGN_KEY_CHECKS=1');
  }

  await db.exec('SET FOREIGN_KEY_CHECKS=0');
  let grandTotal = 0;
  for (const table of TABLES) {
    if (!srcTables.has(table)) { console.log(`- ${table}: (not in source, skipped)`); continue; }
    const rows = src.prepare(`SELECT * FROM "${table}"`).all();
    if (!rows.length) { console.log(`- ${table}: 0 rows`); continue; }

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => (RESERVED.has(c) ? col(c) : c)).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

    let n = 0;
    for (const row of rows) {
      const vals = cols.map((c) => {
        const v = row[c];
        return typeof v === 'bigint' ? Number(v) : v; // mysql2 handles null/number/string
      });
      try {
        await db.run(sql, vals);
        n++;
      } catch (err) {
        console.error(`  ! ${table} row failed: ${err.message}`);
      }
    }
    grandTotal += n;
    console.log(`- ${table}: ${n}/${rows.length} rows`);
  }
  await db.exec('SET FOREIGN_KEY_CHECKS=1');

  src.close();
  await db.getPool().end();
  console.log(`\nDone. Migrated ${grandTotal} rows total.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
