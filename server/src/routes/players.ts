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
  gang_name: string | null;
  gang_rank: string | null;
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
      `SELECT u.username, u.state, u.mafia_xp, u.cash, u.dead_until, u.jail_until, u.hospital_until,
              u.crimes_committed, u.crimes_succeeded, u.crimes_failed, u.kills, u.deaths,
              u.jail_seconds_served, u.times_arrested, u.successful_busts, u.failed_busts,
              gn.name AS gang_name, gm.rank AS gang_rank
       FROM users u
       LEFT JOIN gang_members gm ON gm.user_id = u.id
       LEFT JOIN gangs gn ON gn.id = gm.gang_id AND gn.disbanded_at IS NULL
       WHERE lower(u.username) = lower($1)`,
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
        gang: user.gang_name ? { name: user.gang_name, rank: user.gang_rank } : null,
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
