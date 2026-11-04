import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Any fixed number works; it only has to be the same for every run.
// Two runs that ask for the same number wait for each other.
const LOCK_ID = 10_001;

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

// "001_baseline.sql" -> version "001", name "baseline"
const FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

const LEDGER_SQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
`;

async function loadMigrations() {
    const files = await readdir(MIGRATIONS_DIR);
    const migrations = [];

    for (const file of files) {
        if (!file.endsWith('.sql')) continue;

        const match = FILE_PATTERN.exec(file);
        if (!match) {
            throw new Error(`Bad migration file name "${file}". Use NNN_name.sql, e.g. 002_add_column.sql`);
        }

        // Normalize Windows line endings so the same file always hashes the same.
        const sql = (await readFile(new URL(file, MIGRATIONS_DIR), 'utf8')).replace(/\r\n/g, '\n');
        const checksum = createHash('sha256').update(sql).digest('hex');

        migrations.push({ version: match[1], name: match[2], file, sql, checksum });
    }

    // Compare as numbers, not strings.
    migrations.sort((a, b) => Number(a.version) - Number(b.version));

    for (let i = 1; i < migrations.length; i++) {
        if (migrations[i].version === migrations[i - 1].version) {
            throw new Error(`Two migrations share version ${migrations[i].version}`);
        }
    }

    return migrations;
}

// Applies every migration that isn't in the ledger yet.
// The caller owns `client`: it connects before, and releases or closes after.
// Returns the file names that were applied and skipped.
export async function runMigrations(client) {
    const applied = [];
    const skipped = [];

    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);

    try {
        await client.query(LEDGER_SQL);

        const migrations = await loadMigrations();
        const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
        const ledger = new Map(rows.map((r) => [r.version, r.checksum]));

        for (const m of migrations) {
            const recorded = ledger.get(m.version);

            if (recorded === m.checksum) {
                skipped.push(m.file);
                continue;
            }
            if (recorded !== undefined) {
                throw new Error(
                    `${m.file} was already applied, but its contents changed since then. ` +
                    'Never edit an applied migration; add a new one instead.'
                );
            }

            try {
                await client.query('BEGIN');
                await client.query(m.sql);
                await client.query(
                    'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
                    [m.version, m.name, m.checksum]
                );
                await client.query('COMMIT');
                applied.push(m.file);
            } catch (err) {
                await client.query('ROLLBACK');
                throw new Error(`${m.file} failed and was rolled back: ${err.message}`);
            }
        }
    } finally {
        // If the connection is already broken this can fail;
        // closing the connection releases the lock anyway.
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }

    return { applied, skipped };
}