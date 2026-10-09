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
  equipped_armour: string | null;
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
      `SELECT id, username, email, created_at, last_seen, state, cash, premium_points,
              mafia_xp, bullets, equipped_gun, equipped_armour, heat,
              dead_until, jail_until, hospital_until,
              crimes_committed, crimes_succeeded, crimes_failed, kills, deaths,
              bullets_fired, bullets_spent, cash_earned, cash_lost, cars_stolen, cars_melted,
              jail_seconds_served, times_arrested, successful_busts, failed_busts
       FROM users WHERE id = $1`,
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
        equipped_gun: user.equipped_gun,
        equipped_armour: user.equipped_armour,
        heat: user.heat,
        status: deriveStatus(user),
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
