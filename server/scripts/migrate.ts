import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Reads every .sql file in migrations/ in filename order, applies any that
 * haven't been recorded in schema_migrations yet (each inside its own
 * transaction), and records them as applied. Safe to run repeatedly and
 * safe to run during deployment — see GAME_DESIGN.md section "Migrations".
 */
async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const appliedRows = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.rows.map((r) => r.name));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found in', MIGRATIONS_DIR);
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip   ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`apply  ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed and was rolled back: ${(err as Error).message}`);
      }
    }

    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
