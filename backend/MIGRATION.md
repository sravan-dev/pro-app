# Database & Deployment (MySQL / MariaDB)

The backend runs on **MySQL/MariaDB**. SQLite (and `better-sqlite3`) have been
fully removed.

## Architecture

- `backend/db.js` — MySQL data layer (mysql2 pool). Async `prepare().get/all/run`,
  `tx()` for transactions, `initSchema()` for setup/seed. On boot it runs
  `CREATE DATABASE IF NOT EXISTS` (best-effort), creates tables from
  `schema.mysql.sql`, applies column migrations, and seeds the superadmin +
  the academy tutor accounts.
- `backend/schema.mysql.sql` — the schema.
- `backend/server.js` — all queries are async.

## 1. Configure

Copy `backend/.env.example` to `backend/.env` and fill in:

```
DB_HOST=localhost          # on Hostinger the app and MySQL share a host
DB_PORT=3306
DB_USER=u314034055_lms
DB_PASSWORD=********        # your (rotated) password
DB_NAME=u314034055_lms
SESSION_SECRET=<long random string>
```

## 2. Run

```
npm install          # all pure-JS dependencies, no native build step
npm run build        # build the frontend
npm start            # boots, creates schema + seeds on an empty DB
```

First boot on an empty database seeds only the **superadmin**
(`admin@tijuspro.com` / `admin123` — change it immediately) plus the academy
tutor accounts. No demo student/tutor/manager/advisor accounts are created.

## 3. Deploy on Hostinger

1. Use a plan with **Node.js** support (VPS/Cloud — most shared plans are
   PHP-only). Start command: `npm start`.
2. Create the MySQL database + user in hPanel.
3. Set the environment variables from step 1 in the Node app settings.
4. `npm install --omit=dev` then `npm run build`, then start.

## Backups

Use **Settings → Export Database** to download a `.sql` dump, and **Import
Database** to restore one (it executes the dump and replaces current data —
there is no automatic server-side backup, so export first).
