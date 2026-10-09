import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { playerRoutes } from './routes/players';
import { statesRoutes } from './routes/states';
import { crimeRoutes } from './routes/crimes';
import { ranksRoutes } from './routes/ranks';
import { weaponsRoutes } from './routes/weapons';
import { pvpRoutes } from './routes/pvp';
import { witnessRoutes } from './routes/witness';
import { jailRoutes } from './routes/jail';
import { vehicleRoutes } from './routes/vehicles';
import { coopRoutes } from './routes/coop';
import { tickRoutes } from './routes/tick';
import { hospitalRoutes } from './routes/hospital';
import { gamblingRoutes } from './routes/gambling';
import { gangRoutes } from './routes/gangs';
import { businessRoutes } from './routes/businesses';

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: env.CORS_ORIGIN });

  app.get('/health', async () => ({
    ok: true,
    data: { status: 'up', time: new Date().toISOString() },
  }));

  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(playerRoutes);
  await app.register(statesRoutes);
  await app.register(crimeRoutes);
  await app.register(ranksRoutes);
  await app.register(weaponsRoutes);
  await app.register(pvpRoutes);
  await app.register(witnessRoutes);
  await app.register(jailRoutes);
  await app.register(vehicleRoutes);
  await app.register(coopRoutes);
  await app.register(tickRoutes);
  await app.register(hospitalRoutes);
  await app.register(gamblingRoutes);
  await app.register(gangRoutes);
  await app.register(businessRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    // Never leak stack traces or internals to the client.
    reply.code(error.statusCode ?? 500).send({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
