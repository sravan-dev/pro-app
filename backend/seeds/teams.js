// Sales team seed. Creates the four sales teams, each with its team manager
// (role=manager, set as the team's manager) and advisors (role=advisor, placed
// in the team). Run from the /seed page (superadmin only).
//
// The shared first-time password is typed on the /seed page, never stored in
// the repo. New accounts get must_change_password=1, like the admin UI's
// "Add User".
//
// Safe to re-run: an existing email is never re-created and keeps its password
// and role. An existing advisor with no team is placed in the team; one already
// in another team is left there and reported. A team that already exists is
// reused — matched loosely, so 'Champions Team' finds an existing 'Champion' —
// and its manager is set to this team manager.

const bcrypt = require('bcryptjs');
const db = require('../db');

const AVATAR_COLOR = '#E97A2B';

// 'Champions Team' / 'Champion' / 'champions' → 'champion'.
const teamKey = (n) => String(n || '').toLowerCase().replace(/team/g, '').replace(/[^a-z0-9]+/g, '').replace(/s$/, '');

// [name, phone, email] — as supplied.
const TEAMS = [
  {
    name: 'Winners Team',
    manager: ['Sreelekshmi', '7356679910', 'sreelekshmi@tijusacademy.in'],
    advisors: [
      ['Anu MR', '8089183337', 'anu@tijusacademy.in'],
      ['Arya', '8136917778', 'arya.krishnan@tijusacademy.in'],
      ['Anitha', '8714119910', 'anitha.s@tijusacademy.in'],
      ['Ashna', '8089143338', 'ashna.mol@tijusacademy.in'],
    ],
  },
  {
    name: 'Champions Team',
    manager: ['Chandana', '8714624451', 'chandana.sekhar@tijusacademy.in'],
    advisors: [
      ['Aswathy', '8891192236', 'aswathy.krishnan@tijusacademy.in'],
      ['Mereena', '8089183339', 'mereena.james@tijusacademy.in'],
      ['Alka', '8089183331', 'alka.haridas@tijusacademy.in'],
      ['Gayathri', '9539550753', 'pr.gayathri@tijusacademy.in'],
    ],
  },
  {
    name: 'Fighters Team',
    manager: ['Devi', '8139865997', 'devikrishna@tijusacademy.in'],
    advisors: [
      ['Sonia W', '8891192235', 'sonia.william@tijusacademy.in'],
      ['Mahalekshmi', '8089153336', 'mahalekshmi@tijusacademy.in'],
      ['Aneesha', '7994618743', 'aneesha.s@tijusacademy.in'],
    ],
  },
  {
    name: 'Warriors Team',
    manager: ['Sreerenjini', '7356519910', 'sreerenjini@tijusacademy.in'],
    advisors: [
      ['Rekha', '8089133370', 'rekha.raveendran@tijusacademy.in'],
      ['Vishnuja B', '8089182228', 'vishnuja@tijusacademy.in'],
      ['Nandana', '8089134442', 'nandhana.sivakumar@tijusacademy.in'],
      ['Aleena', '8136937778', 'annaroyaleena@gmail.com'],
    ],
  },
];

// Returns { dryRun, teams: [{ name, team: 'created'|'existing', previous_manager, manager: {...}, advisors: [{...}] }] }
// where each person is { name, email, role, status } and status is one of
// created | existing | team_set | other_team (team holds that other team's name).
async function seedTeams({ dryRun = false, password = '' } = {}) {
  if (!(await db.columnExists('users', 'team_id'))) {
    throw new Error('users.team_id is missing — restart the backend once so the startup migrations run, then try again.');
  }
  if (!dryRun && String(password).length < 8) throw new Error('Enter a first-time password of at least 8 characters.');
  const hash = dryRun ? '' : bcrypt.hashSync(String(password), 10);

  const findUser = (email) => db.get("SELECT id, role, team_id FROM users WHERE LOWER(email)=?", [email.toLowerCase()]);
  const createUser = async (name, phone, email, role, teamId) => {
    if (dryRun) return null;
    const r = await db.run(
      `INSERT INTO users (name,email,phone,portal,role,password_hash,avatar_color,team_id,payout_type,must_change_password)
       VALUES (?,?,?,?,?,?,?,?,'shift',1)`,
      [name, email, phone, role, role, hash, AVATAR_COLOR, teamId]);
    return r.lastInsertRowid;
  };

  const allTeams = await db.all("SELECT t.id, t.name, t.manager_id, u.name AS manager_name FROM teams t LEFT JOIN users u ON u.id=t.manager_id");
  const out = [];
  for (const t of TEAMS) {
    const report = { name: t.name, team: 'existing', previous_manager: null, manager: null, advisors: [] };

    // Manager first, so the team can point at them.
    const [mName, mPhone, mEmail] = t.manager;
    const mRow = await findUser(mEmail);
    const managerId = mRow ? mRow.id : await createUser(mName, mPhone, mEmail, 'manager', null);
    report.manager = { name: mName, email: mEmail, role: mRow ? mRow.role : 'manager', status: mRow ? 'existing' : 'created' };

    let team = allTeams.find((x) => teamKey(x.name) === teamKey(t.name));
    if (!team) {
      report.team = 'created';
      team = { id: dryRun ? null : (await db.run("INSERT INTO teams (name, manager_id) VALUES (?,?)", [t.name, managerId])).lastInsertRowid, manager_id: managerId };
    } else {
      report.name = team.name; // keep the existing team's name
      if (team.manager_id !== managerId) {
        report.previous_manager = team.manager_name || null;
        if (!dryRun) await db.run("UPDATE teams SET manager_id=? WHERE id=?", [managerId, team.id]);
      }
    }

    for (const [name, phone, email] of t.advisors) {
      const row = await findUser(email);
      if (!row) {
        await createUser(name, phone, email, 'advisor', team.id);
        report.advisors.push({ name, email, role: 'advisor', status: 'created' });
      } else if (!row.team_id || (team.id && row.team_id === team.id)) {
        if (!row.team_id && !dryRun) await db.run("UPDATE users SET team_id=? WHERE id=?", [team.id, row.id]);
        report.advisors.push({ name, email, role: row.role, status: row.team_id ? 'existing' : 'team_set' });
      } else {
        const other = await db.get("SELECT name FROM teams WHERE id=?", [row.team_id]);
        report.advisors.push({ name, email, role: row.role, status: 'other_team', team: other ? other.name : `#${row.team_id}` });
      }
    }
    out.push(report);
  }
  return { dryRun, teams: out };
}

module.exports = { seedTeams, TEAMS };
