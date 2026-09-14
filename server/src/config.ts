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

export const env = parsed.data;
