import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';
import { deriveStatus } from '../mafia/status';
import { getNextRank, getPreviousRank, type GangRank } from '../mafia/gangs/ranks';
import { GANGS } from '../mafia/config';

/** Same pattern as every other route file's error class. */
class GangError extends Error {
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

interface GangUserLockRow {
  cash: string; // bigint comes back as string from pg
  state: string;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
}

interface GangRow {
  id: string;
  name: string;
  treasury: string;
  territory_state: string | null;
  reputation: number;
}

/** Locks the acting player's row and checks ALIVE — same shared preamble
 * shape as `gambling.ts`'s own `lockAliveUser` (not actually shared
 * across files, same as every other route's lock+status check — see
 * `crimes.ts`, `hospital.ts`, etc.), extended with `state` since
 * claiming territory needs to know where the player currently is. */
async function lockAliveUser(client: PoolClient, userId: string): Promise<{ cash: number; state: string }> {
  const result = await client.query<GangUserLockRow>(
    'SELECT cash, state, dead_until, jail_until, hospital_until FROM users WHERE id = $1 FOR UPDATE',
    [userId]
  );
  const user = result.rows[0];
  if (!user) throw new GangError(404, 'NOT_FOUND', 'User not found.');

  const status = deriveStatus(user);
  if (status !== 'ALIVE') {
    throw new GangError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
  }

  return { cash: Number(user.cash), state: user.state };
}

/** Locks an active (non-disbanded) gang by name, case-insensitively —
 * same `lower(...) = lower($1)` convention as `players.ts`'s username
 * lookup. Every mutating handler below locks the gang row it's about to
 * read-then-write, same as locking a player's own row before trusting
 * its state. */
async function lockActiveGangByName(client: PoolClient, name: string): Promise<GangRow> {
  const result = await client.query<GangRow>(
    'SELECT id, name, treasury, territory_state, reputation FROM gangs WHERE lower(name) = lower($1) AND disbanded_at IS NULL FOR UPDATE',
    [name]
  );
  const gang = result.rows[0];
  if (!gang) throw new GangError(404, 'NOT_FOUND', 'No active gang with that name.');
  return gang;
}

async function getMembership(client: PoolClient, gangId: string, userId: string): Promise<GangRank | null> {
  const result = await client.query<{ rank: GangRank }>(
    'SELECT rank FROM gang_members WHERE gang_id = $1 AND user_id = $2',
    [gangId, userId]
  );
  return result.rows[0]?.rank ?? null;
}

async function requireBoss(client: PoolClient, gangId: string, userId: string): Promise<void> {
  const rank = await getMembership(client, gangId, userId);
  if (rank !== 'Boss') throw new GangError(403, 'NOT_BOSS', 'Only the Boss can do that.');
}

async function findUserIdByUsername(client: PoolClient, username: string): Promise<string> {
  const result = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
  const row = result.rows[0];
  if (!row) throw new GangError(404, 'NOT_FOUND', 'No player with that username.');
  return row.id;
}

const createSchema = z.object({ name: z.string().trim().min(3).max(30) });
const usernameSchema = z.object({ username: z.string().min(1) });
const amountSchema = z.object({ amount: z.number().int().positive() });

/**
 * Gangs (brief section 24): "Max 10 gangs initially. Name, leader,
 * members, roles (Boss, Underboss, Capo, Soldier, Associate), treasury,
 * territory, businesses, reputation, statistics." Businesses are left
 * out entirely — they don't exist yet (Phase 11); nothing to hook up
 * until that table does. Everything else is built:
 *
 *   - **Create/join/leave/kick** are open-join, not invite/apply —
 *     anyone can join any gang with no approval step, the same
 *     uninvited-join precedent co-op jobs already set, chosen for the
 *     same reason: building a request/invite/notification subsystem is
 *     real scope the brief doesn't actually call for. The Boss's `kick`
 *     power is the safety valve against an unwanted joiner.
 *   - **Only the Boss has any power** (kick, promote, demote, withdraw,
 *     claim territory, disband) — an MVP simplification, flagged here:
 *     the brief lists Underboss/Capo as real ranks above Soldier/
 *     Associate, which in a fuller version would presumably come with
 *     their own slice of permissions. Building that whole permission
 *     matrix with no brief-given specifics to build it *from* felt like
 *     real invented scope; "only the Boss can administer the gang" is
 *     the simplest reading that still makes rank mean something
 *     (bragging rights / promotion progress) without guessing at a
 *     matrix the brief never gives.
 *   - **Leadership never transfers.** The Boss is fixed to whoever
 *     created the gang; promoting reaches Underboss at most (see
 *     `mafia/gangs/ranks.ts`), and the Boss can't leave — only disband.
 *     Revisit if a real playerbase wants succession.
 *   - **Territory is one state per gang, claimed (not fought over).** A
 *     gang's Boss can claim whatever state they're currently standing in
 *     for a treasury cost, as long as no other *active* gang already
 *     holds it (enforced by a real DB constraint, not app logic — see
 *     `012_gangs.sql`). There is no mechanic to take territory *from*
 *     another gang by force — the brief describes territory and
 *     destruction releasing it to neutral, but gives no capture/war
 *     mechanic, so claiming only ever targets unclaimed ("neutral")
 *     states. Disbanding is the only way held territory currently
 *     changes hands.
 *   - **"Destroyed" vs. "disbanded" are treated as the same action for
 *     now** — the brief bundles them ("a destroyed gang can be
 *     disbanded..."), and there's no PvP/war system that could forcibly
 *     destroy a gang out from under its Boss, so the only gang-ending
 *     action built is the Boss voluntarily disbanding. Forcible
 *     destruction is a future system (the same missing piece as
 *     territory capture, above).
 *   - **Statistics are derived, never stored** — member count and
 *     combined kills are computed live via `COUNT`/`SUM` joins on
 *     read, the same "derive, don't duplicate" principle used for rank,
 *     status, and co-op rosters everywhere else in this codebase.
 */
export async function gangRoutes(app: FastifyInstance) {
  app.post('/api/v1/mafia/gangs', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid gang name.' } });
    }
    const { name } = parsed.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);

        const existingMembership = await client.query('SELECT 1 FROM gang_members WHERE user_id = $1', [userId]);
        if (existingMembership.rows.length > 0) {
          throw new GangError(409, 'ALREADY_IN_GANG', "You're already in a gang — leave it first.");
        }

        if (cash < GANGS.CREATION_COST) {
          throw new GangError(402, 'INSUFFICIENT_FUNDS', `Starting a gang costs $${GANGS.CREATION_COST.toLocaleString()}; you have $${cash.toLocaleString()}.`, {
            needed: GANGS.CREATION_COST,
            have: cash,
          });
        }

        // Lock the registry mutex *before* counting — see
        // 012_gangs.sql's header for why locking only the gangs that
        // already exist wouldn't stop two concurrent creators both
        // landing past the limit.
        await client.query('SELECT id FROM gang_registry WHERE id = 1 FOR UPDATE');
        const countResult = await client.query<{ count: string }>('SELECT COUNT(*) FROM gangs WHERE disbanded_at IS NULL');
        if (Number(countResult.rows[0].count) >= GANGS.MAX_GANGS) {
          throw new GangError(409, 'GANG_LIMIT_REACHED', `The max of ${GANGS.MAX_GANGS} gangs already exist.`);
        }

        let gangId: string;
        try {
          const insertResult = await client.query<{ id: string }>('INSERT INTO gangs (name) VALUES ($1) RETURNING id', [name]);
          gangId = insertResult.rows[0].id;
        } catch (err) {
          if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint === 'gangs_name_key') {
            throw new GangError(409, 'NAME_TAKEN', 'That gang name is already taken.');
          }
          throw err;
        }

        // Straight from the founder's own pocket (see CREATION_COST's own
        // comment in config.ts) — a permanent, voluntary spend, so it
        // counts toward cash_spent (Phase 14 polish) the same as a gun or
        // business purchase would.
        await client.query('UPDATE users SET cash = cash - $1, cash_spent = cash_spent + $1 WHERE id = $2', [
          GANGS.CREATION_COST,
          userId,
        ]);
        await client.query('INSERT INTO gang_members (gang_id, user_id, rank) VALUES ($1, $2, $3)', [gangId, userId, 'Boss']);

        return { id: gangId, name, rank: 'Boss' as const };
      });
      return reply.code(201).send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.get('/api/v1/mafia/gangs', async (_request, reply) => {
    const result = await pool.query<{
      name: string;
      treasury: string;
      territory_state: string | null;
      reputation: number;
      created_at: string;
      member_count: string;
      total_kills: string;
    }>(
      `SELECT g.name, g.treasury, g.territory_state, g.reputation, g.created_at,
              COUNT(gm.id) AS member_count, COALESCE(SUM(u.kills), 0) AS total_kills
       FROM gangs g
       LEFT JOIN gang_members gm ON gm.gang_id = g.id
       LEFT JOIN users u ON u.id = gm.user_id
       WHERE g.disbanded_at IS NULL
       GROUP BY g.id
       ORDER BY g.reputation DESC, g.created_at ASC`
    );

    return reply.send({
      ok: true,
      data: result.rows.map((g) => ({
        name: g.name,
        treasury: Number(g.treasury),
        territoryState: g.territory_state,
        reputation: g.reputation,
        memberCount: Number(g.member_count),
        totalKills: Number(g.total_kills),
        createdAt: g.created_at,
      })),
    });
  });

  app.get('/api/v1/mafia/gangs/:name', async (request, reply) => {
    const { name } = request.params as { name: string };

    const gangResult = await pool.query<{
      id: string;
      name: string;
      treasury: string;
      territory_state: string | null;
      reputation: number;
      created_at: string;
      disbanded_at: string | null;
    }>('SELECT id, name, treasury, territory_state, reputation, created_at, disbanded_at FROM gangs WHERE lower(name) = lower($1)', [name]);
    const gang = gangResult.rows[0];
    if (!gang) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No gang with that name.' } });
    }

    const membersResult = await pool.query<{ username: string; rank: GangRank; joined_at: string; kills: number }>(
      `SELECT u.username, gm.rank, gm.joined_at, u.kills
       FROM gang_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.gang_id = $1`,
      [gang.id]
    );
    const rankOrder: GangRank[] = ['Boss', 'Underboss', 'Capo', 'Soldier', 'Associate'];
    const members = membersResult.rows
      .slice()
      .sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank))
      .map((m) => ({ username: m.username, rank: m.rank, joinedAt: m.joined_at }));
    const totalKills = membersResult.rows.reduce((sum, m) => sum + m.kills, 0);

    return reply.send({
      ok: true,
      data: {
        name: gang.name,
        treasury: Number(gang.treasury),
        territoryState: gang.territory_state,
        reputation: gang.reputation,
        createdAt: gang.created_at,
        disbanded: gang.disbanded_at !== null,
        disbandedAt: gang.disbanded_at,
        memberCount: members.length,
        totalKills,
        members,
      },
    });
  });

  app.post('/api/v1/mafia/gangs/:name/join', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);

        const existingMembership = await client.query('SELECT 1 FROM gang_members WHERE user_id = $1', [userId]);
        if (existingMembership.rows.length > 0) {
          throw new GangError(409, 'ALREADY_IN_GANG', "You're already in a gang — leave it first.");
        }

        const gang = await lockActiveGangByName(client, name);

        try {
          await client.query('INSERT INTO gang_members (gang_id, user_id, rank) VALUES ($1, $2, $3)', [gang.id, userId, 'Associate']);
        } catch (err) {
          if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint === 'gang_members_user_id_key') {
            throw new GangError(409, 'ALREADY_IN_GANG', "You're already in a gang — leave it first.");
          }
          throw err;
        }

        return { gangName: gang.name, rank: 'Associate' as const };
      });
      return reply.code(201).send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/leave', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);

        const rank = await getMembership(client, gang.id, userId);
        if (!rank) throw new GangError(409, 'NOT_IN_GANG', "You're not in this gang.");
        if (rank === 'Boss') {
          throw new GangError(409, 'BOSS_CANNOT_LEAVE', 'The Boss can’t leave — disband the gang instead.');
        }

        await client.query('DELETE FROM gang_members WHERE gang_id = $1 AND user_id = $2', [gang.id, userId]);
        return { gangName: gang.name };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/kick', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };
    const parsed = usernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A username is required.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        const targetId = await findUserIdByUsername(client, parsed.data.username);
        if (targetId === userId) {
          throw new GangError(400, 'CANNOT_TARGET_SELF', "Use leave or disband instead — you can't kick yourself.");
        }

        const targetRank = await getMembership(client, gang.id, targetId);
        if (!targetRank) throw new GangError(404, 'NOT_A_MEMBER', 'That player is not in this gang.');

        await client.query('DELETE FROM gang_members WHERE gang_id = $1 AND user_id = $2', [gang.id, targetId]);
        return { gangName: gang.name, kicked: parsed.data.username };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/promote', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };
    const parsed = usernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A username is required.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        const targetId = await findUserIdByUsername(client, parsed.data.username);
        if (targetId === userId) {
          throw new GangError(400, 'CANNOT_TARGET_SELF', 'You already run this gang.');
        }

        const targetRank = await getMembership(client, gang.id, targetId);
        if (!targetRank) throw new GangError(404, 'NOT_A_MEMBER', 'That player is not in this gang.');

        const nextRank = getNextRank(targetRank);
        if (nextRank === null) {
          throw new GangError(409, 'ALREADY_AT_TOP', `${parsed.data.username} is already an Underboss — the highest rank below Boss.`);
        }
        if (nextRank === 'Boss') {
          throw new GangError(409, 'CANNOT_PROMOTE_TO_BOSS', 'Underboss is the highest rank a Boss can promote someone to — leadership transfer isn’t supported yet.');
        }

        await client.query('UPDATE gang_members SET rank = $1 WHERE gang_id = $2 AND user_id = $3', [nextRank, gang.id, targetId]);
        return { gangName: gang.name, username: parsed.data.username, newRank: nextRank };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/demote', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };
    const parsed = usernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A username is required.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        const targetId = await findUserIdByUsername(client, parsed.data.username);
        if (targetId === userId) {
          throw new GangError(400, 'CANNOT_TARGET_SELF', "The Boss can't demote themselves.");
        }

        const targetRank = await getMembership(client, gang.id, targetId);
        if (!targetRank) throw new GangError(404, 'NOT_A_MEMBER', 'That player is not in this gang.');

        const previousRank = getPreviousRank(targetRank);
        if (previousRank === null) {
          throw new GangError(409, 'ALREADY_AT_BOTTOM', `${parsed.data.username} is already an Associate — the lowest rank.`);
        }

        await client.query('UPDATE gang_members SET rank = $1 WHERE gang_id = $2 AND user_id = $3', [previousRank, gang.id, targetId]);
        return { gangName: gang.name, username: parsed.data.username, newRank: previousRank };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/deposit', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };
    const parsed = amountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A positive whole-number amount is required.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);

        const rank = await getMembership(client, gang.id, userId);
        if (!rank) throw new GangError(409, 'NOT_IN_GANG', "You're not in this gang.");

        const amount = parsed.data.amount;
        if (cash < amount) {
          throw new GangError(402, 'INSUFFICIENT_FUNDS', `You don't have $${amount.toLocaleString()} to deposit.`, { needed: amount, have: cash });
        }

        // Deliberately NOT cash_spent (Phase 14 polish, GAME_DESIGN.md
        // "Open questions" #9): a deposit moves cash into a shared pool
        // the depositor (or teammates) still has a claim on via
        // withdrawal or shared territory — it isn't gone the permanent
        // way a gun or business purchase is, so it doesn't count as
        // "spent."
        await client.query('UPDATE users SET cash = cash - $1 WHERE id = $2', [amount, userId]);
        await client.query('UPDATE gangs SET treasury = treasury + $1 WHERE id = $2', [amount, gang.id]);

        return { gangName: gang.name, deposited: amount, newTreasury: Number(gang.treasury) + amount, newPersonalCash: cash - amount };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/withdraw', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };
    const parsed = amountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'A positive whole-number amount is required.' } });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const { cash } = await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        const amount = parsed.data.amount;
        const treasury = Number(gang.treasury);
        if (treasury < amount) {
          throw new GangError(402, 'INSUFFICIENT_FUNDS', `The gang treasury doesn't have $${amount.toLocaleString()} — it holds $${treasury.toLocaleString()}.`, {
            needed: amount,
            have: treasury,
          });
        }

        await client.query('UPDATE gangs SET treasury = treasury - $1 WHERE id = $2', [amount, gang.id]);
        await client.query('UPDATE users SET cash = cash + $1 WHERE id = $2', [amount, userId]);

        return { gangName: gang.name, withdrawn: amount, newTreasury: treasury - amount, newPersonalCash: cash + amount };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/claim-territory', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const { state } = await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        if (gang.territory_state === state) {
          throw new GangError(409, 'ALREADY_HOLD_THAT_STATE', `${gang.name} already holds ${state}.`);
        }

        const treasury = Number(gang.treasury);
        if (treasury < GANGS.TERRITORY_CLAIM_COST) {
          throw new GangError(402, 'INSUFFICIENT_FUNDS', `Claiming territory costs $${GANGS.TERRITORY_CLAIM_COST.toLocaleString()} from the treasury; it holds $${treasury.toLocaleString()}.`, {
            needed: GANGS.TERRITORY_CLAIM_COST,
            have: treasury,
          });
        }

        try {
          await client.query(
            'UPDATE gangs SET territory_state = $1, treasury = treasury - $2, reputation = reputation + $3 WHERE id = $4',
            [state, GANGS.TERRITORY_CLAIM_COST, GANGS.TERRITORY_CLAIM_REPUTATION, gang.id]
          );
        } catch (err) {
          if (err instanceof Error && 'constraint' in err && (err as { constraint?: string }).constraint === 'idx_gangs_territory_active') {
            throw new GangError(409, 'TERRITORY_TAKEN', `Another gang already holds ${state}.`);
          }
          throw err;
        }

        return {
          gangName: gang.name,
          territoryState: state,
          newTreasury: treasury - GANGS.TERRITORY_CLAIM_COST,
          newReputation: gang.reputation + GANGS.TERRITORY_CLAIM_REPUTATION,
        };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/gangs/:name/disband', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        await lockAliveUser(client, userId);
        const gang = await lockActiveGangByName(client, name);
        await requireBoss(client, gang.id, userId);

        // Every member becomes a free agent immediately — delete the
        // real membership rows rather than any kind of soft-delete, same
        // as the brief's own "members become free agents" wording.
        await client.query('DELETE FROM gang_members WHERE gang_id = $1', [gang.id]);
        // The gang row itself is soft-deleted (disbanded_at), not
        // dropped, so its name/treasury/reputation history stays
        // queryable — "gang stats persist in history." Territory is
        // cleared explicitly for clarity, though the partial unique
        // index (WHERE disbanded_at IS NULL) would already stop it
        // blocking a fresh claim either way.
        await client.query('UPDATE gangs SET disbanded_at = now(), territory_state = NULL WHERE id = $1', [gang.id]);

        return { gangName: gang.name, disbanded: true };
      });
      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof GangError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
