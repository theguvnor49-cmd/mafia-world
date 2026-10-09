import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { getRankForXp } from '../mafia/ranks';
import { deriveStatus } from '../mafia/status';

interface PublicUserRow {
  username: string;
  state: string;
  mafia_xp: string;
  cash: string;
  dead_until: string | null;
  jail_until: string | null;
  hospital_until: string | null;
  crimes_committed: number;
  crimes_succeeded: number;
  crimes_failed: number;
  kills: number;
  deaths: number;
  jail_seconds_served: string;
  times_arrested: number;
  successful_busts: number;
  failed_busts: number;
}

/**
 * Public player profile (brief section 35). Deliberately selects only
 * fields that are safe to show to any other player — never email,
 * password_hash, premium_points, bullets, or equipped gear. Requires auth
 * (any logged-in player can look up any other), which is an MVP choice,
 * not a security requirement from the brief — easy to relax into a public
 * leaderboard later if that's wanted.
 */
export async function playerRoutes(app: FastifyInstance) {
  app.get('/api/v1/players/:username', { preHandler: requireAuth }, async (request, reply) => {
    const { username } = request.params as { username: string };

    const result = await pool.query<PublicUserRow>(
      `SELECT username, state, mafia_xp, cash, dead_until, jail_until, hospital_until,
              crimes_committed, crimes_succeeded, crimes_failed, kills, deaths,
              jail_seconds_served, times_arrested, successful_busts, failed_busts
       FROM users WHERE lower(username) = lower($1)`,
      [username]
    );
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'No player with that username.' } });
    }

    const rank = getRankForXp(Number(user.mafia_xp));

    return reply.send({
      ok: true,
      data: {
        username: user.username,
        rank: rank.name,
        mafiaXp: Number(user.mafia_xp),
        status: deriveStatus(user),
        state: user.state,
        cash: Number(user.cash),
        gang: null, // gangs land in Phase 10
        stats: {
          crimesCommitted: user.crimes_committed,
          crimesSucceeded: user.crimes_succeeded,
          crimesFailed: user.crimes_failed,
          kills: user.kills,
          deaths: user.deaths,
          jailSecondsServed: Number(user.jail_seconds_served),
          timesArrested: user.times_arrested,
          successfulBusts: user.successful_busts,
          failedBusts: user.failed_busts,
        },
      },
    });
  });
}
