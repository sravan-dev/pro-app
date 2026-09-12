# TijusPro LMS

A learning-management system for Tiju's Academy: courses and enrolments, live
classes with recording, attendance, payroll, support tickets and CRM contact
sync — in one Node + React app.

## Stack

- **Backend** — Node.js (>= 18), Express, MySQL/MariaDB (`mysql2`), session
  cookies, `nodemailer` for mail, `multer` for uploads.
- **Frontend** — React 19 + Vite, React Router, plain CSS (`src/tijusPro.css`).
- **Video** — built-in WebRTC mesh for small calls, or a LiveKit SFU for
  webinar-sized sessions. Chosen per install in Settings.

## Roles

Five roles, each with its own portal: **superadmin**, **manager**, **advisor**,
**tutor** and **student**.

| Area | What it does |
| --- | --- |
| Courses | Courses, categories, materials, per-course material managers |
| Enrolments | Students on courses, progress and grades, bulk invites |
| Sessions | Scheduling, a calendar, tutor availability and student booking |
| Live classes | Camera, mic, screen share, whiteboard, raise hand, waiting room, recording |
| Meetings | Throwaway link + 5-digit passcode rooms for guests, no account needed |
| Attendance | Per-session student logs; staff clock-in for advisors and managers |
| Payroll | Per-hour pay at the rate of the shift the work fell in, monthly runs |
| Tickets | Student support tickets with replies and escalation |
| Ratings | Student ratings of tutors, and per-team views |
| Integrations | HubSpot and Kajabi contacts, SMTP or Resend mail, LiveKit |

## Layout

```
backend/
  server.js           all API routes
  db.js               MySQL pool, schema init, column migrations, seeding
  schema.mysql.sql    the schema
  uploads/            default upload dir (override with UPLOADS_ROOT)
frontend/
  src/portals/        one portal per role
  src/components/     rooms, tables, modals, shared UI
  src/api.js          every API call the frontend makes
docs/                 workflow documents
```

## Running it locally

You need Node 18+ and a MySQL/MariaDB you can reach.

```bash
npm install                      # backend dependencies
cp backend/.env.example backend/.env
# edit backend/.env: DB_* and SESSION_SECRET at minimum
npm run dev                      # backend on :8000, Vite on :5173
```

Open http://localhost:5173. Vite proxies `/api` and `/uploads` to the backend.

`./run.sh` does the same on a Unix shell, installing dependencies first if they
are missing.

On first boot against an empty database the schema is created and a superadmin
is seeded: **admin@tijuspro.com / admin123**. Change that password immediately.

## Configuration

All settings live in `backend/.env` — see `backend/.env.example` for the full
list with comments.

| Variable | Purpose |
| --- | --- |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` `DB_POOL` | MySQL connection |
| `PORT` | API port (default 8000) |
| `SESSION_SECRET` | Session cookie secret — set a long random string |
| `UPLOADS_ROOT` | Absolute path for recordings, materials and avatars. Point it **outside** the deployed tree, or deploys wipe it |
| `LIVEKIT_URL` `LIVEKIT_API_KEY` `LIVEKIT_API_SECRET` | Optional LiveKit fallback; a server added in Settings overrides these without a restart |
| `HUBSPOT_TOKEN` | Optional default HubSpot private-app token |
| `KAJABI_CLIENT_ID` `KAJABI_CLIENT_SECRET` `KAJABI_API_BASE` | Optional Kajabi defaults |
| `APP_TZ` | Academy timezone for attendance and payroll (default `Asia/Kolkata`) |

## Deploying

```bash
npm install
npm run build     # builds the frontend into frontend/dist
npm start         # serves the API and the built frontend
```

The backend creates missing tables and applies column migrations on every boot,
so **restart it after deploying** when a release adds a table or column.
`backend/MIGRATION.md` covers the database setup and migration from the old
SQLite build.

## Live video

Sessions use whichever provider is set in Settings → Video:

- **WebRTC** — peer-to-peer mesh, no extra service, good for 1-on-1 and small
  groups.
- **LiveKit** — an SFU for 50–100+ participants. Add a LiveKit Cloud project or
  a self-hosted server under Settings; it takes effect without a restart.
  Students knock at a waiting room and a host admits them; hosts can mute
  participants, grant stage access, share a whiteboard and record the session.

Browsers only allow a microphone or camera on `https` (or `localhost`), so
serve the app over TLS anywhere real.
