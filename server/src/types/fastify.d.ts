import type { JwtPayload } from '../auth';

// Augments Fastify's request type so `request.user` (set by the
// `requireAuth` preHandler in src/auth.ts) is known to TypeScript
// everywhere without casting.
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}
