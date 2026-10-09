import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { resolveBust } from '../mafia/jail/bust';

const targetUsernameSchema = z.object({
  targetUsername: z.string().min(1, 'targetUsername is required.'),
});

/** Columns needed to resolve a bust, shared by both lock queries below —
 * same pattern as pvp.ts's USER_LOCK_COLUMNS. */
const USER_LOCK_COLUMNS =
  'id, username, state, dead_until, jail_until, hospital_until, successful_busts, failed_busts';

interface LockedUserRow {
  id: string;
  username: string;
  state: string;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  successful_busts: number;
  failed_busts: number;
}

/** Same pattern as CrimeError/WeaponError/PvpError/WitnessError — explicit
 * fields, manual assignment, so this file stays checkable with
 * `node --experimental-strip-types`. */
class JailError extends Error {
  statusCode: number;
  code: string;
  extra: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * Jail bust-outs (brief sections 24-26). `jail_until` itself is already set
 * elsewhere (crimes.ts sets it on a failed GTA) — this file is only the
 * bust-out action and its logging.
 *
 * Follows the same lock-both-rows-in-sorted-id-order pattern as pvp.ts's
 * kill transaction, for the same deadlock-safety reason, even though a
 * simultaneous *reverse* bust can't actually happen here (a jailed prisoner
 * can't bust anyone, and you can't bust yourself) — it costs nothing extra
 * and keeps this file consistent with the rest of the codebase.
 *
 * MVP choice worth flagging (also in GAME_DESIGN.md): no cost or cooldown
 * on a bust *attempt* itself — the brief doesn't specify one, so a buster
 * can retry immediately after a failure. Matches how search/start has no
 * stated cost either (see "Open questions" in GAME_DESIGN.md).
 */
export async function jailRoutes(app: FastifyInstance) {
  app.post('/api/v1/mafia/jail/bust', { preHandler: requireAuth }, async (request, reply) => {
    const busterId = request.user!.userId;
    const parsed = targetUsernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const prisonerLookup = await client.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(username) = lower($1)',
          [parsed.data.targetUsername]
        );
        const prisonerId = prisonerLookup.rows[0]?.id;
        if (!prisonerId) {
          throw new JailError(404, 'NOT_FOUND', 'No player with that username.');
        }
        if (prisonerId === busterId) {
          throw new JailError(400, 'CANNOT_BUST_SELF', "You can't bust yourself out.");
        }

        // Lock both rows in a deterministic (sorted-id) order — see the
        // header comment above for why, and pvp.ts for the precedent.
        const [firstId, secondId] = [busterId, prisonerId].sort();
        const firstLock = await client.query<LockedUserRow>(
          `SELECT ${USER_LOCK_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
          [firstId]
        );
        const secondLock = await client.query<LockedUserRow>(
          `SELECT ${USER_LOCK_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
          [secondId]
        );
        const byId = new Map<string, LockedUserRow>();
        for (const row of [...firstLock.rows, ...secondLock.rows]) byId.set(row.id, row);
        const buster = byId.get(busterId);
        const prisoner = byId.get(prisonerId);
        if (!buster || !prisoner) {
          throw new JailError(404, 'NOT_FOUND', 'User not found.');
        }

        const now = new Date();
        const busterStatus = deriveStatus(buster, now);
        if (busterStatus !== 'ALIVE') {
          throw new JailError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${busterStatus.toLowerCase()}.`);
        }

        const prisonerStatus = deriveStatus(prisoner, now);
        if (prisonerStatus !== 'JAIL') {
          throw new JailError(409, 'NOT_IN_JAIL', `${prisoner.username} isn't in jail right now.`);
        }

        // Real check, close to a no-op until travel ships — same caveat as
        // pvp.ts's state-matching checks (see "Open questions" #13).
        if (buster.state !== prisoner.state) {
          throw new JailError(
            409,
            'WRONG_STATE',
            `You need to be in ${prisoner.state} to bust ${prisoner.username} out.`
          );
        }

        const result = resolveBust(buster.successful_busts, buster.failed_busts);

        if (result.success) {
          await client.query('UPDATE users SET jail_until = NULL WHERE id = $1', [prisonerId]);
          await client.query(
            `UPDATE users SET
               cash = cash + $1,
               cash_earned = cash_earned + $1,
               successful_busts = successful_busts + 1
             WHERE id = $2`,
            [result.cashReward, busterId]
          );
        } else {
          await client.query('UPDATE users SET failed_busts = failed_busts + 1 WHERE id = $1', [busterId]);
        }

        await client.query(
          `INSERT INTO busts (buster_id, prisoner_id, success, cash_reward, state)
           VALUES ($1, $2, $3, $4, $5)`,
          [busterId, prisonerId, result.success, result.cashReward, prisoner.state]
        );

        return {
          success: result.success,
          cashReward: result.cashReward,
          prisonerUsername: prisoner.username,
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof JailError) {
        return reply.code(err.statusCode).send({
          ok: false,
          error: { code: err.code, message: err.message, ...err.extra },
        });
      }
      throw err;
    }
  });
}
