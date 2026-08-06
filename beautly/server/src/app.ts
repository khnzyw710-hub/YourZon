import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { errorHandler } from './middleware/errorHandler';

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  app.setErrorHandler(errorHandler);

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(userRoutes);

  return app;
}
