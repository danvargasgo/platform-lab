import Fastify from 'fastify';
import type { JobStore } from './store.js';

export function buildApp(store: JobStore) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Liveness: the process is up. Kubernetes restarts the pod if this fails.
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness: the process can serve traffic, which means the database answers.
  app.get('/ready', async (_req, reply) => {
    try {
      await store.ping();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'database unavailable' });
    }
  });

  app.post('/jobs', async (req, reply) => {
    if (req.body === undefined || req.body === null) {
      return reply.code(400).send({ error: 'JSON body required' });
    }
    const job = await store.create(req.body);
    return reply.code(201).send(job);
  });

  app.get('/jobs', async () => store.list());

  return app;
}
