// Terminal entry point for the tutor seed in backend/seeds/tutors.js. On hosts
// without a shell, use the /seed page in the app instead. Run from the project
// root so .env (DB credentials) and node_modules resolve:
//
//   node backend/scripts/import-tutors.js --dry-run   # report, change nothing
//   node backend/scripts/import-tutors.js             # create the accounts

const db = require('../db');
const { seedTutors } = require('../seeds/tutors');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { created, existing, password } = await seedTutors({ dryRun });
  for (const t of created) console.log(`  ${dryRun ? 'would create' : 'created'}  ${t.name} <${t.email}>`);
  console.log('');
  console.log(`${dryRun ? '[dry run] ' : ''}${created.length} tutor(s) ${dryRun ? 'would be created' : 'created'}, ${existing.length} already existed.`);
  if (existing.length) console.log(`  existing (left untouched): ${existing.join(', ')}`);
  if (created.length && !dryRun) {
    console.log('');
    console.log(`Shared first-time password: ${password}`);
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
