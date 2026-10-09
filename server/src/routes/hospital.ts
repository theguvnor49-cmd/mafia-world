import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { resolveGamble } from '../mafia/hospital/gamble';
import { HOSPITAL } from '../mafia/config';

/** Same pattern as every other route file's error class — explicit
 * fields, manual assignment, so this file stays checkable with
 * `node --experimental-strip-types`. */
class HospitalError extends Error {
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

interface HospitalLockRow {
  cash: string; // bigint comes back as string from pg
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  hospital_job_next_at: string | null;
}

/** `(elapsed / total) * 100`, clamped 0-100 — `total` is the fixed
 * `HOSPITAL.RECOVERY_HOURS` config constant, not a per-player stored
 * value, so this needs no extra "when did recovery start" column:
 * treatment reducing `hospital_until` is immediately and correctly
 * reflected here on the very next call, since the percentage is derived
 * straight from *remaining* time against that fixed total, not from
 * tracking elapsed time against a drifting start point. */
function recoveryPercent(secondsRemaining: number): number {
  const totalSeconds = HOSPITAL.RECOVERY_HOURS * 3600;
  const pct = 100 - (secondsRemaining / totalSeconds) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

async function logActivity(
  client: PoolClient,
  userId: string,
  activity: 'treatment' | 'gamble' | 'small_job',
  cashDelta: number,
  xpDelta: number,
  won: boolean | null
) {
  await client.query(
    `INSERT INTO hospital_activities (user_id, activity, cash_delta, xp_delta, won) VALUES ($1, $2, $3, $4, $5)`,
    [userId, activity, cashDelta, xpDelta, won]
  );
}

const gambleSchema = z.object({
  amount: z.number().int().positive(),
});

/**
 * Hospital recovery (brief section 22) — the free path's second stage
 * after death (see `mafia/hospital/settle.ts` for how a player actually
 * gets here) and its three active recovery activities. "Rest," the
 * brief's fourth named activity, needs no endpoint — it's simply doing
 * nothing while the timer in `GET .../status` counts down on its own,
 * the same as every other timer in this game.
 *
 * MVP choices worth flagging (also in GAME_DESIGN.md):
 *   - Medical treatment spends plain cash, not premium points — a
 *     deliberate contrast with `POST /mafia/revive`'s premium-point
 *     skip, so the two currencies keep distinct roles (premium = skip
 *     the big one entirely, cash = shorten the smaller one).
 *   - Gambling is an honest 50/50 double-or-nothing with a hard cap per
 *     bet (`HOSPITAL.GAMBLE_MIN_BET`/`MAX_BET`) — no house edge, no
 *     progressive jackpot, nothing resembling the full Gambling system
 *     Phase 10 will eventually build; this is deliberately the smallest
 *     thing that satisfies "limited gambling."
 *   - Small jobs always succeed for a small, fixed reward — no risk, no
 *     roll, unlike every other crime-flavored action in this game. The
 *     brief frames it as a minor activity to fill hospital downtime, not
 *     a real heist, so it gets none of GTA's stakes.
 */
export async function hospitalRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/hospital/status', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const result = await pool.query<HospitalLockRow>(
      'SELECT cash, dead_until, jail_until, hospital_until, hospital_job_next_at FROM users WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const now = new Date();
    const status = deriveStatus(user, now);

    if (status !== 'HOSPITAL') {
      return reply.send({
        ok: true,
        data: { inHospital: false, hospitalUntil: null, secondsRemaining: 0, recoveryPercent: 100, smallJobOnCooldown: false, smallJobSecondsRemaining: 0 },
      });
    }

    const hospitalUntil = new Date(user.hospital_until!);
    const secondsRemaining = Math.max(0, Math.ceil((hospitalUntil.getTime() - now.getTime()) / 1000));

    const jobNextAt = user.hospital_job_next_at ? new Date(user.hospital_job_next_at) : null;
    const smallJobSecondsRemaining = jobNextAt ? Math.max(0, Math.ceil((jobNextAt.getTime() - now.getTime()) / 1000)) : 0;

    return reply.send({
      ok: true,
      data: {
        inHospital: true,
        hospitalUntil: hospitalUntil.toISOString(),
        secondsRemaining,
        recoveryPercent: recoveryPercent(secondsRemaining),
        smallJobOnCooldown: smallJobSecondsRemaining > 0,
        smallJobSecondsRemaining,
      },
    });
  });

  app.post('/api/v1/mafia/hospital/treat', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<HospitalLockRow>(
          'SELECT cash, dead_until, jail_until, hospital_until, hospital_job_next_at FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = result.rows[0];
        if (!user) throw new HospitalError(404, 'NOT_FOUND', 'User not found.');

        const now = new Date();
        const status = deriveStatus(user, now);
        if (status !== 'HOSPITAL') {
          throw new HospitalError(409, 'NOT_IN_HOSPITAL', "You're not in the hospital right now.");
        }

        const cash = Number(user.cash);
        if (cash < HOSPITAL.TREATMENT_COST) {
          throw new HospitalError(
            402,
            'INSUFFICIENT_FUNDS',
            `Treatment costs $${HOSPITAL.TREATMENT_COST.toLocaleString()}; you have $${cash.toLocaleString()}.`,
            { needed: HOSPITAL.TREATMENT_COST, have: cash }
          );
        }

        const currentUntil = new Date(user.hospital_until!);
        const newUntil = new Date(
          Math.max(now.getTime(), currentUntil.getTime() - HOSPITAL.TREATMENT_REDUCTION_SECONDS * 1000)
        );

        await client.query(
          `UPDATE users SET cash = cash - $1, hospital_until = $2
           WHERE id = $3`,
          [HOSPITAL.TREATMENT_COST, newUntil, userId]
        );
        await logActivity(client, userId, 'treatment', -HOSPITAL.TREATMENT_COST, 0, null);

        return {
          cashSpent: HOSPITAL.TREATMENT_COST,
          hospitalUntil: newUntil.toISOString(),
          recovered: newUntil.getTime() <= now.getTime(),
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof HospitalError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/hospital/gamble', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = gambleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid bet amount.' },
      });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<HospitalLockRow>(
          'SELECT cash, dead_until, jail_until, hospital_until, hospital_job_next_at FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = result.rows[0];
        if (!user) throw new HospitalError(404, 'NOT_FOUND', 'User not found.');

        const now = new Date();
        const status = deriveStatus(user, now);
        if (status !== 'HOSPITAL') {
          throw new HospitalError(409, 'NOT_IN_HOSPITAL', "You're not in the hospital right now.");
        }

        const amount = parsed.data.amount;
        if (amount < HOSPITAL.GAMBLE_MIN_BET || amount > HOSPITAL.GAMBLE_MAX_BET) {
          throw new HospitalError(
            400,
            'BET_OUT_OF_RANGE',
            `Bets must be between $${HOSPITAL.GAMBLE_MIN_BET.toLocaleString()} and $${HOSPITAL.GAMBLE_MAX_BET.toLocaleString()}.`,
            { min: HOSPITAL.GAMBLE_MIN_BET, max: HOSPITAL.GAMBLE_MAX_BET }
          );
        }

        const cash = Number(user.cash);
        if (cash < amount) {
          throw new HospitalError(402, 'INSUFFICIENT_FUNDS', `You don't have $${amount.toLocaleString()} to bet.`, {
            needed: amount,
            have: cash,
          });
        }

        const gambleResult = resolveGamble(amount);

        await client.query(
          `UPDATE users SET cash = cash + $1, cash_earned = cash_earned + $2, cash_lost = cash_lost + $3 WHERE id = $4`,
          [gambleResult.netChange, gambleResult.won ? amount : 0, gambleResult.won ? 0 : amount, userId]
        );
        await logActivity(client, userId, 'gamble', gambleResult.netChange, 0, gambleResult.won);

        return { won: gambleResult.won, netChange: gambleResult.netChange, newCashBalance: cash + gambleResult.netChange };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof HospitalError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/hospital/job', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<HospitalLockRow>(
          'SELECT cash, dead_until, jail_until, hospital_until, hospital_job_next_at FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = result.rows[0];
        if (!user) throw new HospitalError(404, 'NOT_FOUND', 'User not found.');

        const now = new Date();
        const status = deriveStatus(user, now);
        if (status !== 'HOSPITAL') {
          throw new HospitalError(409, 'NOT_IN_HOSPITAL', "You're not in the hospital right now.");
        }

        const nextAt = user.hospital_job_next_at ? new Date(user.hospital_job_next_at) : null;
        if (nextAt && nextAt.getTime() > now.getTime()) {
          const secondsRemaining = Math.ceil((nextAt.getTime() - now.getTime()) / 1000);
          throw new HospitalError(429, 'ON_COOLDOWN', `Wait ${secondsRemaining}s before trying another small job.`, {
            secondsRemaining,
          });
        }

        const jobNextAt = new Date(now.getTime() + HOSPITAL.SMALL_JOB_COOLDOWN_SECONDS * 1000);

        await client.query(
          `UPDATE users SET
             cash = cash + $1,
             cash_earned = cash_earned + $1,
             mafia_xp = mafia_xp + $2,
             hospital_job_next_at = $3
           WHERE id = $4`,
          [HOSPITAL.SMALL_JOB_CASH_REWARD, HOSPITAL.SMALL_JOB_XP_REWARD, jobNextAt, userId]
        );
        await logActivity(client, userId, 'small_job', HOSPITAL.SMALL_JOB_CASH_REWARD, HOSPITAL.SMALL_JOB_XP_REWARD, null);

        return {
          cashReward: HOSPITAL.SMALL_JOB_CASH_REWARD,
          xpReward: HOSPITAL.SMALL_JOB_XP_REWARD,
          secondsUntilNextJob: HOSPITAL.SMALL_JOB_COOLDOWN_SECONDS,
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof HospitalError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
