import { Pool, type PoolClient } from 'pg';
import { env } from './config';

/**
 * Single shared connection pool for the whole process. Every query in the
 * app should go through `pool` (or `withTransaction` below) rather than
 * opening its own client.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Managed providers like Supabase require SSL; local dev usually doesn't have it.
  ssl: env.NODE_ENV === 'production' || env.DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  // A background/idle client hit an error — log it, don't crash the process.
  console.error('Unexpected error on idle Postgres client', err);
});

/**
 * Runs `fn` inside a BEGIN/COMMIT transaction on a single client, rolling
 * back on any thrown error. Use this for anything that touches currency,
 * combat, inventory, or any other multi-step write that must be atomic
 * (see GAME_DESIGN.md section "Security & transactions").
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
