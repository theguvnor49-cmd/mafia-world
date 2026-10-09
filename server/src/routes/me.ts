import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { getRankForXp } from '../mafia/ranks';
import { deriveStatus } from '../mafia/status';

interface UserRow {
  id: string;
  username: string;
  email: string;
  created_at: string;
  last_seen: string;
  state: string;
  cash: string; // bigint comes back as string from pg by default
  premium_points: number;
  mafia_xp: string;
  bullets: number;
  equipped_gun: string | null;
  gun_bullet_multiplier: string | null;
  equipped_armour: string | null;
  armour_bonus_bullets: number | null;
  armour_multiplier: string | null;
  heat: number;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  crimes_committed: number;
  crimes_succeeded: number;
  crimes_failed: number;
  kills: number;
  deaths: number;
  bullets_fired: number;
  bullets_spent: number;
  cash_earned: string;
  cash_lost: string;
  cars_stolen: number;
  cars_melted: number;
  jail_seconds_served: string;
  times_arrested: number;
  successful_busts: number;
  failed_busts: number;
}

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    const result = await pool.query<UserRow>(
      `SELECT u.id, u.username, u.email, u.created_at, u.last_seen, u.state, u.cash, u.premium_points,
              u.mafia_xp, u.bullets, u.equipped_gun, g.bullet_multiplier AS gun_bullet_multiplier,
              u.equipped_armour, a.bonus_bullets AS armour_bonus_bullets, a.multiplier AS armour_multiplier,
              u.heat, u.dead_until, u.jail_until, u.hospital_until,
              u.crimes_committed, u.crimes_succeeded, u.crimes_failed, u.kills, u.deaths,
              u.bullets_fired, u.bullets_spent, u.cash_earned, u.cash_lost, u.cars_stolen, u.cars_melted,
              u.jail_seconds_served, u.times_arrested, u.successful_busts, u.failed_busts
       FROM users u
       LEFT JOIN guns g ON g.name = u.equipped_gun
       LEFT JOIN armour a ON a.name = u.equipped_armour
       WHERE u.id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const rank = getRankForXp(Number(user.mafia_xp));

    return reply.send({
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        lastSeen: user.last_seen,
        state: user.state,
        cash: Number(user.cash),
        premium_points: user.premium_points,
        mafia_xp: Number(user.mafia_xp),
        rank: rank.name,
        bullets: user.bullets,
        equippedGun: user.equipped_gun
          ? { name: user.equipped_gun, bulletMultiplier: Number(user.gun_bullet_multiplier) }
          : null,
        equippedArmour: user.equipped_armour
          ? {
              name: user.equipped_armour,
              bonusBullets: user.armour_bonus_bullets,
              multiplier: Number(user.armour_multiplier),
            }
          : null,
        heat: user.heat,
        status: deriveStatus(user),
        // The raw timers, not just the derived status string — the
        // dashboard's DEAD banner and /mafia/revive need to show *when*
        // (brief section 17's "Dead until: 18:42 tomorrow" example), not
        // just *that*.
        deadUntil: user.dead_until,
        jailUntil: user.jail_until,
        hospitalUntil: user.hospital_until,
        stats: {
          crimesCommitted: user.crimes_committed,
          crimesSucceeded: user.crimes_succeeded,
          crimesFailed: user.crimes_failed,
          kills: user.kills,
          deaths: user.deaths,
          bulletsFired: user.bullets_fired,
          bulletsSpent: user.bullets_spent,
          cashEarned: Number(user.cash_earned),
          cashLost: Number(user.cash_lost),
          carsStolen: user.cars_stolen,
          carsMelted: user.cars_melted,
          jailSecondsServed: Number(user.jail_seconds_served),
          timesArrested: user.times_arrested,
          successfulBusts: user.successful_busts,
          failedBusts: user.failed_busts,
        },
      },
    });
  });
}
