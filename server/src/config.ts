import 'dotenv/config';
import { z } from 'zod';

/**
 * All environment variables are validated once, at startup, right here.
 * Nothing else in the codebase should read `process.env` directly — import
 * `env` instead. This is also where future balancing/config values that
 * come from the environment (rather than the database) should be parsed.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET should be at least 16 characters'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Comma-separated list of allowed frontend origins (CORS) — a single
  // origin works fine for local dev, but production needs at least two
  // at once (Phase 15): Vercel's own *.vercel.app domain, which keeps
  // working after a custom domain is attached, plus the custom .com
  // domain itself once bought. Split/trimmed below into CORS_ORIGINS.
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TICK_SECRET: z.string().min(16, 'TICK_SECRET should be at least 16 characters'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid or missing environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  console.error('Copy server/.env.example to server/.env and fill in real values.');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Derived, not its own schema field: everything else in the codebase
  // that wants "the" frontend origin for a single-origin purpose (there
  // is none today) can still read CORS_ORIGIN directly; @fastify/cors
  // (index.ts) reads this array instead, since it accepts one natively.
  CORS_ORIGINS: parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
};
