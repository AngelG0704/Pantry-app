import pool from './pool.js';
import { runMigrations } from './migrator.js';

// The command behind `npm run db:migrate`.
// The migration logic lives in migrator.js; this file only connects, prints, and closes.
async function main() {
    // One client for the whole run: advisory locks belong to a single connection.
    const client = await pool.connect();

    try {
        const { rows: [{ current_database: db }] } = await client.query('SELECT current_database()');
        console.log(`Database: ${db}`);
        console.log('Waiting for migration lock...');

        const { applied, skipped } = await runMigrations(client);

        for (const file of applied) console.log(`Applied  ${file}`);
        for (const file of skipped) console.log(`Skipped  ${file} (already applied)`);
        console.log(`Done. ${applied.length} applied, ${skipped.length} skipped.`);
    } finally {
        client.release();
        await pool.end();
    }
}
main().catch((err) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
});