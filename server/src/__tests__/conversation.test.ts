import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';

describe('Conversation API', () => {
  let app: Application;
  let workspaceId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    workspaceId = result.workspaceId;
    cleanup = result.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ---- CREATE ----
  describe('POST /api/v1/conversations', () => {
    it('creates a conversation with a provided title', async () => {
      const res = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'Test Conversation' });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Test Conversation');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.workspaceId).toBe(workspaceId);
    });

    it('creates a conversation with a default title when title is omitted', async () => {
      const res = await supertest(app)
        .post('/api/v1/conversations')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('New Conversation');
    });

    it('rejects a title that is too long', async () => {
      const res = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'A'.repeat(201) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty string title', async () => {
      const res = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---- LIST ----
  describe('GET /api/v1/conversations', () => {
    it('lists conversations for the workspace', async () => {
      const res = await supertest(app).get('/api/v1/conversations');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('supports title search with q parameter', async () => {
      const unique = `SearchTarget-${Date.now()}`;
      await supertest(app).post('/api/v1/conversations').send({ title: unique });

      const res = await supertest(app).get(`/api/v1/conversations?q=${unique}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].title).toBe(unique);
    });

    it('rejects an invalid limit parameter', async () => {
      const res = await supertest(app).get('/api/v1/conversations?limit=abc');
      expect(res.status).toBe(400);
    });

    it('rejects an out-of-range limit parameter', async () => {
      const res = await supertest(app).get('/api/v1/conversations?limit=0');
      expect(res.status).toBe(400);
    });

    it('supports pagination limit', async () => {
      const res = await supertest(app).get('/api/v1/conversations?limit=2');
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(2);
    });
  });

  // ---- GET BY ID ----
  describe('GET /api/v1/conversations/:id', () => {
    it('retrieves a conversation with messages array', async () => {
      const createRes = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'Retrieval Test' });
      const id = createRes.body.data.id as string;

      const res = await supertest(app).get(`/api/v1/conversations/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.title).toBe('Retrieval Test');
      expect(Array.isArray(res.body.data.messages)).toBe(true);
    });

    it('returns 404 for a nonexistent conversation', async () => {
      const res = await supertest(app).get('/api/v1/conversations/nonexistent-id-xyz');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('enforces workspace isolation — cannot access another workspace conversation', async () => {
      const otherWorkspace = await prisma.workspace.create({ data: {} });
      const otherConv = await prisma.conversation.create({
        data: {
          workspaceId: otherWorkspace.id,
          title: 'Other Workspace Conversation',
        },
      });

      const res = await supertest(app).get(`/api/v1/conversations/${otherConv.id}`);
      expect(res.status).toBe(404);

      await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
    });
  });

  // ---- RENAME ----
  describe('PATCH /api/v1/conversations/:id', () => {
    it('renames a conversation', async () => {
      const createRes = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'Original Title' });
      const id = createRes.body.data.id as string;

      const res = await supertest(app)
        .patch(`/api/v1/conversations/${id}`)
        .send({ title: 'Renamed Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Renamed Title');
    });

    it('rejects renaming with an empty title', async () => {
      const createRes = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'Some Title' });
      const id = createRes.body.data.id as string;

      const res = await supertest(app)
        .patch(`/api/v1/conversations/${id}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when renaming a nonexistent conversation', async () => {
      const res = await supertest(app)
        .patch('/api/v1/conversations/nonexistent-id-xyz')
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
    });
  });

  // ---- DELETE ----
  describe('DELETE /api/v1/conversations/:id', () => {
    it('deletes a conversation and returns 204', async () => {
      const createRes = await supertest(app)
        .post('/api/v1/conversations')
        .send({ title: 'To Be Deleted' });
      const id = createRes.body.data.id as string;

      const deleteRes = await supertest(app).delete(`/api/v1/conversations/${id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await supertest(app).get(`/api/v1/conversations/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 when deleting a nonexistent conversation', async () => {
      const res = await supertest(app).delete('/api/v1/conversations/nonexistent-id-xyz');
      expect(res.status).toBe(404);
    });

    it('enforces workspace isolation — cannot delete another workspace conversation', async () => {
      const otherWorkspace = await prisma.workspace.create({ data: {} });
      const otherConv = await prisma.conversation.create({
        data: {
          workspaceId: otherWorkspace.id,
          title: 'Protected Conversation',
        },
      });

      const res = await supertest(app).delete(`/api/v1/conversations/${otherConv.id}`);
      expect(res.status).toBe(404);

      const stillExists = await prisma.conversation.findUnique({ where: { id: otherConv.id } });
      expect(stillExists).not.toBeNull();

      await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
    });
  });
});
