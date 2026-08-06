import { buildApp } from './app';
import { env } from './config/env';

async function start() {
  const app = await buildApp();

  try {
    const port = parseInt(env.PORT, 10);
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Beautly server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
