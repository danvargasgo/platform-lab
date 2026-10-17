import { PgStore } from './store.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const store = new PgStore(url);
await store.init();

let running = true;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(JSON.stringify({ msg: 'worker stopping', signal }));
    running = false;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

while (running) {
  const job = await store.claimNext();
  if (!job) {
    await sleep(1000);
    continue;
  }
  console.log(JSON.stringify({ msg: 'processing job', id: job.id }));
  await sleep(500); // stand in for real work
  await store.complete(job.id);
  console.log(JSON.stringify({ msg: 'job done', id: job.id }));
}

await store.close();
