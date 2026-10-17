import { buildApp } from './app.js';
import { PgStore } from './store.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const store = new PgStore(url);
await store.init();

const app = buildApp(store);
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

// Containers get SIGTERM on shutdown. Finish open requests, then close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await store.close();
    process.exit(0);
  });
}
