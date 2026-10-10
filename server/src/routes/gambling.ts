import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { resolveDice } from '../mafia/gambling/dice';
import { resolveSlots } from '../mafia/gambling/slots';
import { resolveRoulette } from '../mafia/gambling/roulette';
import { resolveBlackjack } from '../mafia/gambling/blackjack';
import { GAMBLING } from '../mafia/config';

/** Same pattern as every other route file's error class. */
class GamblingError extends Error {
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

interface GamblingLockRow {
  cash: string; // bigint comes back as string from pg
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
}

/**
 * Locks the player's row and checks ALIVE — shared by all four games
 * below, since every bet needs exactly this same preamble before its own
 * game-specific bet-range/affordability checks. Matches `crimes.ts`'s own
 * `NOT_AVAILABLE` error code for "can't act right now," for consistency.
 */
async function lockAliveUser(client: PoolClient, userId: string): Promise<{ cash: number }> {
  const result = await client.query<GamblingLockRow>(
    'SELECT cash, dead_until, jail_until, hospital_until FROM users WHERE id = $1 FOR UPDATE',
    [userId]
  );
  const user = result.rows[0];
  if (!user) throw new GamblingError(404, 'NOT_FOUND', 'User not found.');

  const status = deriveStatus(user);
  if (status !== 'ALIVE') {
    throw new GamblingError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
  }

  return { cash: Number(user.cash) };
}

function checkBetRange(amount: number, min: number, max: number) {
  if (amount < min || amount > max) {
    throw new GamblingError(400, 'BET_OUT_OF_RANGE', `Bets must be between $${min.toLocaleString()} and $${max.toLocaleString()}.`, {
      min,
      max,
    });
  }
}

function checkAffordable(amount: number, cash: number) {
  if (cash < amount) {
    throw new GamblingError(402, 'INSUFFICIENT_FUNDS', `You don't have $${amount.toLocaleString()} to bet.`, {
      needed: amount,
      have: cash,
    });
  }
}

/** Applies a bet's net cash change and logs it — shared tail end of
 * every handler below. `cash_earned`/`cash_lost` split the same way
 * hospital's own gamble already does: a win adds to `cash_earned`, a
 * loss (net negative) adds to `cash_lost`; a push (net exactly 0, only
 * possible in blackjack) touches neither. */
async function applyBetOutcome(
  client: PoolClient,
  userId: string,
  game: 'dice' | 'slots' | 'roulette' | 'blackjack',
  betAmount: number,
  netChange: number,
  detail: Record<string, unknown>
) {
  await client.query(
    `UPDATE users SET
       cash = cash + $1,
       cash_earned = cash_earned + $2,
       cash_lost = cash_lost + $3
     WHERE id = $4`,
    [netChange, netChange > 0 ? netChange : 0, netChange < 0 ? -netChange : 0, userId]
  );
  await client.query(
    `INSERT INTO gambling_bets (user_id, game, bet_amount, net_change, detail) VALUES ($1, $2, $3, $4, $5)`,
    [userId, game, betAmount, netChange, JSON.stringify(detail)]
  );
}

const diceSchema = z.object({
  amount: z.number().int().positive(),
  betType: z.enum(['under', 'seven', 'over']),
});

const slotsSchema = z.object({
  amount: z.number().int().positive(),
});

const rouletteSchema = z.object({
  amount: z.number().int().positive(),
  bet: z.discriminatedUnion('type', [
    z.object({ type: z.literal('color'), color: z.enum(['red', 'black']) }),
    z.object({ type: z.literal('parity'), parity: z.enum(['odd', 'even']) }),
    z.object({ type: z.literal('number'), number: z.number().int().min(0).max(36) }),
  ]),
});

const blackjackSchema = z.object({
  amount: z.number().int().positive(),
});

/**
 * Gambling (brief section 23) — "server-authoritative, transactional,
 * logged, capped — never unlimited-money." Four candidates named in the
 * brief, all built: dice, slots, roulette, and an auto-played blackjack
 * (see `mafia/gambling/blackjack.ts` for why it has no hit/stand
 * decisions). Every game resolves in one request via its own pure,
 * unit-tested function — this file's job is just the shared plumbing:
 * lock the player, check ALIVE, check the bet, resolve, pay out, log.
 *
 * Distinct from Phase 9's `hospital/gamble` coin flip, which stays
 * hospital-only and untouched by any of this.
 */
export async function gamblingRoutes(app: FastifyInstance) {
  app.post('/api/v1/mafia/gambling/dice', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = diceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid bet.' } });
    }
    const { amount, betType } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        checkBetRange(amount, GAMBLING.DICE.MIN_BET, GAMBLING.DICE.MAX_BET);
        checkAffordable(amount, cash);

        const result = resolveDice(amount, betType);
        // resolveDice's own result doesn't include which betType was
        // chosen (only the roll and the outcome), so it's added here —
        // otherwise the log would show what was rolled but not what was
        // actually bet on, same reasoning as roulette's `bet` below.
        await applyBetOutcome(client, userId, 'dice', amount, result.netChange, { ...result, betType });

        return { ...result, newCashBalance: cash + result.netChange };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GamblingError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gambling/slots', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = slotsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid bet.' } });
    }
    const { amount } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        checkBetRange(amount, GAMBLING.SLOTS.MIN_BET, GAMBLING.SLOTS.MAX_BET);
        checkAffordable(amount, cash);

        const result = resolveSlots(amount);
        await applyBetOutcome(client, userId, 'slots', amount, result.netChange, { ...result });

        return { ...result, newCashBalance: cash + result.netChange };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GamblingError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gambling/roulette', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = rouletteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid bet.' } });
    }
    const { amount, bet } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        checkBetRange(amount, GAMBLING.ROULETTE.MIN_BET, GAMBLING.ROULETTE.MAX_BET);
        checkAffordable(amount, cash);

        const result = resolveRoulette(amount, bet);
        await applyBetOutcome(client, userId, 'roulette', amount, result.netChange, { ...result, bet });

        return { ...result, newCashBalance: cash + result.netChange };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GamblingError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gambling/blackjack', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = blackjackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid bet.' } });
    }
    const { amount } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        checkBetRange(amount, GAMBLING.BLACKJACK.MIN_BET, GAMBLING.BLACKJACK.MAX_BET);
        checkAffordable(amount, cash);

        const result = resolveBlackjack(amount);
        await applyBetOutcome(client, userId, 'blackjack', amount, result.netChange, { ...result });

        return { ...result, newCashBalance: cash + result.netChange };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GamblingError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}

