// express-session store backed by the user_sessions MySQL table.
//
// The default MemoryStore loses every session whenever the Node process
// restarts (deploys, crashes, host recycling), which shows up as random
// "Not authenticated" errors long before the cookie's maxAge is reached.
const session = require('express-session');
const db = require('./db');

const DEFAULT_TTL = 24 * 60 * 60 * 1000;

function expiresAt(sess) {
  const exp = sess && sess.cookie && sess.cookie.expires;
  return exp ? new Date(exp).getTime() : Date.now() + DEFAULT_TTL;
}

class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    // Sweep expired rows hourly; unref so it never keeps the process alive.
    setInterval(() => {
      db.run('DELETE FROM user_sessions WHERE expires < ?', [Date.now()]).catch(() => {});
    }, 60 * 60 * 1000).unref();
  }

  get(sid, cb) {
    db.get('SELECT data, expires FROM user_sessions WHERE sid=?', [sid])
      .then((row) => {
        if (!row || Number(row.expires) < Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    db.run(
      'INSERT INTO user_sessions (sid, user_id, data, expires) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), data=VALUES(data), expires=VALUES(expires)',
      [sid, (sess && sess.userId) || null, JSON.stringify(sess), expiresAt(sess)]
    ).then(() => cb(null), cb);
  }

  touch(sid, sess, cb = () => {}) {
    db.run('UPDATE user_sessions SET expires=? WHERE sid=?', [expiresAt(sess), sid])
      .then(() => cb(null), cb);
  }

  destroy(sid, cb = () => {}) {
    db.run('DELETE FROM user_sessions WHERE sid=?', [sid]).then(() => cb(null), cb);
  }
}

// Sign a user out everywhere (e.g. after their password changes), optionally
// keeping the session making the request.
function revokeUserSessions(userId, exceptSid = null) {
  return db.run('DELETE FROM user_sessions WHERE user_id=? AND sid<>?', [userId, exceptSid || '']);
}

module.exports = { MySQLSessionStore, revokeUserSessions };
