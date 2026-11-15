import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';

describe('GET /api/v1/health', () => {
  let app: Application;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    cleanup = result.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns 200 with status ok when database is reachable', async () => {
    const res = await supertest(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp as string).toISOString()).toBe(res.body.timestamp);
  });

  it('returns correct content-type', async () => {
    const res = await supertest(app).get('/api/v1/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
