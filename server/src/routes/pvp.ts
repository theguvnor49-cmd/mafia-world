import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTransaction } from '../db';
import { requireAuth } from '../auth';
import { getRankForXp } from '../mafia/ranks';
import { deriveStatus } from '../mafia/status';
import { calculateBulletsToKill } from '../mafia/bulletCalculator';
import { pickWitnesses } from '../mafia/pvp/witnesses';
import { settleDeathIntoHospital } from '../mafia/hospital/settle';
import { PVP } from '../mafia/config';

/** Columns needed to resolve a kill, shared by both lock queries below. */
const USER_LOCK_COLUMNS =
  'id, username, state, bullets, mafia_xp, equipped_gun, equipped_armour, dead_until, jail_until, hospital_until';

interface LockedUserRow {
  id: string;
  username: string;
  state: string;
  bullets: number;
  mafia_xp: string;
  equipped_gun: string | null;
  equipped_armour: string | null;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
}

/** Same pattern as CrimeError/WeaponError — explicit fields, manual
 * assignment, so this file stays checkable with `node --experimental-strip-types`. */
class PvpError extends Error {
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

const targetUsernameSchema = z.object({
  targetUsername: z.string().min(1, 'targetUsername is required.'),
});

/**
 * Hunt/search, kill resolution, and death/revive (brief sections 14-17).
 * The first phase with real cross-player stakes — a kill puts a specific
 * other real player into DEAD status for 24 real hours — so this file
 * follows brief section 54's transaction sketch closely: lock both
 * players, verify everything, mutate once, log, commit.
 *
 * MVP choices worth flagging (also in GAME_DESIGN.md):
 *   - No cost or cooldown on starting a search beyond its own 4-hour
 *     duration — not specified in the brief. "One active hunt per hunter"
 *     is enforced by a unique partial index (006_pvp.sql), not just an
 *     app-level check, so two concurrent "start" calls can't both land.
 *   - Travel between states doesn't exist yet (brief section 9 calls it
 *     an "eventually" feature) — so the attacker/target state-matching
 *     checks below are real and will matter once travel ships, but today
 *     almost every player is still in their registration-default state,
 *     making them practically a no-op. Not a bug — the architecture is
 *     ready for travel to slot in, per the brief's own framing.
 *   - A successful kill increments both `bullets_fired` and
 *     `bullets_spent` by the same amount — there's no "missed shots"
 *     mechanic yet to tell them apart.
 */
export async function pvpRoutes(app: FastifyInstance) {
  app.post('/api/v1/mafia/search/start', { preHandler: requireAuth }, async (request, reply) => {
    const hunterId = request.user!.userId;
    const parsed = targetUsernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }

    try {
      const hunt = await withTransaction(async (client) => {
        const hunterResult = await client.query<{ dead_until: string | null; jail_until: string | null; hospital_until: string | null }>(
          'SELECT dead_until, jail_until, hospital_until FROM users WHERE id = $1',
          [hunterId]
        );
        const hunter = hunterResult.rows[0];
        if (!hunter) throw new PvpError(404, 'NOT_FOUND', 'User not found.');

        const status = deriveStatus(hunter);
        if (status !== 'ALIVE') {
          throw new PvpError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
        }

        const targetResult = await client.query<{ id: string; username: string }>(
          'SELECT id, username FROM users WHERE lower(username) = lower($1)',
          [parsed.data.targetUsername]
        );
        const target = targetResult.rows[0];
        if (!target) {
          throw new PvpError(404, 'NOT_FOUND', 'No player with that username.');
        }
        if (target.id === hunterId) {
          throw new PvpError(400, 'CANNOT_HUNT_SELF', "You can't search for yourself.");
        }

        const completesAt = new Date(Date.now() + PVP.SEARCH_HOURS * 3600 * 1000);
        try {
          const insertResult = await client.query<{ id: string }>(
            'INSERT INTO hunts (hunter_id, target_id, completes_at) VALUES ($1, $2, $3) RETURNING id',
            [hunterId, target.id, completesAt]
          );
          return { huntId: insertResult.rows[0].id, targetUsername: target.username, completesAt: completesAt.toISOString() };
        } catch (err) {
          // Unique violation on idx_hunts_one_active_per_hunter.
          if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
            throw new PvpError(409, 'ALREADY_HUNTING', 'You already have an active search running.');
          }
          throw err;
        }
      });

      return reply.code(201).send({ ok: true, data: hunt });
    } catch (err) {
      if (err instanceof PvpError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.get('/api/v1/mafia/search/status', { preHandler: requireAuth }, async (request, reply) => {
    const hunterId = request.user!.userId;

    const outcome = await withTransaction(async (client) => {
      const huntResult = await client.query<{
        id: string;
        target_id: string;
        completes_at: string;
        target_state: string | null;
      }>(
        `SELECT id, target_id, completes_at, target_state FROM hunts
         WHERE hunter_id = $1 AND consumed_at IS NULL
         ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
        [hunterId]
      );
      const hunt = huntResult.rows[0];
      if (!hunt) return { hunting: false as const };

      const targetResult = await client.query<{ username: string; state: string }>(
        'SELECT username, state FROM users WHERE id = $1',
        [hunt.target_id]
      );
      const target = targetResult.rows[0];

      const now = new Date();
      const ready = new Date(hunt.completes_at).getTime() <= now.getTime();

      if (!ready) {
        const secondsRemaining = Math.ceil((new Date(hunt.completes_at).getTime() - now.getTime()) / 1000);
        return { hunting: true as const, ready: false as const, targetUsername: target?.username ?? null, secondsRemaining };
      }

      // Snapshot the target's current state exactly once, on first read
      // after completion — see the header note in 006_pvp.sql for why this
      // can't happen on a timer instead.
      let revealedState = hunt.target_state;
      if (!revealedState && target) {
        revealedState = target.state;
        await client.query('UPDATE hunts SET target_state = $1 WHERE id = $2', [revealedState, hunt.id]);
      }

      return { hunting: true as const, ready: true as const, targetUsername: target?.username ?? null, revealedState };
    });

    return reply.send({ ok: true, data: outcome });
  });

  app.post('/api/v1/mafia/kill', { preHandler: requireAuth }, async (request, reply) => {
    const attackerId = request.user!.userId;
    const parsed = targetUsernameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        const targetLookup = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = lower($1)', [
          parsed.data.targetUsername,
        ]);
        const targetId = targetLookup.rows[0]?.id;
        if (!targetId) throw new PvpError(404, 'NOT_FOUND', 'No player with that username.');
        if (targetId === attackerId) throw new PvpError(400, 'CANNOT_ATTACK_SELF', "You can't attack yourself.");

        // Lock both rows in a deterministic (sorted-id) order so a
        // simultaneous reverse attack can't deadlock against this one
        // (brief section 54: "lock attacker / lock target").
        const [firstId, secondId] = [attackerId, targetId].sort();
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
        const attacker = byId.get(attackerId);
        const target = byId.get(targetId);
        if (!attacker || !target) throw new PvpError(404, 'NOT_FOUND', 'User not found.');

        const now = new Date();
        const attackerStatus = deriveStatus(attacker, now);
        if (attackerStatus !== 'ALIVE') {
          throw new PvpError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${attackerStatus.toLowerCase()}.`);
        }

        // The attacker's own dead -> hospital transition is already
        // settled by requireAuth's preHandler (see auth.ts) by the time
        // this handler runs — but the target isn't the one making this
        // request, so their row needs the same settle run explicitly
        // here, inside this same locked transaction, before their status
        // is read for the gating check below. Patches the in-memory copy
        // too, rather than re-querying, since settleDeathIntoHospital
        // already returns the exact value it wrote (or null if it didn't
        // apply).
        const settledHospitalUntil = await settleDeathIntoHospital(client, targetId, now);
        if (settledHospitalUntil) {
          target.dead_until = null;
          target.hospital_until = settledHospitalUntil.toISOString();
        }

        const targetStatus = deriveStatus(target, now);
        if (targetStatus !== 'ALIVE') {
          throw new PvpError(409, 'TARGET_NOT_ALIVE', `${target.username} is already ${targetStatus.toLowerCase()}.`);
        }

        const huntResult = await client.query<{ id: string; completes_at: string; target_state: string | null }>(
          `SELECT id, completes_at, target_state FROM hunts
           WHERE hunter_id = $1 AND target_id = $2 AND consumed_at IS NULL
           ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
          [attackerId, targetId]
        );
        const hunt = huntResult.rows[0];
        if (!hunt) {
          throw new PvpError(409, 'NO_ACTIVE_HUNT', `You need to search for ${target.username} first.`);
        }
        if (new Date(hunt.completes_at).getTime() > now.getTime()) {
          throw new PvpError(409, 'SEARCH_NOT_READY', 'Your search is not complete yet.');
        }

        let revealedState = hunt.target_state;
        if (!revealedState) {
          revealedState = target.state;
          await client.query('UPDATE hunts SET target_state = $1 WHERE id = $2', [revealedState, hunt.id]);
        }

        if (attacker.state !== revealedState) {
          throw new PvpError(409, 'WRONG_STATE', `You need to be in ${revealedState} to attack ${target.username}.`);
        }
        if (target.state !== revealedState) {
          // The target moved since the search revealed their location —
          // the hunt fails and must be redone (brief section 14).
          await client.query('UPDATE hunts SET consumed_at = $1 WHERE id = $2', [now, hunt.id]);
          throw new PvpError(409, 'TARGET_MOVED', `${target.username} has moved. Search again.`);
        }

        if (!attacker.equipped_gun) {
          throw new PvpError(409, 'NO_GUN_EQUIPPED', 'You need a gun equipped to attack. Visit the armoury.');
        }
        const gunResult = await client.query<{ bullet_multiplier: string }>(
          'SELECT bullet_multiplier FROM guns WHERE name = $1',
          [attacker.equipped_gun]
        );
        const gunMultiplier = Number(gunResult.rows[0].bullet_multiplier);

        let armourBonusBullets = 0;
        let armourMultiplier = 1;
        if (target.equipped_armour) {
          const armourResult = await client.query<{ bonus_bullets: number; multiplier: string }>(
            'SELECT bonus_bullets, multiplier FROM armour WHERE name = $1',
            [target.equipped_armour]
          );
          armourBonusBullets = armourResult.rows[0].bonus_bullets;
          armourMultiplier = Number(armourResult.rows[0].multiplier);
        }

        const targetRank = getRankForXp(Number(target.mafia_xp));
        const bulletsNeeded = calculateBulletsToKill({
          targetBaseBullets: targetRank.baseBulletsToKill,
          gunMultiplier,
          armourBonusBullets,
          armourMultiplier,
        });

        if (attacker.bullets < bulletsNeeded) {
          throw new PvpError(
            402,
            'NOT_ENOUGH_BULLETS',
            `You need ${bulletsNeeded} bullets; you have ${attacker.bullets}.`,
            { bulletsNeeded, bullets: attacker.bullets }
          );
        }

        const deadUntil = new Date(now.getTime() + PVP.DEATH_HOURS * 3600 * 1000);

        await client.query(
          `UPDATE users SET bullets = bullets - $1, bullets_fired = bullets_fired + $1,
                             bullets_spent = bullets_spent + $1, kills = kills + 1
           WHERE id = $2`,
          [bulletsNeeded, attackerId]
        );
        await client.query('UPDATE users SET dead_until = $1, deaths = deaths + 1 WHERE id = $2', [deadUntil, targetId]);

        const killInsert = await client.query<{ id: string }>(
          'INSERT INTO kills (attacker_id, target_id, state, bullets_used) VALUES ($1, $2, $3, $4) RETURNING id',
          [attackerId, targetId, revealedState, bulletsNeeded]
        );
        const killId = killInsert.rows[0].id;

        await client.query('UPDATE hunts SET consumed_at = $1 WHERE id = $2', [now, hunt.id]);

        // Witnesses: up to PVP.MAX_WITNESSES random online players, never
        // the two combatants themselves (brief section 18).
        const onlineResult = await client.query<{ id: string }>(
          `SELECT id FROM users WHERE id <> $1 AND id <> $2 AND last_seen >= now() - ($3 * interval '1 second')`,
          [attackerId, targetId, PVP.ONLINE_WINDOW_SECONDS]
        );
        const witnessIds = pickWitnesses(onlineResult.rows.map((r) => r.id), PVP.MAX_WITNESSES);
        for (const witnessId of witnessIds) {
          await client.query(
            `INSERT INTO witness_statements (kill_id, victim_id, killer_id, witness_id, state, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [killId, targetId, attackerId, witnessId, revealedState, now]
          );
        }

        return {
          success: true,
          bulletsUsed: bulletsNeeded,
          targetUsername: target.username,
          witnessCount: witnessIds.length,
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof PvpError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/revive', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<{ dead_until: string | null; premium_points: number }>(
          'SELECT dead_until, premium_points FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = result.rows[0];
        if (!user) throw new PvpError(404, 'NOT_FOUND', 'User not found.');

        const status = deriveStatus({ dead_until: user.dead_until, jail_until: null, hospital_until: null });
        if (status !== 'DEAD') {
          throw new PvpError(409, 'NOT_DEAD', "You're not dead.");
        }
        if (user.premium_points < PVP.REVIVE_PREMIUM_POINTS) {
          throw new PvpError(
            402,
            'INSUFFICIENT_FUNDS',
            `Reviving costs ${PVP.REVIVE_PREMIUM_POINTS} premium points; you have ${user.premium_points}.`,
            { needed: PVP.REVIVE_PREMIUM_POINTS, have: user.premium_points }
          );
        }

        await client.query('UPDATE users SET premium_points = premium_points - $1, dead_until = NULL WHERE id = $2', [
          PVP.REVIVE_PREMIUM_POINTS,
          userId,
        ]);

        return { revived: true, spent: PVP.REVIVE_PREMIUM_POINTS };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof PvpError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
