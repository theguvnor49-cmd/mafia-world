import type { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';

interface VehicleRow {
  name: string;
  rarity: string;
  value: string; // bigint comes back as string from pg
  theft_difficulty: number;
  bullet_melt_value: number;
  resale_value: string;
  description: string | null;
}

interface OwnedVehicleRow {
  id: string;
  vehicle_name: string;
  rarity: string;
  bullet_melt_value: number;
  resale_value: string;
  acquired_at: string;
}

/** Same pattern as every other route file's error class — explicit fields,
 * manual assignment, so this file stays checkable with
 * `node --experimental-strip-types`. */
class VehicleError extends Error {
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

function mapVehicleRow(v: VehicleRow) {
  return {
    name: v.name,
    rarity: v.rarity,
    value: Number(v.value),
    theftDifficulty: v.theft_difficulty,
    bulletMeltValue: v.bullet_melt_value,
    resaleValue: Number(v.resale_value),
    description: v.description,
  };
}

/**
 * Vehicle catalog browsing, garage, and disposing of owned cars (brief
 * sections 21-22). The *drop* itself happens inline in routes/crimes.ts,
 * on a successful GTA, using the same transaction — this file is only the
 * catalog, "my garage," and selling/melting what's already owned.
 *
 * MVP choices worth flagging (also in GAME_DESIGN.md):
 *   - Selling/melting doesn't require being ALIVE — same reasoning as
 *     guns/armour purchases in Phase 4: these are pure inventory/cash
 *     transactions, not criminal activity exposed to jail/hospital.
 *   - No dedicated sell/melt history log, unlike busts (brief never says
 *     "all sales/melts should be logged" the way it explicitly does for
 *     busts) — `cars_stolen`/`cars_melted` running counters (existed since
 *     Phase 2) are what persists once the specific car row is gone.
 *   - "Cars can eventually be... Used" (brief section 21) has no concrete
 *     mechanic defined anywhere in the brief beyond ownership — same
 *     "eventually" treatment as armour's unspecified durability/repair.
 */
export async function vehicleRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/cars', async (_request, reply) => {
    const result = await pool.query<VehicleRow>(
      'SELECT name, rarity, value, theft_difficulty, bullet_melt_value, resale_value, description FROM vehicles ORDER BY display_order'
    );
    return reply.send({ ok: true, data: { vehicles: result.rows.map(mapVehicleRow) } });
  });

  app.get('/api/v1/mafia/cars/mine', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const result = await pool.query<OwnedVehicleRow>(
      `SELECT uv.id, uv.vehicle_name, v.rarity, v.bullet_melt_value, v.resale_value, uv.acquired_at
       FROM user_vehicles uv
       JOIN vehicles v ON v.name = uv.vehicle_name
       WHERE uv.user_id = $1
       ORDER BY uv.acquired_at DESC`,
      [userId]
    );
    return reply.send({
      ok: true,
      data: {
        vehicles: result.rows.map((v) => ({
          id: v.id,
          name: v.vehicle_name,
          rarity: v.rarity,
          bulletMeltValue: v.bullet_melt_value,
          resaleValue: Number(v.resale_value),
          acquiredAt: v.acquired_at,
        })),
      },
    });
  });

  app.post('/api/v1/mafia/cars/:id/sell', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        // Both rows belong to this one user, so there's no cross-player
        // deadlock concern here the way kill/bust need sorted-id locking.
        const ownedResult = await client.query<{ id: string; vehicle_name: string }>(
          'SELECT id, vehicle_name FROM user_vehicles WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [id, userId]
        );
        const owned = ownedResult.rows[0];
        if (!owned) {
          throw new VehicleError(404, 'NOT_FOUND', "You don't own a car with that ID.");
        }

        const vehicleResult = await client.query<{ resale_value: string }>(
          'SELECT resale_value FROM vehicles WHERE name = $1',
          [owned.vehicle_name]
        );
        const resaleValue = Number(vehicleResult.rows[0].resale_value);

        await client.query('DELETE FROM user_vehicles WHERE id = $1', [id]);
        await client.query('UPDATE users SET cash = cash + $1, cash_earned = cash_earned + $1 WHERE id = $2', [
          resaleValue,
          userId,
        ]);

        return { sold: owned.vehicle_name, cashReceived: resaleValue };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof VehicleError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/cars/:id/melt', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const ownedResult = await client.query<{ id: string; vehicle_name: string }>(
          'SELECT id, vehicle_name FROM user_vehicles WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [id, userId]
        );
        const owned = ownedResult.rows[0];
        if (!owned) {
          throw new VehicleError(404, 'NOT_FOUND', "You don't own a car with that ID.");
        }

        const vehicleResult = await client.query<{ bullet_melt_value: number }>(
          'SELECT bullet_melt_value FROM vehicles WHERE name = $1',
          [owned.vehicle_name]
        );
        const bulletsGained = vehicleResult.rows[0].bullet_melt_value;

        await client.query('DELETE FROM user_vehicles WHERE id = $1', [id]);
        await client.query('UPDATE users SET bullets = bullets + $1, cars_melted = cars_melted + 1 WHERE id = $2', [
          bulletsGained,
          userId,
        ]);

        return { melted: owned.vehicle_name, bulletsGained };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof VehicleError) {
        return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });
}
