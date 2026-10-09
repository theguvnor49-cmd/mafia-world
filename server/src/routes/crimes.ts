import type { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';
import { getRankForXp } from '../mafia/ranks';
import { deriveStatus } from '../mafia/status';
import { computeEffectiveHeat, clampHeat } from '../mafia/heat';
import { resolveGta } from '../mafia/crimes/gta';
import { pickVehicleDrop } from '../mafia/vehicles/drop';
import { GTA } from '../mafia/config';

interface VehicleCatalogRow {
  name: string;
  rarity: string;
  theft_difficulty: number;
}

interface CrimeStateRow {
  mafia_xp: string;
  heat: number;
  heat_updated_at: string;
  gta_next_at: string | null;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
}

/** Thrown for any business-rule rejection (not alive, on cooldown, ...) so
 * the route handler can turn it into the right HTTP status + API error
 * shape in one place, whether it happened inside the transaction or not. */
class CrimeError extends Error {
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

export async function crimeRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/crime/gta/status', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const queryResult = await pool.query<CrimeStateRow>(
      `SELECT mafia_xp, heat, heat_updated_at, gta_next_at, dead_until, jail_until, hospital_until
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = queryResult.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const now = new Date();
    const status = deriveStatus(user, now);
    const nextAt = user.gta_next_at ? new Date(user.gta_next_at) : null;
    const secondsRemaining = nextAt ? Math.max(0, Math.ceil((nextAt.getTime() - now.getTime()) / 1000)) : 0;

    return reply.send({
      ok: true,
      data: {
        status,
        onCooldown: secondsRemaining > 0,
        secondsRemaining,
        effectiveHeat: computeEffectiveHeat(user.heat, new Date(user.heat_updated_at), now),
      },
    });
  });

  app.post('/api/v1/mafia/crime/gta', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const outcome = await withTransaction(async (client) => {
        // Lock the row for the whole transaction so two concurrent attempts
        // by the same player can't both read "off cooldown" and both pay out.
        const queryResult = await client.query<CrimeStateRow>(
          `SELECT mafia_xp, heat, heat_updated_at, gta_next_at, dead_until, jail_until, hospital_until
           FROM users WHERE id = $1 FOR UPDATE`,
          [userId]
        );
        const user = queryResult.rows[0];
        if (!user) {
          throw new CrimeError(404, 'NOT_FOUND', 'User not found.');
        }

        const now = new Date();
        const status = deriveStatus(user, now);
        if (status !== 'ALIVE') {
          throw new CrimeError(409, 'NOT_AVAILABLE', `You can't do that right now — you're ${status.toLowerCase()}.`);
        }

        const nextAt = user.gta_next_at ? new Date(user.gta_next_at) : null;
        if (nextAt && nextAt.getTime() > now.getTime()) {
          const secondsRemaining = Math.ceil((nextAt.getTime() - now.getTime()) / 1000);
          throw new CrimeError(429, 'ON_COOLDOWN', `Wait ${secondsRemaining}s before trying again.`, {
            secondsRemaining,
          });
        }

        const effectiveHeat = computeEffectiveHeat(user.heat, new Date(user.heat_updated_at), now);
        const rank = getRankForXp(Number(user.mafia_xp));
        const result = resolveGta(effectiveHeat, rank.index);

        const newHeat = clampHeat(effectiveHeat + result.heatChange);
        const gtaNextAt = new Date(now.getTime() + GTA.COOLDOWN_SECONDS * 1000);
        const jailUntil = result.jailSeconds > 0 ? new Date(now.getTime() + result.jailSeconds * 1000) : null;

        // Vehicle drop (brief sections 21-22): only ever rolled on a
        // success — "a successful GTA can randomly produce a vehicle" —
        // using the same transaction so the drop and the crime's other
        // rewards land atomically together or not at all.
        let droppedVehicle: VehicleCatalogRow | null = null;
        if (result.success) {
          const catalogResult = await client.query<VehicleCatalogRow>(
            'SELECT name, rarity, theft_difficulty FROM vehicles'
          );
          droppedVehicle = pickVehicleDrop(
            catalogResult.rows.map((v) => ({ ...v, theftDifficulty: v.theft_difficulty })),
            Math.random(),
            Math.random()
          );
        }

        await client.query(
          `UPDATE users SET
             cash = cash + $1,
             mafia_xp = mafia_xp + $2,
             heat = $3,
             heat_updated_at = $4,
             gta_next_at = $5,
             jail_until = COALESCE($6, jail_until),
             crimes_committed = crimes_committed + 1,
             crimes_succeeded = crimes_succeeded + $7,
             crimes_failed = crimes_failed + $8,
             cash_earned = cash_earned + $1,
             jail_seconds_served = jail_seconds_served + $9,
             times_arrested = times_arrested + $10,
             cars_stolen = cars_stolen + $11
           WHERE id = $12`,
          [
            result.cashReward,
            result.xpReward,
            newHeat,
            now,
            gtaNextAt,
            jailUntil,
            result.success ? 1 : 0,
            result.success ? 0 : 1,
            result.jailSeconds,
            result.jailSeconds > 0 ? 1 : 0,
            droppedVehicle ? 1 : 0,
            userId,
          ]
        );

        if (droppedVehicle) {
          await client.query('INSERT INTO user_vehicles (user_id, vehicle_name) VALUES ($1, $2)', [
            userId,
            droppedVehicle.name,
          ]);
        }

        await client.query(
          `INSERT INTO crimes (user_id, crime_type, success, cash_reward, xp_reward, heat_change, jail_seconds, vehicle_dropped)
           VALUES ($1, 'gta', $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            result.success,
            result.cashReward,
            result.xpReward,
            result.heatChange,
            result.jailSeconds,
            droppedVehicle?.name ?? null,
          ]
        );

        return {
          success: result.success,
          cashReward: result.cashReward,
          xpReward: result.xpReward,
          heat: newHeat,
          jailSeconds: result.jailSeconds,
          jailUntil: jailUntil ? jailUntil.toISOString() : null,
          vehicleDropped: droppedVehicle ? { name: droppedVehicle.name, rarity: droppedVehicle.rarity } : null,
        };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof CrimeError) {
        return reply.code(err.statusCode).send({
          ok: false,
          error: { code: err.code, message: err.message, ...err.extra },
        });
      }
      throw err;
    }
  });
}
