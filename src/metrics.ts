import type { FastifyInstance } from 'fastify';
import client from 'prom-client';

// Each app gets its own registry, so tests can build several apps without clashing.
export function registerMetrics(app: FastifyInstance) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const duration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    // The route pattern, never the raw URL, keeps the number of label values small.
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });

  const startTimes = new WeakMap<object, bigint>();

  app.addHook('onRequest', async (req) => {
    startTimes.set(req, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    const start = startTimes.get(req);
    if (start === undefined) return;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    duration.observe({ method: req.method, route, status_code: reply.statusCode }, seconds);
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });
}
