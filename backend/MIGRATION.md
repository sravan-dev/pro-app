# SQLite → MySQL migration (Hostinger)

The backend now runs on **MySQL/MariaDB** instead of SQLite. This guide covers
moving your existing data and deploying on Hostinger.

## What changed

- `backend/db.js` — new MySQL data layer (mysql2 pool). Async `prepare().get/all/run`,
  plus `tx()` for transactions and `initSchema()` for setup/seed.
- `backend/schema.mysql.sql` — MySQL schema (translated from the SQLite one).
- `backend/server.js` — every query is now `await`ed; SQL dialect translated
  (`datetime('now')`, `julianday` math, `INSERT OR IGNORE`, `ON CONFLICT`, etc.).
- `backend/migrate-sqlite-to-mysql.js` — one-time data copy from `tijuspro.db`,
  reading the SQLite file with **`sql.js`** (pure WASM, no native build).
- `mysql2` added to dependencies. `better-sqlite3` (native) was **removed** — it
  doesn't build on newer Node, and nothing needs it anymore. `sql.js` is a
  devDependency used only by the migration script.

## Status

- **Validated locally against MySQL**: schema creation, full data migration
  (all rows from `tijuspro.db`), login, the superadmin dashboard aggregates,
  inserts, transactions, and reports all return correct JSON. Re-test against
  your own DB/host before production.

## Important caveats

- On first boot the server runs `CREATE DATABASE IF NOT EXISTS` (best-effort).
  On Hostinger the DB user may lack that privilege, but the database already
  exists, so it's a no-op — make sure `DB_NAME` matches your existing database.
- The **binary `.db` export/import** (Settings → Database) is SQLite-only and is
  now disabled. Use **Export SQL / import a `.sql` dump** instead. There is no
  automatic backup on import for MySQL — take a SQL export first.
- **Rotate the DB password** you shared — it has been exposed in chat.

## 1. Configure the connection

Copy `backend/.env.example` to `backend/.env` and fill in:

```
DB_HOST=localhost          # on Hostinger the app and MySQL share a host
DB_PORT=3306
DB_USER=u314034055_lms
DB_PASSWORD=********        # your (rotated) password
DB_NAME=u314034055_lms
SESSION_SECRET=<long random string>
```

## 2. Migrate the existing data

Run this **where `tijuspro.db` lives and MySQL is reachable**. For migrating
into Hostinger from your machine, you must first enable **hPanel → Databases →
Remote MySQL** and whitelist your IP, then set `DB_HOST` to the public host
Hostinger shows. (If remote access isn't possible, do step 2 locally against a
local MySQL, then `Export SQL` and import the dump in Hostinger's phpMyAdmin.)

```
npm run migrate:mysql            # creates schema, then copies all rows
# or wipe target tables first:
node backend/migrate-sqlite-to-mysql.js --fresh
```

You should see per-table row counts (users: 5, categories: 4, etc.).

## 3. Test locally (recommended before deploying)

With a local MySQL/MariaDB (or Docker `mysql:8`):

```
# create the database, point backend/.env at it, then:
npm run migrate:mysql
npm start
# open http://localhost:8000 and log in
```

## 4. Deploy on Hostinger

1. Ensure the plan has **Node.js** support (VPS/Cloud — most shared plans are
   PHP-only). Set the app's start command to `node backend/server.js` (or
   `npm start`).
2. Create the MySQL database + user in hPanel (you already have these).
3. Set the environment variables from step 1 in the Node app's settings.
4. Install dependencies (all pure-JS now — no native build step):
   ```
   npm install --omit=dev
   ```
5. Build the frontend (`npm run build`) and start the app. On first boot
   `initSchema()` creates the tables and seeds the default admin if the DB is
   empty — but if you ran step 2, your real data is already there.

## Rollback

The old SQLite file (`backend/tijuspro.db`) is untouched. To revert, restore the
previous `server.js`/`package.json` from git and run on SQLite again.
