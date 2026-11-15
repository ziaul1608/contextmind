import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';

import { ollamaService } from '../services/ollama.service';

describe('Message API — POST /api/v1/conversations/:id/messages', () => {
  let app: Application;
  let workspaceId: string;
  let conversationId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    workspaceId = result.workspaceId;
    cleanup = result.cleanup;

    // Create a test conversation
    const conv = await prisma.conversation.create({
      data: { workspaceId, title: 'Test Chat' },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
      reachable: true,
      modelInstalled: true,
      installedModels: ['qwen2.5:3b'],
      currentModel: 'qwen2.5:3b',
    });

    vi.spyOn(ollamaService, 'streamTurn').mockImplementation(async (_messages, _tools, callbacks) => {
      callbacks.onText('Hello');
      callbacks.onText(', world!');
      return {
        fullText: 'Hello, world!',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
        model: 'qwen2.5:3b',
      };
    });
  });

  // ── Validation ───────────────────────────────────────────────
  it('rejects empty content', async () => {
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects content exceeding 8000 characters', async () => {
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'A'.repeat(8001) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing content field', async () => {
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({});

    expect(res.status).toBe(400);
  });

  // ── Nonexistent conversation ──────────────────────────────────
  it('returns 404 error via SSE for nonexistent conversation', async () => {
    const res = await supertest(app)
      .post('/api/v1/conversations/nonexistent-conv-id/messages')
      .send({ content: 'Hello' });

    // Response should be SSE
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;
    expect(body).toContain('event: error');
    expect(body).toContain('NOT_FOUND');
  });

  // ── Workspace isolation ───────────────────────────────────────
  it('enforces workspace isolation — cannot send message to another workspace conversation', async () => {
    const otherWorkspace = await prisma.workspace.create({ data: {} });
    const otherConv = await prisma.conversation.create({
      data: { workspaceId: otherWorkspace.id, title: 'Other WS' },
    });

    const res = await supertest(app)
      .post(`/api/v1/conversations/${otherConv.id}/messages`)
      .send({ content: 'Should be blocked' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('NOT_FOUND');

    await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
  });

  // ── Successful streaming ──────────────────────────────────────
  it('returns SSE stream with correct headers', async () => {
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Say hello' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
  });

  it('emits meta, status, text_delta, and done SSE events', async () => {
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Say hello' });

    const body = res.text;
    expect(body).toContain('event: meta');
    expect(body).toContain('event: status');
    expect(body).toContain('event: text_delta');
    expect(body).toContain('event: done');
    expect(body).toContain('"phase":"thinking"');
    expect(body).toContain('"delta"');
  });

  it('persists user message in the database', async () => {
    const content = `Test message ${Date.now()}`;
    await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content });

    const saved = await prisma.message.findFirst({
      where: { conversationId, role: 'USER', content },
    });
    expect(saved).not.toBeNull();
  });

  it('persists assistant response in the database', async () => {
    await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Store the assistant reply' });

    const assistantMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(assistantMsg).not.toBeNull();
    expect(assistantMsg?.content).toBe('Hello, world!');
  });

  it('updates conversation updatedAt after a message', async () => {
    const before = await prisma.conversation.findUnique({ where: { id: conversationId } });
    await new Promise((r) => setTimeout(r, 50));

    await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Touch updatedAt' });

    const after = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it('messages are retrievable via GET conversation with chronological order', async () => {
    // Create a fresh conversation for order testing
    const conv = await prisma.conversation.create({
      data: { workspaceId, title: 'Order Test' },
    });

    await supertest(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .send({ content: 'First message' });

    await supertest(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .send({ content: 'Second message' });

    const getRes = await supertest(app).get(`/api/v1/conversations/${conv.id}`);
    expect(getRes.status).toBe(200);

    const messages = getRes.body.data.messages as Array<{ role: string; content: string }>;
    const userMessages = messages.filter((m) => m.role === 'USER');
    expect(userMessages[0].content).toBe('First message');
    expect(userMessages[1].content).toBe('Second message');
  });

  // ── Scenario A: Local AI Unavailable ───────────────────────────
  it('persists user message and emits LOCAL_AI_UNAVAILABLE error when Ollama daemon is unreachable', async () => {
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValueOnce({
      reachable: false,
      modelInstalled: false,
      installedModels: [],
      currentModel: 'qwen2.5:3b',
      error: 'Connection refused',
    });

    const testContent = `Crucial user prompt without daemon ${Date.now()}`;
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: testContent });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;

    // 1. Meta event MUST be emitted so client knows message is saved
    expect(body).toContain('event: meta');
    expect(body).toContain('userMessageId');

    // 2. Error event with LOCAL_AI_UNAVAILABLE code must be emitted
    expect(body).toContain('event: error');
    expect(body).toContain('LOCAL_AI_UNAVAILABLE');
    expect(body).toContain('Local AI model is unavailable');

    // 3. User message MUST be persisted in PostgreSQL and NOT lost
    const savedUserMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'USER', content: testContent },
    });
    expect(savedUserMsg).not.toBeNull();
    expect(savedUserMsg?.content).toBe(testContent);

    // 4. Conversation must still be valid and return the user message
    const getRes = await supertest(app).get(`/api/v1/conversations/${conversationId}`);
    expect(getRes.status).toBe(200);
    const conversationMessages = getRes.body.data.messages;
    const found = conversationMessages.find((m: any) => m.content === testContent);
    expect(found).toBeDefined();
    expect(found.role).toBe('USER');

    // 5. No phantom or empty assistant message was persisted
    const phantomMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'ASSISTANT', content: '' },
    });
    expect(phantomMsg).toBeNull();
  });

  it('persists user message and emits MODEL_NOT_INSTALLED error when configured model is missing', async () => {
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValueOnce({
      reachable: true,
      modelInstalled: false,
      installedModels: ['llama2:latest'],
      currentModel: 'qwen2.5:3b',
    });

    const testContent = `Prompt with uninstalled model ${Date.now()}`;
    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: testContent });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;

    expect(body).toContain('event: meta');
    expect(body).toContain('event: error');
    expect(body).toContain('MODEL_NOT_INSTALLED');
    expect(body).toContain('is not installed in Ollama');

    const savedUserMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'USER', content: testContent },
    });
    expect(savedUserMsg).not.toBeNull();
  });

  // ── Scenario E: Retry after configuration ───────────────────────
  it('allows user to retry sending without creating duplicate messages', async () => {
    const retryConv = await prisma.conversation.create({
      data: { workspaceId, title: 'Retry Test' },
    });

    const retryContent = 'Retrying my query';
    const firstRes = await supertest(app)
      .post(`/api/v1/conversations/${retryConv.id}/messages`)
      .send({ content: retryContent });

    expect(firstRes.status).toBe(200);

    const checkMessages = await prisma.message.findMany({
      where: { conversationId: retryConv.id, role: 'USER' },
    });
    expect(checkMessages).toHaveLength(1);
    expect(checkMessages[0].content).toBe(retryContent);
  });
});
