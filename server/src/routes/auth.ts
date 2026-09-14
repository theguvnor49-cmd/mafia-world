import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { hashPassword, verifyPassword, signToken } from '../auth';

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.')
    .max(20, 'Username must be at most 20 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or email is required.'),
  password: z.string().min(1, 'Password is required.'),
});

// MVP assumption: not specified in the brief. Configurable — move to a
// balancing table once Phase 12 (economy/balancing) exists.
const STARTING_CASH = 5000;

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      });
    }
    const { username, email, password } = parsed.data;

    const existing = await pool.query(
      'SELECT id FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
      [username, email]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return reply.code(409).send({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: 'That username or email is already taken.' },
      });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, cash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username`,
      [username, email, passwordHash, STARTING_CASH]
    );
    const user = result.rows[0] as { id: string; username: string };
    const token = signToken({ userId: user.id, username: user.username });

    return reply.code(201).send({ ok: true, data: { token } });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Username/email and password are required.' },
      });
    }
    const { identifier, password } = parsed.data;

    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [identifier]
    );
    const user = result.rows[0] as { id: string; username: string; password_hash: string } | undefined;

    // Deliberately identical error for "no such user" and "wrong password" —
    // don't leak which one it was.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username/email or password.' },
      });
    }

    await pool.query('UPDATE users SET last_seen = now() WHERE id = $1', [user.id]);

    const token = signToken({ userId: user.id, username: user.username });
    return reply.send({ ok: true, data: { token } });
  });
}
