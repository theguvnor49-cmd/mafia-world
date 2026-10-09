import type { FastifyInstance } from 'fastify';
import { RANKS } from '../mafia/config';

/**
 * Static reference data (brief section 10, like `/api/v1/states`) — public,
 * no auth needed. Exposes the full rank ladder including `baseBulletsToKill`
 * so the frontend bullet calculator (Phase 4, section 12) can let a player
 * pick a hypothetical target rank without guessing the numbers.
 */
export async function ranksRoutes(app: FastifyInstance) {
  app.get('/api/v1/ranks', async (_request, reply) => {
    return reply.send({
      ok: true,
      data: {
        ranks: RANKS.map((rank, index) => ({
          index,
          name: rank.name,
          minXp: rank.minXp,
          baseBulletsToKill: rank.baseBulletsToKill,
        })),
      },
    });
  });
}
