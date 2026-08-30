// One-time fix: old attendance_logs were recorded on the server's UTC clock
// while sessions are scheduled in IST (Asia/Kolkata, +5:30). That 5h30 gap made
// the payroll clamp discard every session as "not taken" (zero pay). This shifts
// the UTC rows forward +5:30 so they land inside their scheduled window.
//
// Only rows that are clearly UTC are touched: the join is >60 min BEFORE the
// session's scheduled start (a genuine same-clock join is at/after start, never
// hours before). Already-correct rows are left alone, so re-running is a no-op.
//
// Usage (from backend/, where .env with DB creds lives):
//   node scripts/fix-attendance-tz.js            # dry run — preview only
//   node scripts/fix-attendance-tz.js --apply    # actually write
//
// BACK UP FIRST:
//   mysqldump -u USER -p DBNAME attendance_logs > att_bak.sql

const db = require('../db');

// +5:30 offset. Override for another zone, e.g. OFFSET_MINUTES=480 for +8:00.
const OFFSET_MINUTES = parseInt(process.env.OFFSET_MINUTES || '330', 10);
const APPLY = process.argv.includes('--apply');

// A row is "UTC / needs shifting" when its join is more than THRESHOLD minutes
// before the scheduled start. Kept below OFFSET so a correctly-clocked early
// join (a few minutes) never matches, but the full offset always does.
const THRESHOLD = 60;

const MATCH = `
  a.join_time IS NOT NULL
  AND TIMESTAMPDIFF(
        MINUTE,
        a.join_time,
        STR_TO_DATE(REPLACE(SUBSTRING(s.start_time,1,16),'T',' '), '%Y-%m-%d %H:%i')
      ) > ${THRESHOLD}
`;

async function main() {
  const preview = await db.all(
    `SELECT a.log_id, a.session_id, a.student_id,
            s.start_time AS sched_start,
            a.join_time  AS old_join,
            DATE_ADD(a.join_time, INTERVAL ? MINUTE) AS new_join,
            a.leave_time AS old_leave,
            CASE WHEN a.leave_time IS NULL THEN NULL
                 ELSE DATE_ADD(a.leave_time, INTERVAL ? MINUTE) END AS new_leave
     FROM attendance_logs a
     JOIN sessions s ON s.session_id = a.session_id
     WHERE ${MATCH}
     ORDER BY a.session_id, a.log_id`,
    [OFFSET_MINUTES, OFFSET_MINUTES]
  );

  console.log(`Offset: +${OFFSET_MINUTES} min. Rows matching (UTC, need shift): ${preview.length}`);
  for (const r of preview) {
    console.log(
      `  log ${r.log_id} sess ${r.session_id} sched ${r.sched_start} | ` +
      `join ${r.old_join} -> ${r.new_join} | leave ${r.old_leave || '-'} -> ${r.new_leave || '-'}`
    );
  }

  if (!preview.length) {
    console.log('Nothing to do. (Already fixed, or no matching rows.)');
    return;
  }

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to write these changes.');
    return;
  }

  const res = await db.run(
    `UPDATE attendance_logs a
     JOIN sessions s ON s.session_id = a.session_id
     SET a.join_time  = DATE_ADD(a.join_time,  INTERVAL ? MINUTE),
         a.leave_time = CASE WHEN a.leave_time IS NULL THEN NULL
                             ELSE DATE_ADD(a.leave_time, INTERVAL ? MINUTE) END
     WHERE ${MATCH}`,
    [OFFSET_MINUTES, OFFSET_MINUTES]
  );
  console.log(`\nApplied. Rows updated: ${res.changes}`);
}

main()
  .then(() => db.getPool().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
