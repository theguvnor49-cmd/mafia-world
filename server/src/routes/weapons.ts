import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { requireAuth } from '../auth';
import { RANKS } from '../mafia/config';
import { calculateBulletsToKill } from '../mafia/bulletCalculator';

interface GunRow {
  name: string;
  bullet_multiplier: string; // numeric comes back as string from pg
  price: string; // bigint comes back as string from pg
  description: string | null;
}

interface ArmourRow {
  name: string;
  bonus_bullets: number;
  multiplier: string;
  price: string;
  description: string | null;
}

/** Thrown for any business-rule rejection (not found, already equipped,
 * can't afford it) — same pattern as `CrimeError` in routes/crimes.ts, kept
 * as explicit fields + manual assignment rather than TS parameter-property
 * shorthand so this file stays checkable with `node --experimental-strip-types`. */
class WeaponError extends Error {
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

const calculatorQuerySchema = z.object({
  gun: z.string().min(1, 'gun is required.'),
  armour: z.string().min(1).optional(),
  targetRank: z.string().min(1, 'targetRank is required.'),
});

/**
 * Guns & armour catalog, purchases, and the bullet calculator (brief
 * sections 10-12).
 *
 * MVP choices worth flagging (also in GAME_DESIGN.md "Open questions"):
 *   - Buying immediately equips. There's no locker/inventory — you don't
 *     keep previously-bought gear, and re-buying something you've already
 *     sold isn't a thing yet. Simplest model that matches the single
 *     `equipped_gun`/`equipped_armour` columns that have existed since
 *     Phase 1; an inventory table is an easy later addition if wanted.
 *   - Buying doesn't require being ALIVE — it's a pure cash transaction,
 *     unlike crimes which require being out of jail/hospital. Not
 *     specified in the brief either way.
 *   - A purchase debits `cash` and increments `cash_spent` (added in the
 *     Phase 14 polish pass) but never `cash_lost` — that counter is for
 *     involuntary losses, not voluntary spending.
 */
export async function weaponsRoutes(app: FastifyInstance) {
  app.get('/api/v1/mafia/weapons/guns', async (_request, reply) => {
    const result = await pool.query<GunRow>(
      'SELECT name, bullet_multiplier, price, description FROM guns ORDER BY display_order'
    );
    return reply.send({
      ok: true,
      data: {
        guns: result.rows.map((g) => ({
          name: g.name,
          bulletMultiplier: Number(g.bullet_multiplier),
          price: Number(g.price),
          description: g.description,
        })),
      },
    });
  });

  app.get('/api/v1/mafia/weapons/armour', async (_request, reply) => {
    const result = await pool.query<ArmourRow>(
      'SELECT name, bonus_bullets, multiplier, price, description FROM armour ORDER BY display_order'
    );
    return reply.send({
      ok: true,
      data: {
        armour: result.rows.map((a) => ({
          name: a.name,
          bonusBullets: a.bonus_bullets,
          multiplier: Number(a.multiplier),
          price: Number(a.price),
          description: a.description,
        })),
      },
    });
  });

  app.post('/api/v1/mafia/weapons/guns/:name/buy', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const userResult = await client.query<{ cash: string; equipped_gun: string | null }>(
          'SELECT cash, equipped_gun FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = userResult.rows[0];
        if (!user) throw new WeaponError(404, 'NOT_FOUND', 'User not found.');

        if (user.equipped_gun === name) {
          throw new WeaponError(409, 'ALREADY_EQUIPPED', 'You already have that gun equipped.');
        }

        const gunResult = await client.query<{ price: string }>('SELECT price FROM guns WHERE name = $1', [name]);
        const gun = gunResult.rows[0];
        if (!gun) throw new WeaponError(404, 'NOT_FOUND', 'No such gun.');

        const price = Number(gun.price);
        const cash = Number(user.cash);
        if (cash < price) {
          throw new WeaponError(
            402,
            'INSUFFICIENT_FUNDS',
            `You need $${(price - cash).toLocaleString()} more to afford that.`,
            { price, cash }
          );
        }

        await client.query('UPDATE users SET cash = cash - $1, cash_spent = cash_spent + $1, equipped_gun = $2 WHERE id = $3', [
          price,
          name,
          userId,
        ]);

        return { equippedGun: name, cash: cash - price, spent: price };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof WeaponError) {
        return reply
          .code(err.statusCode)
          .send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  app.post('/api/v1/mafia/weapons/armour/:name/buy', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name } = request.params as { name: string };

    try {
      const outcome = await withTransaction(async (client) => {
        const userResult = await client.query<{ cash: string; equipped_armour: string | null }>(
          'SELECT cash, equipped_armour FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const user = userResult.rows[0];
        if (!user) throw new WeaponError(404, 'NOT_FOUND', 'User not found.');

        if (user.equipped_armour === name) {
          throw new WeaponError(409, 'ALREADY_EQUIPPED', 'You already have that armour equipped.');
        }

        const armourResult = await client.query<{ price: string }>('SELECT price FROM armour WHERE name = $1', [name]);
        const armour = armourResult.rows[0];
        if (!armour) throw new WeaponError(404, 'NOT_FOUND', 'No such armour.');

        const price = Number(armour.price);
        const cash = Number(user.cash);
        if (cash < price) {
          throw new WeaponError(
            402,
            'INSUFFICIENT_FUNDS',
            `You need $${(price - cash).toLocaleString()} more to afford that.`,
            { price, cash }
          );
        }

        await client.query('UPDATE users SET cash = cash - $1, cash_spent = cash_spent + $1, equipped_armour = $2 WHERE id = $3', [
          price,
          name,
          userId,
        ]);

        return { equippedArmour: name, cash: cash - price, spent: price };
      });

      return reply.send({ ok: true, data: outcome });
    } catch (err) {
      if (err instanceof WeaponError) {
        return reply
          .code(err.statusCode)
          .send({ ok: false, error: { code: err.code, message: err.message, ...err.extra } });
      }
      throw err;
    }
  });

  /**
   * Informational only (brief section 12) — lets a player preview the
   * bullets-needed formula for a hypothetical gun/armour/target-rank
   * combination. Does not look up any real player, so it carries no
   * target-identity information a real kill resolution (Phase 5) would
   * need to keep hidden. Uses the exact same `calculateBulletsToKill`
   * function real combat will use, so this can never silently drift from
   * the real math.
   */
  app.get('/api/v1/mafia/weapons/calculator', async (request, reply) => {
    const parsed = calculatorQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }
    const { gun: gunName, armour: armourName, targetRank: targetRankName } = parsed.data;

    const rank = RANKS.find((r) => r.name === targetRankName);
    if (!rank) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No such rank.' } });
    }

    const gunResult = await pool.query<{ bullet_multiplier: string }>(
      'SELECT bullet_multiplier FROM guns WHERE name = $1',
      [gunName]
    );
    const gunRow = gunResult.rows[0];
    if (!gunRow) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No such gun.' } });
    }

    let armourBonusBullets = 0;
    let armourMultiplier = 1;
    let resolvedArmourName: string | null = null;

    if (armourName && armourName.toLowerCase() !== 'none') {
      const armourResult = await pool.query<{ bonus_bullets: number; multiplier: string }>(
        'SELECT bonus_bullets, multiplier FROM armour WHERE name = $1',
        [armourName]
      );
      const armourRow = armourResult.rows[0];
      if (!armourRow) {
        return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No such armour.' } });
      }
      armourBonusBullets = armourRow.bonus_bullets;
      armourMultiplier = Number(armourRow.multiplier);
      resolvedArmourName = armourName;
    }

    const bulletsNeeded = calculateBulletsToKill({
      targetBaseBullets: rank.baseBulletsToKill,
      gunMultiplier: Number(gunRow.bullet_multiplier),
      armourBonusBullets,
      armourMultiplier,
    });

    return reply.send({
      ok: true,
      data: {
        gun: gunName,
        armour: resolvedArmourName,
        targetRank: rank.name,
        bulletsNeeded,
      },
    });
  });
}
