import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../db';
import { env } from '../config';
import { ensureCoopJobExists, resolveClosedJobs } from './coop';

/**
 * Constant-time secret comparison. Buffers of different lengths are
 * rejected before ever reaching `timingSafeEqual` (which throws on a
 * length mismatch rather than returning false) — this leaks only the
 * *length* of the real secret through timing, never anything about its
 * content, which is the standard, accepted tradeoff for this kind of
 * comparison.
 */
function tickSecretMatches(provided: string): boolean {
  const expected = Buffer.from(env.TICK_SECRET);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * `POST /internal/tick` (brief section 28; see GAME_DESIGN.md section 30
 * for the full "why a tick endpoint at all" reasoning). Deliberately NOT a
 * correctness dependency: every lazy-evaluated system in this codebase
 * (heat decay, hunt reveal, and now co-op job creation/resolution)
 * self-heals on its own next real read regardless of whether this
 * endpoint is ever called. It exists only because the brief explicitly
 * asks for something an external scheduler can ping to wake a sleeping
 * free-tier backend — calling it just makes the self-healing happen a
 * little earlier than "whenever a player next checks," never makes
 * anything newly correct that wasn't already going to resolve itself.
 *
 * Not under `/api/v1` — this isn't a player-facing endpoint, it's meant to
 * be called by something that isn't a logged-in player at all (a cron-like
 * external scheduler, or Glenn manually curling it to confirm it's wired
 * up), so it's guarded by a dedicated `X-Tick-Secret` header instead of a
 * player JWT.
 */
export async function tickRoutes(app: FastifyInstance) {
  app.post('/internal/tick', async (request, reply) => {
    const provided = request.headers['x-tick-secret'];
    if (typeof provided !== 'string' || provided.length === 0 || !tickSecretMatches(provided)) {
      return reply.code(401).send({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing X-Tick-Secret header.' },
      });
    }

    const result = await withTransaction(async (client) => {
      // Same order as every other entry point into the co-op system
      // (routes/coop.ts): settle the past, then set up the future. No
      // caller to attribute a payout notification to here — this endpoint
      // isn't a player, so `resolveClosedJobs` is called without an id.
      const { resolvedJobIds } = await resolveClosedJobs(client);
      const coopJobCreated = await ensureCoopJobExists(client);

      return {
        coopJobCreated,
        coopJobsResolved: resolvedJobIds.length,
      };
    });

    return reply.send({ ok: true, data: result });
  });
}
