import pg from 'pg';

export type Job = {
  id: number;
  payload: unknown;
  status: 'queued' | 'running' | 'done';
};

export interface JobStore {
  ping(): Promise<void>;
  create(payload: unknown): Promise<Job>;
  list(): Promise<Job[]>;
  claimNext(): Promise<Job | null>;
  complete(id: number): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements JobStore {
  private jobs: Job[] = [];
  private nextId = 1;

  async ping() {}

  async create(payload: unknown) {
    const job: Job = { id: this.nextId++, payload, status: 'queued' };
    this.jobs.push(job);
    return job;
  }

  async list() {
    return [...this.jobs];
  }

  async claimNext() {
    const job = this.jobs.find((j) => j.status === 'queued');
    if (!job) return null;
    job.status = 'running';
    return job;
  }

  async complete(id: number) {
    const job = this.jobs.find((j) => j.id === id);
    if (job) job.status = 'done';
  }

  async close() {}
}

export class PgStore implements JobStore {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async create(payload: unknown) {
    const { rows } = await this.pool.query(
      'INSERT INTO jobs (payload) VALUES ($1) RETURNING id, payload, status',
      [JSON.stringify(payload)],
    );
    return rows[0] as Job;
  }

  async list() {
    const { rows } = await this.pool.query('SELECT id, payload, status FROM jobs ORDER BY id DESC LIMIT 100');
    return rows as Job[];
  }

  // SKIP LOCKED lets several workers pull jobs at the same time without taking the same one.
  async claimNext() {
    const { rows } = await this.pool.query(`
      UPDATE jobs SET status = 'running', updated_at = now()
      WHERE id = (
        SELECT id FROM jobs WHERE status = 'queued'
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING id, payload, status
    `);
    return (rows[0] as Job | undefined) ?? null;
  }

  async complete(id: number) {
    await this.pool.query("UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1", [id]);
  }

  async close() {
    await this.pool.end();
  }
}
