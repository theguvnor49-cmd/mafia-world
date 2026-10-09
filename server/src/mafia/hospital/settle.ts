import type { Pool, PoolClient } from 'pg';
import { HOSPITAL } from '../config';

/**
 * Lazily transitions a player from an expired DEAD timer into a HOSPITAL
 * recovery window — the free/natural path out of death now has a second,
 * shorter stage (see GAME_DESIGN.md section 22). Premium-point revive
 * (routes/pvp.ts) is unaffected and still skips straight to fully ALIVE;
 * this only ever fires for a death nobody paid to skip.
 *
 * A conditional UPDATE, same shape as every other lazy transition in this
 * codebase (coop job creation/resolution, heat decay) — safe to call on
 * every authenticated request because it's a no-op unless `dead_until`
 * has actually passed, and it's naturally idempotent: the WHERE clause
 * stops matching the instant it has run once for a given player.
 *
 * Deliberately lives in `mafia/` rather than `routes/` (unlike coop's
 * equivalent helpers in `routes/coop.ts`) specifically so both
 * `auth.ts` (which must run this before *every* protected route, for the
 * requesting player) and `routes/pvp.ts` (which must also run it for a
 * kill's *target*, who isn't the one making the request) can import it
 * without either one importing the other — a route file importing from
 * `auth.ts`, or `auth.ts` importing from a route file, would risk a
 * circular import.
 *
 * Takes `now` explicitly (default `new Date()`) so a caller that's
 * already computed `now` once for a transaction (crimes.ts, pvp.ts, ...)
 * can pass the exact same instant through, rather than risking a
 * split-second mismatch between two separately-taken clock readings.
 *
 * Returns the `hospital_until` value it wrote, or `null` if the player
 * wasn't actually past an expired death (nothing to settle) — so a caller
 * that already has an in-memory copy of the row (pvp.ts's kill
 * transaction) can patch it in place instead of re-querying.
 */
export async function settleDeathIntoHospital(
  db: Pool | PoolClient,
  userId: string,
  now: Date = new Date()
): Promise<Date | null> {
  const hospitalUntil = new Date(now.getTime() + HOSPITAL.RECOVERY_HOURS * 3600 * 1000);
  const result = await db.query(
    `UPDATE users SET dead_until = NULL, hospital_until = $1
     WHERE id = $2 AND dead_until IS NOT NULL AND dead_until <= $3`,
    [hospitalUntil, userId, now]
  );
  return (result.rowCount ?? 0) > 0 ? hospitalUntil : null;
}
