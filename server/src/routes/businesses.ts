import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { computeEffectiveHeat, clampHeat } from '../mafia/heat';
import { BUSINESSES } from '../mafia/config';
import { getBusinessTypeDef, getIncomePerHour, computeAccruedCash, getUpgradeCost } from '../mafia/businesses/income';
import { resolveBusinessRob } from '../mafia/businesses/rob';

/** Same pattern as every other route file's error class. */
class BusinessError extends Error {
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

interface UserLockRow {
  cash: string;
  state: string;
  mafia_xp: string;
  heat: number;
  heat_updated_at: string;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  business_rob_next_at: string | null;
}

interface BusinessRow {
  id: string;
  owner_id: string | null;
  type: string;
  state: string;
  level: number;
  last_collected_at: string;
}

/** Locks the acting player's row — no status check, since buy/upgrade are
 * pure cash transactions (see the file-level doc comment below): same
 * reasoning as guns/armour/vehicle purchases, which also don't require
 * ALIVE. */
async function lockUser(client: PoolClient, userId: string): Promise<UserLockRow> {
  const result = await client.query<UserLockRow>(
    `SELECT cash, state, mafia_xp, heat, heat_updated_at, dead_until, jail_until, hospital_until, business_rob_next_at
     FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) throw new BusinessError(404, 'NOT_FOUND', 'User not found.');
  return user;
}

/** `lockUser` plus an ALIVE check — for rob/seize, which (unlike buy/
 * upgrade/collect) are physical, location-based actions, same category as
 * hunt/kill/bust. */
async function lockAliveUser(client: PoolClient, userId: string): Promise<UserLockRow> {
  const user = await lockUser(client, userId);
  const status = deriveStatus(user);
  if (status !== 'ALIVE') {
    throw new BusinessError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
  }
  return user;
}

async function lockBusiness(client: PoolClient, id: string): Promise<BusinessRow> {
  const result = await client.query<BusinessRow>(
    'SELECT id, owner_id, type, state, level, last_collected_at FROM businesses WHERE id = $1 FOR UPDATE',
    [id]
  );
  const business = result.rows[0];
  if (!business) throw new BusinessError(404, 'NOT_FOUND', 'No business with that ID.');
  return business;
}

async function logEvent(
  client: PoolClient,
  userId: string,
  businessId: string,
  eventType: 'buy' | 'upgrade' | 'collect' | 'rob_success' | 'rob_fail' | 'seize',
  cashDelta: number,
  xpDelta: number
): Promise<void> {
  await client.query(
    'INSERT INTO business_events (user_id, business_id, event_type, cash_delta, xp_delta) VALUES ($1, $2, $3, $4, $5)',
    [userId, businessId, eventType, cashDelta, xpDelta]
  );
}

const buySchema = z.object({ type: z.string().min(1) });

/**
 * Businesses & factories (brief section 25): "Nightclub, restaurant,
 * casino, garage, warehouse, gun shop, chop shop, protection racket.
 * Buyable/upgradeable/robbable/seizable, dropped on death, controllable
 * by gangs. Factories produce resources on a timestamp basis."
 *
 *   - **"Factories produce resources"** becomes, uniformly across all 8
 *     types, continuous CASH accrual from `last_collected_at` — the exact
 *     "derive it from elapsed time, never a running process" shape as
 *     heat decay, just counting up instead of down (see
 *     `mafia/businesses/income.ts`). A literal separate bullet-output
 *     factory (the brief's own "e.g.") was NOT built — this game already
 *     has two bullet-acquisition paths (buying guns, melting cars) and
 *     the brief gives no rate/conversion for a third.
 *   - **"Controllable by gangs" was NOT built.** Businesses below are
 *     individually player-owned only — the brief gives no shape for what
 *     gang control would mean (treasury-funded buys? shared income?
 *     gang-level seizure?), so nothing was invented. Flagged in "Open
 *     questions," same treatment as gangs' own "only the Boss has power"
 *     simplification.
 *   - **"Dropped on death" + "seizable" are one mechanic, not two.**
 *     There's no way to take a business from its *active* owner by force
 *     (no PvP-vs-business-owner combat exists) — only to claim one a
 *     death already made ownerless. Dying sets `owner_id = NULL` on all
 *     of a player's businesses (inside the existing kill transaction,
 *     routes/pvp.ts); `seize` below claims a NULL-owner row, free,
 *     inheriting whatever level it was already upgraded to. Exactly the
 *     same "claim neutral, never capture from an active holder" shape as
 *     gang territory in Phase 10.
 *   - **"Robbable" is a crime, not a trade** — same shape as GTA:
 *     chance-based, costs nothing to attempt, pays cash + XP + heat on
 *     success, jail + smaller XP + heat on failure. It targets a
 *     business's currently-*accrued* income (what a `collect` would also
 *     claim), not the owner's bank balance directly — so an owner who
 *     collects often is a much thinner target, a risk/reward dynamic that
 *     falls straight out of sharing one formula rather than needing its
 *     own design.
 *   - **At most one business of each type per owner** — an MVP cap (the
 *     brief doesn't say), preventing one rich player from buying unlimited
 *     Casinos and snowballing income without bound. Enforced by a real DB
 *     constraint (`idx_businesses_one_per_type_per_owner`), not app logic.
 *     Unlike the 10-gang cap, this needs no dedicated mutex row — it's a
 *     per-(owner,type) uniqueness rule, not a global count threshold, so a
 *     plain unique index already closes the race.
 *   - **Rob/seize require being in the business's own state** — mirrors
 *     the kill transaction's attacker/target state check exactly (same
 *     "ready for travel, near-no-op until travel ships" caveat as "Open
 *     questions" #13).
 *   - **Buy/upgrade/collect don't require being ALIVE; rob/seize do.** The
 *     first three are pure cash transactions on an asset (same reasoning
 *     as guns/armour/vehicle purchases, none of which require ALIVE
 *     either); rob and seize are physical, location-based actions, same
 *     category as hunt/kill/bust, which all do require it.
 */
export async function businessRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/businesses/types', async (_request, reply) => {
    return reply.send({
      ok: true,
      data: {
        maxLevel: BUSINESSES.MAX_LEVEL,
        types: BUSINESSES.TYPES.map((t) => ({
          type: t.type,
          basePrice: t.basePrice,
          baseIncomePerHour: t.baseIncomePerHour,
        })),
      },
    });
  });

  // Public directory of every existing business instance — how rob/seize
  // targets are found, the same role GET /gangs plays for gang targets.
  app.get('/api/v1/mafia/businesses', async (_request, reply) => {
    const result = await pool.query<{
      id: string;
      owner_username: string | null;
      type: string;
      state: string;
      level: number;
      last_collected_at: string;
    }>(
      `SELECT b.id, u.username AS owner_username, b.type, b.state, b.level, b.last_collected_at
       FROM businesses b
       LEFT JOIN users u ON u.id = b.owner_id
       ORDER BY b.created_at ASC`
    );
    const now = new Date();
    return reply.send({
      ok: true,
      data: result.rows.map((b) => ({
        id: b.id,
        ownerUsername: b.owner_username,
        type: b.type,
        state: b.state,
        level: b.level,
        incomePerHour: getIncomePerHour(b.type, b.level),
        accruedCash: computeAccruedCash(b.type, b.level, new Date(b.last_collected_at), now),
      })),
    });
  });

  app.get('/api/v1/mafia/businesses/mine', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const result = await pool.query<{ id: string; type: string; state: string; level: number; last_collected_at: string }>(
      'SELECT id, type, state, level, last_collected_at FROM businesses WHERE owner_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    const now = new Date();
    return reply.send({
      ok: true,
      data: result.rows.map((b) => ({
        id: b.id,
        type: b.type,
        state: b.state,
        level: b.level,
        incomePerHour: getIncomePerHour(b.type, b.level),
        accruedCash: computeAccruedCash(b.type, b.level, new Date(b.last_collected_at), now),
        upgradeCost: b.level < BUSINESSES.MAX_LEVEL ? getUpgradeCost(b.type, b.level) : null,
        maxLevel: b.level >= BUSINESSES.MAX_LEVEL,
      })),
    });
  });

  app.post('/api/v1/mafia/businesses/buy', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = buySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A business type is required.' } });
    }

    let typeDef;
    try {
      typeDef = getBusinessTypeDef(parsed.data.type);
    } catch {
      return reply.code(400).send({ ok: false, error: { code: 'INVALID_TYPE', message: 'Not a real business type.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const user = await lockUser(client, userId);
        const cash = Number(user.cash);
        if (cash < typeDef.basePrice) {
          throw new BusinessError(402, 'INSUFFICIENT_FUNDS', `${typeDef.type} costs $${typeDef.basePrice.toLocaleString()}; you have $${cash.toLocaleString()}.`, {
            needed: typeDef.basePrice,
            have: cash,
          });
        }

        let businessId: string;
        try {
          const insertResult = await client.query<{ id: string }>(
            'INSERT INTO businesses (owner_id, type, state) VALUES ($1, $2, $3) RETURNING id',
            [userId, typeDef.type, user.state]
          );
          businessId = insertResult.rows[0].id;
        } catch (err) {
          if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint === 'idx_businesses_one_per_type_per_owner') {
            throw new BusinessError(409, 'ALREADY_OWN_THAT_TYPE', `You already own a ${typeDef.type}.`);
          }
          throw err;
        }

        await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [typeDef.basePrice, userId]);
        await logEvent(client, userId, businessId, 'buy', -typeDef.basePrice, 0);

        return { id: businessId, type: typeDef.type, state: user.state, level: 1 };
      });
      return reply.code(201).send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/businesses/:id/upgrade', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const user = await lockUser(client, userId);
        const business = await lockBusiness(client, id);
        if (business.owner_id !== userId) {
          throw new BusinessError(403, 'NOT_YOUR_BUSINESS', "You don't own that business.");
        }
        if (business.level >= BUSINESSES.MAX_LEVEL) {
          throw new BusinessError(409, 'MAX_LEVEL_REACHED', `${business.type} is already at the maximum level.`);
        }

        const cost = getUpgradeCost(business.type, business.level);
        const cash = Number(user.cash);
        if (cash < cost) {
          throw new BusinessError(402, 'INSUFFICIENT_FUNDS', `Upgrading costs $${cost.toLocaleString()}; you have $${cash.toLocaleString()}.`, {
            needed: cost,
            have: cash,
          });
        }

        const newLevel = business.level + 1;
        await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [cost, userId]);
        await client.query('UPDATE businesses SET level = $1 WHERE id = $2', [newLevel, business.id]);
        await logEvent(client, userId, business.id, 'upgrade', -cost, 0);

        return { id: business.id, newLevel, newIncomePerHour: getIncomePerHour(business.type, newLevel) };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/businesses/:id/collect', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const business = await lockBusiness(client, id);
        if (business.owner_id !== userId) {
          throw new BusinessError(403, 'NOT_YOUR_BUSINESS', "You don't own that business.");
        }

        const now = new Date();
        const accrued = computeAccruedCash(business.type, business.level, new Date(business.last_collected_at), now);

        await client.query('UPDATE users SET cash = cash + $1, cash_earned = cash_earned + $1 WHERE id = $2', [accrued, userId]);
        await client.query('UPDATE businesses SET last_collected_at = $1 WHERE id = $2', [now, business.id]);
        await logEvent(client, userId, business.id, 'collect', accrued, 0);

        return { id: business.id, collected: accrued };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/businesses/:id/rob', { preHandler: requireAuth }, async (request, reply) => {
    const robberId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const robber = await lockAliveUser(client, robberId);

        const now = new Date();
        const cooldownUntil = robber.business_rob_next_at ? new Date(robber.business_rob_next_at) : null;
        if (cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
          const secondsRemaining = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000);
          throw new BusinessError(429, 'ON_COOLDOWN', `Wait ${secondsRemaining}s before robbing another business.`, { secondsRemaining });
        }

        const business = await lockBusiness(client, id);
        if (!business.owner_id) {
          throw new BusinessError(409, 'NOT_OWNED', "Nobody owns that business — seize it instead of robbing it.");
        }
        if (business.owner_id === robberId) {
          throw new BusinessError(400, 'CANNOT_TARGET_SELF', 'Collect from your own business instead of robbing it.');
        }
        if (business.state !== robber.state) {
          throw new BusinessError(409, 'WRONG_STATE', `You need to be in ${business.state} to rob that business.`);
        }

        const accrued = computeAccruedCash(business.type, business.level, new Date(business.last_collected_at), now);
        const result = resolveBusinessRob(business.level);
        const robNextAt = new Date(now.getTime() + BUSINESSES.ROB.COOLDOWN_SECONDS * 1000);
        // Heat decays continuously (mafia/heat.ts) — add this rob's gain
        // on top of whatever it effectively is right now, same as GTA's
        // own heat update in routes/crimes.ts, not the possibly-stale
        // stored value.
        const effectiveHeat = computeEffectiveHeat(robber.heat, new Date(robber.heat_updated_at), now);
        const newHeat = clampHeat(effectiveHeat + result.heatChange);

        if (result.success) {
          await client.query('UPDATE businesses SET last_collected_at = $1 WHERE id = $2', [now, business.id]);
          await client.query(
            `UPDATE users SET cash = cash + $1, cash_earned = cash_earned + $1, mafia_xp = mafia_xp + $2,
                               heat = $3, heat_updated_at = $4, business_rob_next_at = $5
             WHERE id = $6`,
            [accrued, result.xpReward, newHeat, now, robNextAt, robberId]
          );
          await logEvent(client, robberId, business.id, 'rob_success', accrued, result.xpReward);
        } else {
          const jailUntil = new Date(now.getTime() + result.jailSeconds * 1000);
          await client.query(
            `UPDATE users SET mafia_xp = mafia_xp + $1, heat = $2, heat_updated_at = $3, business_rob_next_at = $4,
                               jail_until = $5, jail_seconds_served = jail_seconds_served + $6, times_arrested = times_arrested + 1
             WHERE id = $7`,
            [result.xpReward, newHeat, now, robNextAt, jailUntil, result.jailSeconds, robberId]
          );
          await logEvent(client, robberId, business.id, 'rob_fail', 0, result.xpReward);
        }

        return {
          success: result.success,
          cashStolen: result.success ? accrued : 0,
          xpReward: result.xpReward,
          jailSeconds: result.jailSeconds,
        };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/businesses/:id/seize', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const user = await lockAliveUser(client, userId);
        const business = await lockBusiness(client, id);

        if (business.owner_id) {
          throw new BusinessError(409, 'ALREADY_OWNED', 'That business already has an owner.');
        }
        if (business.state !== user.state) {
          throw new BusinessError(409, 'WRONG_STATE', `You need to be in ${business.state} to seize that business.`);
        }

        try {
          await client.query('UPDATE businesses SET owner_id = $1, last_collected_at = now() WHERE id = $2', [userId, business.id]);
        } catch (err) {
          if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint === 'idx_businesses_one_per_type_per_owner') {
            throw new BusinessError(409, 'ALREADY_OWN_THAT_TYPE', `You already own a ${business.type}.`);
          }
          throw err;
        }
        await logEvent(client, userId, business.id, 'seize', 0, 0);

        return { id: business.id, type: business.type, level: business.level };
      });
      return reply.code(201).send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
