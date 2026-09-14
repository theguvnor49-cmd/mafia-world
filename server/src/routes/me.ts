import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { requireAuth } from '../auth';

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
}

/** Derives ALIVE / DEAD / JAIL / HOSPITAL from timestamps. Server time is authoritative. */
function deriveStatus(user: UserRow): 'ALIVE' | 'DEAD' | 'JAIL' | 'HOSPITAL' {
  const now = Date.now();
  if (user.dead_until && new Date(user.dead_until).getTime() > now) return 'DEAD';
  if (user.jail_until && new Date(user.jail_until).getTime() > now) return 'JAIL';
  if (user.hospital_until && new Date(user.hospital_until).getTime() > now) return 'HOSPITAL';
  return 'ALIVE';
}

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;

    const result = await pool.query<UserRow>(
      `SELECT id, username, email, created_at, last_seen, state, cash, premium_points,
              mafia_xp, bullets, equipped_gun, equipped_armour, heat,
              dead_until, jail_until, hospital_until
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

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
        bullets: user.bullets,
        equipped_gun: user.equipped_gun,
        equipped_armour: user.equipped_armour,
        heat: user.heat,
        status: deriveStatus(user),
      },
    });
  });
}
