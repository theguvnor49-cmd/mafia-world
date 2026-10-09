import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './config';
import { pool } from './db';

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
}
