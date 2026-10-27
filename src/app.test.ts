import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { MemoryStore } from './store.js';

test('health returns ok', async () => {
  const app = buildApp(new MemoryStore());
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('ready returns 503 when the store is down', async () => {
  const store = new MemoryStore();
  store.ping = async () => {
    throw new Error('down');
  };
  const app = buildApp(store);
  const res = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(res.statusCode, 503);
});

test('creating and listing jobs', async () => {
  const app = buildApp(new MemoryStore());
  const created = await app.inject({ method: 'POST', url: '/jobs', payload: { task: 'resize' } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().status, 'queued');

  const list = await app.inject({ method: 'GET', url: '/jobs' });
  assert.equal(list.json().length, 1);
});

test('creating a job without a body fails', async () => {
  const app = buildApp(new MemoryStore());
  const res = await app.inject({ method: 'POST', url: '/jobs' });
  assert.equal(res.statusCode, 400);
});

test('metrics count requests by route pattern and leave out /metrics itself', async () => {
  const app = buildApp(new MemoryStore());
  await app.inject({ method: 'GET', url: '/jobs' });
  await app.inject({ method: 'POST', url: '/jobs' });
  await app.inject({ method: 'GET', url: '/nope' });

  const res = await app.inject({ method: 'GET', url: '/metrics' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /text\/plain/);
  assert.match(res.body, /http_request_duration_seconds_count\{method="GET",route="\/jobs",status_code="200"\} 1/);
  assert.match(res.body, /http_request_duration_seconds_count\{method="POST",route="\/jobs",status_code="400"\} 1/);
  assert.match(res.body, /route="unmatched",status_code="404"/);
  assert.doesNotMatch(res.body, /route="\/metrics"/);
  assert.match(res.body, /process_cpu_user_seconds_total/);
});

test('a worker claims queued jobs one at a time', async () => {
  const store = new MemoryStore();
  await store.create({ a: 1 });
  await store.create({ a: 2 });
  const first = await store.claimNext();
  const second = await store.claimNext();
  const third = await store.claimNext();
  assert.notEqual(first?.id, second?.id);
  assert.equal(third, null);
});
