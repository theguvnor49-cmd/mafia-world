import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './config';
import { pool } from './db';
import { settleDeathIntoHospital } from './mafia/hospital/settle';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  // 7 days is an MVP assumption — not specified in the brief. Revisit once
  // real session/refresh requirements are decided.
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
}

/**
 * Fastify preHandler that enforces a valid `Authorization: Bearer <token>`
 * header and attaches the decoded payload to `request.user`. Route handlers
 * behind this guard can assume `request.user` is set.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.code(401).send({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' },
    });
  }

  const token = header.slice('Bearer '.length);
  try {
    request.user = verifyToken(token);
  } catch {
    return reply.code(401).send({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token.' },
    });
  }

  // Phase 5's witness system (brief section 18) needs "online" to mean
  // something, so every authenticated request refreshes `last_seen`.
  // Debounced to a 1-minute floor so a chatty frontend doesn't turn this
  // into a write-per-request firehose. Deliberately not awaited — this is
  // best-effort freshness, not something the current request should wait
  // on — but errors are still caught so a dropped update can never surface
  // as an unhandled rejection or fail the request it rode in on.
  pool
    .query(`UPDATE users SET last_seen = now() WHERE id = $1 AND last_seen < now() - interval '1 minute'`, [
      request.user.userId,
    ])
    .catch((err) => request.log.error(err, 'Failed to refresh last_seen'));

  // Phase 9's hospital system (brief section 22) needs every protected
  // route to see an up-to-date status, so — unlike the last_seen refresh
  // above — this one IS awaited: a route handler reading `hospital_until`
  // moments after this must see the post-transition value, not a stale
  // one. See `settleDeathIntoHospital`'s own doc comment for why this
  // lives in `mafia/` and gets called from here rather than from each
  // route individually.
  await settleDeathIntoHospital(pool, request.user.userId);
}

/**
 * Fastify preHandler for admin-only routes (Phase 13, GAME_DESIGN.md
 * section 34). Always runs *after* `requireAuth` in a route's preHandler
 * array (`{ preHandler: [requireAuth, requireAdmin] }`) — it trusts
 * `request.user.userId` being already set and doesn't re-verify the JWT
 * itself.
 *
 * Deliberately re-checks `is_admin` fresh from the database on every
 * single request rather than trusting a claim baked into the JWT at
 * login time. Tokens here last 7 days (see `signToken` above); if admin
 * status were a token claim, revoking someone's admin access wouldn't
 * take effect until their token expired or they logged in again — far
 * too slow for a flag that gates currency-granting. The extra query is
 * one indexed primary-key lookup, a cost worth paying for "revoked means
 * revoked, immediately," the same "never trust a cached/stale value for
 * something security-sensitive" reasoning as every other status check in
 * this codebase (see `deriveStatus` and `settleDeathIntoHospital` above).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user?.userId;
  if (!userId) {
    // Defensive only — every real route registers requireAuth first, so
    // request.user is always set by the time this runs.
    return reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } });
  }

  const result = await pool.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [userId]);
  if (!result.rows[0]?.is_admin) {
    return reply.code(403).send({ ok: false, error: { code: 'ADMIN_REQUIRED', message: 'Admin access required.' } });
  }
}
