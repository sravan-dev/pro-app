// One-time data migration: copy every row from the legacy SQLite database
// (tijuspro.db) into the configured MySQL/MariaDB database.
//
// Reads the SQLite file with sql.js (pure WASM — no native build, works on any
// Node version), so this runs anywhere mysql2 can reach the target DB.
//
// Usage (run where tijuspro.db lives and MySQL is reachable):
//   1. Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in backend/.env
//      (for Hostinger remote: the public host + a whitelisted IP under
//       hPanel → Remote MySQL; for local testing: your local MySQL).
//   2. node backend/migrate-sqlite-to-mysql.js          (append --fresh to wipe first)
//
// It creates the schema first (via db.initSchema), then inserts the SQLite rows
// parent-first so references line up.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
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

  const SQL = await initSqlJs();
  const src = new SQL.Database(fs.readFileSync(SQLITE_PATH));

  // Read a whole table into [{col: value}, ...]; returns [] if it doesn't exist.
  const readTable = (name) => {
    let result;
    try { result = src.exec(`SELECT * FROM "${name}"`); } catch { return null; }
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  };

  const srcTableRows = src.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const srcTables = new Set(srcTableRows.length ? srcTableRows[0].values.map((v) => v[0]) : []);

  console.log('Ensuring MySQL schema...');
  await db.initSchema();

  if (fresh) {
    console.log('--fresh: truncating target tables...');
    await db.exec('SET FOREIGN_KEY_CHECKS=0');
    for (const t of [...TABLES].reverse()) {
      if (srcTables.has(t)) { try { await db.exec(`TRUNCATE TABLE \`${t}\``); } catch { /* ignore */ } }
    }
    await db.exec('SET FOREIGN_KEY_CHECKS=1');
  }

  await db.exec('SET FOREIGN_KEY_CHECKS=0');
  let grandTotal = 0;
  for (const table of TABLES) {
    if (!srcTables.has(table)) { console.log(`- ${table}: (not in source, skipped)`); continue; }
    const rows = readTable(table);
    if (!rows || !rows.length) { console.log(`- ${table}: 0 rows`); continue; }

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
