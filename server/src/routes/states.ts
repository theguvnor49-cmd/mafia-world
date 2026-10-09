import type { FastifyInstance } from 'fastify';
import { pool } from '../db';

/** Static reference data (brief section 9) — public, no auth needed. */
export async function statesRoutes(app: FastifyInstance) {
  app.get('/api/v1/states', async (_request, reply) => {
    const result = await pool.query<{ name: string }>('SELECT name FROM states ORDER BY display_order');
    return reply.send({ ok: true, data: { states: result.rows.map((r) => r.name) } });
  });
}
