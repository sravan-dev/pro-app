// MySQL data layer for TijusPro LMS.
//
// Replaces the previous synchronous better-sqlite3 access. Everything here is
// async (mysql2/promise). The `prepare(sql)` helper deliberately mirrors the
// shape better-sqlite3 used (`prepare(sql).get/all/run(...params)`) so the rest
// of the app converts with minimal churn — the only call-site change is adding
// `await`.
//
// Connection settings come from the environment (see .env.example). On
// Hostinger the app runs on the same host as MySQL, so DB_HOST=localhost.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tijuspro',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL || '10', 10),
  queueLimit: 0,
  // Return DATE/DATETIME columns as plain strings ('YYYY-MM-DD HH:MM:SS')
  // instead of JS Date objects, preserving the string semantics the app and
  // frontend relied on under SQLite.
  dateStrings: true,
  // Return DECIMAL/NUMERIC (e.g. AVG/ROUND/SUM results) as JS numbers rather
  // than strings, so `.toFixed()` and numeric comparisons keep working.
  decimalNumbers: true,
  // Needed for executing multi-statement schema files / SQL dumps via exec().
  multipleStatements: true,
  charset: 'utf8mb4',
};

let pool;
function getPool() {
  if (!pool) pool = mysql.createPool(CONFIG);
  return pool;
}

// ---- core helpers -------------------------------------------------------
async function all(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}
async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}
async function run(sql, params = []) {
  const [r] = await getPool().query(sql, params);
  // Map to the better-sqlite3 result shape the app expects.
  return { lastInsertRowid: r.insertId, changes: r.affectedRows };
}
// Multi-statement execution (schema files, SQL dumps). No params.
async function exec(sql) {
  await getPool().query(sql);
}

// better-sqlite3-style prepared-statement shim. Returns an object whose
// get/all/run accept positional params, exactly like the old API — just async.
function prepare(sql) {
  return {
    get: (...p) => get(sql, p),
    all: (...p) => all(sql, p),
    run: (...p) => run(sql, p),
  };
}

// Run `fn` inside a transaction. `fn` receives a handle with the same
// prepare()/get()/all()/run() API, but bound to the transaction's connection.
async function tx(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const handle = {
      all: async (sql, params = []) => (await conn.query(sql, params))[0],
      get: async (sql, params = []) => (await conn.query(sql, params))[0][0],
      run: async (sql, params = []) => {
        const [r] = await conn.query(sql, params);
        return { lastInsertRowid: r.insertId, changes: r.affectedRows };
      },
      prepare: (sql) => ({
        get: (...p) => conn.query(sql, p).then(([r]) => r[0]),
        all: (...p) => conn.query(sql, p).then(([r]) => r),
        run: (...p) => conn.query(sql, p).then(([r]) => ({ lastInsertRowid: r.insertId, changes: r.affectedRows })),
      }),
    };
    const out = await fn(handle);
    await conn.commit();
    return out;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// ---- schema / migrations / seed ----------------------------------------
async function columnExists(table, column) {
  const row = await get(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  return !!row;
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await exec(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

// Best-effort: create the target database if it doesn't exist. On managed hosts
// (e.g. Hostinger) the DB user often lacks CREATE-DATABASE privilege but the
// database already exists, so a failure here is non-fatal — we log and continue.
async function ensureDatabase() {
  try {
    const conn = await mysql.createConnection({
      host: CONFIG.host, port: CONFIG.port, user: CONFIG.user, password: CONFIG.password,
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
  } catch (err) {
    console.warn(`[db] could not ensure database '${CONFIG.database}' exists (continuing): ${err.message}`);
  }
}

// Create all tables (idempotent), apply column migrations for older databases,
// and seed default rows. Safe to call on every startup.
async function initSchema() {
  await ensureDatabase();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.mysql.sql'), 'utf8');
  await exec(schema);

  // Column migrations (no-ops on a fresh schema, which already has them; these
  // protect databases created before a column was added).
  await addColumnIfMissing('users', 'payout_rate', 'payout_rate DOUBLE DEFAULT 0');
  await addColumnIfMissing('users', 'payout_type', "payout_type VARCHAR(20) DEFAULT 'monthly'");
  await addColumnIfMissing('users', 'avatar_url', "avatar_url VARCHAR(512) DEFAULT ''");
  await addColumnIfMissing('app_settings', 'video_provider', "video_provider VARCHAR(20) DEFAULT 'livekit'");
  await addColumnIfMissing('app_settings', 'zoom_account_id', "zoom_account_id VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing('app_settings', 'zoom_client_id', "zoom_client_id VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing('app_settings', 'zoom_client_secret', "zoom_client_secret VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing('app_settings', 'hubspot_token', "hubspot_token TEXT");
  await addColumnIfMissing('meetings', 'host_name', "host_name VARCHAR(120) DEFAULT ''");
  await addColumnIfMissing('meetings', 'host_email', "host_email VARCHAR(160) DEFAULT ''");
  await addColumnIfMissing('smtp_settings', 'provider', "provider VARCHAR(20) DEFAULT 'smtp'");
  await addColumnIfMissing('smtp_settings', 'resend_api_key', "resend_api_key VARCHAR(255) DEFAULT ''");

  // Single-row settings defaults.
  await run("INSERT IGNORE INTO app_settings (id, currency) VALUES (1, 'INR')");

  // Default categories.
  const catCount = (await get("SELECT COUNT(*) AS n FROM categories")).n;
  if (catCount === 0) {
    for (const c of ['Technology', 'Marketing', 'Language', 'Design']) {
      await run("INSERT IGNORE INTO categories (name) VALUES (?)", [c]);
    }
  }

  await seedUsers();
}

async function seedUsers() {
  const usersCount = (await get("SELECT COUNT(*) AS n FROM users")).n;

  // Seed ONLY the superadmin into an empty users table, so a fresh database has
  // a working login. No demo student/tutor/manager/advisor accounts — those
  // only polluted the dashboard counts. (Only runs when the table is empty, so
  // it never resurrects a deleted admin on an existing install.)
  if (usersCount === 0) {
    await run(
      "INSERT IGNORE INTO users (name,email,portal,role,password_hash,avatar_color,must_change_password) VALUES (?,?,?,?,?,?,0)",
      ['Super Admin', 'admin@tijuspro.com', 'superadmin', 'superadmin', bcrypt.hashSync('admin123', 10), '#E97A2B']
    );
  }

  // One-time tutor seed (idempotent: only inserts emails that don't exist yet).
  const seedTutors = [
    ['Sreelekshmi', 'sreelekshmi@tijusacademy.in'],
    ['Arya', 'arya.krishnan@tijusacademy.in'],
    ['Chandana', 'chandana.sekhar@tijusacademy.in'],
    ['Mereena', 'mereena.james@tijusacademy.in'],
    ['Alka', 'alka.haridas@tijusacademy.in'],
    ['Gayathri', 'pr.gayathri@tijusacademy.in'],
    ['Devi', 'devikrishna@tijusacademy.in'],
    ['Sonia', 'sonia.william@tijusacademy.in'],
    ['Mahalekshmi', 'mahalekshmi@tijusacademy.in'],
    ['Aneesha', 'aneesha.s@tijusacademy.in'],
  ];
  const existing = new Set(
    (await all("SELECT email FROM users WHERE email IN (?)", [seedTutors.map((t) => t[1])])).map((r) => r.email)
  );
  const missing = seedTutors.filter(([, email]) => !existing.has(email));
  if (missing.length) {
    const hash = bcrypt.hashSync('Tijus@321', 10);
    for (const [name, email] of missing) {
      await run(
        "INSERT INTO users (name,email,portal,role,password_hash,avatar_color) VALUES (?,?,'tutor','tutor',?,?)",
        [name, email, hash, '#10B981']
      );
    }
    console.log(`[seed] created ${missing.length} tutor account(s)`);
  }
}

module.exports = { getPool, all, get, run, exec, prepare, tx, initSchema, columnExists, CONFIG };
