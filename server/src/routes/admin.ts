import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { requireAuth, requireAdmin } from '../auth';
import { getRankForXp } from '../mafia/ranks';
import { deriveStatus } from '../mafia/status';

/** Same pattern as every other route file's error class. */
class AdminError extends Error {
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

interface FullUserRow {
  id: string;
  username: string;
  email: string;
  created_at: string;
  last_seen: string;
  state: string;
  cash: string;
  premium_points: number;
  mafia_xp: string;
  bullets: number;
  heat: number;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  crimes_committed: number;
  crimes_succeeded: number;
  crimes_failed: number;
  kills: number;
  deaths: number;
  cash_earned: string;
  cash_lost: string;
  times_arrested: number;
  successful_busts: number;
  failed_busts: number;
  is_admin: boolean;
}

const FULL_USER_COLUMNS = `
  id, username, email, created_at, last_seen, state, cash, premium_points, mafia_xp, bullets, heat,
  dead_until, jail_until, hospital_until, crimes_committed, crimes_succeeded, crimes_failed, kills, deaths,
  cash_earned, cash_lost, times_arrested, successful_busts, failed_busts, is_admin
`;

function toDetail(user: FullUserRow) {
  const rank = getRankForXp(Number(user.mafia_xp));
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
    lastSeen: user.last_seen,
    state: user.state,
    cash: Number(user.cash),
    premiumPoints: user.premium_points,
    mafiaXp: Number(user.mafia_xp),
    rank: rank.name,
    bullets: user.bullets,
    heat: user.heat,
    status: deriveStatus(user),
    deadUntil: user.dead_until,
    jailUntil: user.jail_until,
    hospitalUntil: user.hospital_until,
    isAdmin: user.is_admin,
    stats: {
      crimesCommitted: user.crimes_committed,
      crimesSucceeded: user.crimes_succeeded,
      crimesFailed: user.crimes_failed,
      kills: user.kills,
      deaths: user.deaths,
      cashEarned: Number(user.cash_earned),
      cashLost: Number(user.cash_lost),
      timesArrested: user.times_arrested,
      successfulBusts: user.successful_busts,
      failedBusts: user.failed_busts,
    },
  };
}

async function lockUserByUsername(client: PoolClient, username: string): Promise<FullUserRow> {
  const result = await client.query<FullUserRow>(
    `SELECT ${FULL_USER_COLUMNS} FROM users WHERE lower(username) = lower($1) FOR UPDATE`,
    [username]
  );
  const user = result.rows[0];
  if (!user) throw new AdminError(404, 'NOT_FOUND', 'No player with that username.');
  return user;
}

async function logAction(
  client: PoolClient,
  adminId: string,
  targetUserId: string,
  actionType: 'grant_cash' | 'grant_premium_points' | 'clear_status',
  amount: number | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    'INSERT INTO admin_actions (admin_id, target_user_id, action_type, amount, detail) VALUES ($1, $2, $3, $4, $5)',
    [adminId, targetUserId, actionType, amount, JSON.stringify(detail)]
  );
}

const grantSchema = z.object({
  // Signed and non-zero: positive grants, negative is a correcting
  // deduction (e.g. undoing a bug's over-payment) — the existing
  // CHECK (cash >= 0) / CHECK (premium_points >= 0) constraints on
  // `users` are what actually stop an over-deduction, not app logic,
  // same "let the database enforce the invariant" approach as
  // businesses' one-per-type-per-owner cap.
  amount: z.number().int().refine((n) => n !== 0, 'amount must not be zero.'),
});

/**
 * Admin tools (Phase 13). The brief gives almost nothing to build from
 * here beyond one passing mention — "[premium points are] granted/
 * admin-controlled" (section 15/27) — so this is an MVP scope call, not a
 * brief-literal build, same treatment as every other under-specified
 * phase in this project:
 *
 *   - **Scope is deliberately narrow**: look up any player's full state,
 *     grant/deduct cash or premium points, and clear a stuck status
 *     (dead/jail/hospital). No ban/suspend system — the brief never
 *     mentions moderation at all, so nothing was invented for it.
 *   - **No self-service "promote to admin" endpoint exists anywhere.**
 *     `is_admin` is granted by whoever controls the database running a
 *     direct `UPDATE users SET is_admin = true WHERE username = '...'`
 *     (documented in README.md) — seeded that way specifically to avoid
 *     building a privilege-escalation surface with zero brief guidance
 *     on who should be allowed to grant admin in the first place. These
 *     routes manage *players*, never *who holds admin*.
 *   - **Grants don't touch `cash_earned`/`cash_lost`.** Those stats
 *     represent real gameplay income/loss (see "Open questions" #9) —
 *     an admin correction is neither, so it's logged to `admin_actions`
 *     instead of blending into a player's own earned/lost totals.
 *   - **`requireAdmin` re-checks the database on every request** rather
 *     than trusting a JWT claim, so revoking admin access takes effect
 *     on the very next request, not after a 7-day token expires (see
 *     its doc comment in `auth.ts`).
 *   - **Every write here is logged** to `admin_actions` (admin, target,
 *     action, amount, timestamp) — the same "financial operations stay
 *     traceable" principle (section 28) every other money-moving system
 *     in this codebase already follows via its own event-log table.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/players', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { search } = request.query as { search?: string };

    const result = search
      ? await pool.query<FullUserRow>(
          `SELECT ${FULL_USER_COLUMNS} FROM users WHERE username ILIKE $1 ORDER BY created_at DESC LIMIT 100`,
          [`%${search}%`]
        )
      : await pool.query<FullUserRow>(`SELECT ${FULL_USER_COLUMNS} FROM users ORDER BY created_at DESC LIMIT 100`);

    return reply.send({
      ok: true,
      data: result.rows.map((user) => {
        const rank = getRankForXp(Number(user.mafia_xp));
        return {
          username: user.username,
          state: user.state,
          cash: Number(user.cash),
          premiumPoints: user.premium_points,
          rank: rank.name,
          status: deriveStatus(user),
          isAdmin: user.is_admin,
          createdAt: user.created_at,
          lastSeen: user.last_seen,
        };
      }),
    });
  });

  app.get('/api/v1/admin/players/:username', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const result = await pool.query<FullUserRow>(`SELECT ${FULL_USER_COLUMNS} FROM users WHERE lower(username) = lower($1)`, [
      username,
    ]);
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No player with that username.' } });
    }
    return reply.send({ ok: true, data: toDetail(user) });
  });

  app.post(
    '/api/v1/admin/players/:username/grant-cash',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const adminId = request.user!.userId;
      const { username } = request.params as { username: string };
      const parsed = grantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A non-zero integer amount is required.' } });
      }

      try {
        const outcome = await withTransaction(async (client) => {
          const target = await lockUserByUsername(client, username);
          try {
            const updateResult = await client.query<{ cash: string }>(
              'UPDATE users SET cash = cash + $1 WHERE id = $2 RETURNING cash',
              [parsed.data.amount, target.id]
            );
            const newCash = Number(updateResult.rows[0].cash);
            await logAction(client, adminId, target.id, 'grant_cash', parsed.data.amount, { newCash });
            return { username: target.username, amount: parsed.data.amount, newCash };
          } catch (err) {
            if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint?.includes('cash')) {
              throw new AdminError(409, 'WOULD_GO_NEGATIVE', `${target.username} only has $${Number(target.cash).toLocaleString()} — can't deduct that much.`);
            }
            throw err;
          }
        });
        return reply.send({ ok: true, data: outcome });
      } catch (err) {
        if (err instanceof AdminError) {
          return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
        }
        throw err;
      }
    }
  );

  app.post(
    '/api/v1/admin/players/:username/grant-premium-points',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const adminId = request.user!.userId;
      const { username } = request.params as { username: string };
      const parsed = grantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A non-zero integer amount is required.' } });
      }

      try {
        const outcome = await withTransaction(async (client) => {
          const target = await lockUserByUsername(client, username);
          try {
            const updateResult = await client.query<{ premium_points: number }>(
              'UPDATE users SET premium_points = premium_points + $1 WHERE id = $2 RETURNING premium_points',
              [parsed.data.amount, target.id]
            );
            const newPremiumPoints = updateResult.rows[0].premium_points;
            await logAction(client, adminId, target.id, 'grant_premium_points', parsed.data.amount, { newPremiumPoints });
            return { username: target.username, amount: parsed.data.amount, newPremiumPoints };
          } catch (err) {
            if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint?.includes('premium_points')) {
              throw new AdminError(409, 'WOULD_GO_NEGATIVE', `${target.username} only has ${target.premium_points} premium points — can't deduct that much.`);
            }
            throw err;
          }
        });
        return reply.send({ ok: true, data: outcome });
      } catch (err) {
        if (err instanceof AdminError) {
          return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
        }
        throw err;
      }
    }
  );

  app.post(
    '/api/v1/admin/players/:username/clear-status',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const adminId = request.user!.userId;
      const { username } = request.params as { username: string };

      try {
        const outcome = await withTransaction(async (client) => {
          const target = await lockUserByUsername(client, username);
          const previousStatus = deriveStatus(target);
          await client.query(
            'UPDATE users SET dead_until = NULL, jail_until = NULL, hospital_until = NULL WHERE id = $1',
            [target.id]
          );
          await logAction(client, adminId, target.id, 'clear_status', null, { previousStatus });
          return { username: target.username, previousStatus, newStatus: 'ALIVE' };
        });
        return reply.send({ ok: true, data: outcome });
      } catch (err) {
        if (err instanceof AdminError) {
          return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
        }
        throw err;
      }
    }
  );
}
