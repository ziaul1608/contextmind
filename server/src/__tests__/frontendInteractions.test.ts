import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';
import { ollamaService } from '../services/ollama.service';

describe('Frontend Interactions & New Chat Regression Suite', () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
      reachable: true,
      modelInstalled: true,
      installedModels: ['qwen2.5:3b'],
      currentModel: 'qwen2.5:3b',
    });
    vi.spyOn(ollamaService, 'streamTurn').mockImplementation(async (_messages, _tools, callbacks) => {
      callbacks?.onText('Mocked local response');
      return {
        fullText: 'Mocked local response',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
        model: 'qwen2.5:3b',
      };
    });
  });

  // A. New Chat successfully creates and selects a conversation
  it('A. New Chat creates a conversation with 201 and returns id', async () => {
    const res = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'New Chat from Button' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe('New Chat from Button');
    expect(res.body.data.workspaceId).toBe(workspaceId);

    // Verify it is immediately listable in sidebar
    const listRes = await supertest(app).get('/api/v1/conversations');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.items.some((c: any) => c.id === res.body.data.id);
    expect(found).toBe(true);
  });

  // B. New Chat works regardless of local AI daemon state
  it('B. New Chat works regardless of local AI daemon state', async () => {
    const res = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Autonomous Conversation' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
  });

  // C. Send button / Enter submits a message and persists it
  it('C. Message submission creates user message in database before streaming', async () => {
    const convRes = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Submission Test' });
    const convId = convRes.body.data.id;

    // Send a message
    const msgRes = await supertest(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .send({ content: 'Explain quantum entanglement' });

    expect(msgRes.status).toBe(200);
    expect(msgRes.headers['content-type']).toMatch(/text\/event-stream/);
    expect(msgRes.text).toContain('event: meta');

    // Verify user message is committed to database
    const dbConv = await prisma.conversation.findUnique({
      where: { id: convId },
      include: { messages: true },
    });
    const userMessage = dbConv?.messages.find((m) => m.role === 'USER');
    expect(userMessage).toBeDefined();
    expect(userMessage?.content).toBe('Explain quantum entanglement');
  });

  // D. Empty and whitespace-only messages are rejected
  it('D. Empty or whitespace-only messages are rejected with 400', async () => {
    const convRes = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Validation Chat' });
    const convId = convRes.body.data.id;

    const res = await supertest(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .send({ content: '    ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // E. Local AI daemon unavailable emits LOCAL_AI_UNAVAILABLE without losing user message
  it('E. Local AI daemon unavailable emits LOCAL_AI_UNAVAILABLE error cleanly', async () => {
    const convRes = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'AI Unavailable Test' });
    const convId = convRes.body.data.id;

    // Mock ollama checkHealth to report unreachable
    const checkHealthSpy = vi.spyOn(ollamaService, 'checkHealth').mockResolvedValueOnce({
      reachable: false,
      modelInstalled: false,
      installedModels: [],
      currentModel: 'qwen2.5:3b',
      error: 'Connection refused',
    });

    try {
      const msgRes = await supertest(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .send({ content: 'Test question during daemon outage' });

      expect(msgRes.status).toBe(200);
      expect(msgRes.text).toContain('event: meta');
      expect(msgRes.text).toContain('event: error');
      expect(msgRes.text).toContain('LOCAL_AI_UNAVAILABLE');
      expect(msgRes.text).toContain('Local AI model is unavailable');

      // User message is preserved in PostgreSQL
      const dbMessages = await prisma.message.findMany({
        where: { conversationId: convId },
      });
      expect(dbMessages.length).toBe(1);
      expect(dbMessages[0].content).toBe('Test question during daemon outage');
    } finally {
      checkHealthSpy.mockRestore();
    }
  });

  // F. Suggested prompt submission persists properly
  it('F. Suggested prompt submission behaves identically to typed message', async () => {
    const convRes = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Suggested Prompt Chat' });
    const convId = convRes.body.data.id;

    const promptText = 'What is the difference between B-tree and GIN indexes in PostgreSQL?';
    const msgRes = await supertest(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .send({ content: promptText });

    expect(msgRes.status).toBe(200);
    expect(msgRes.text).toContain('event: meta');

    const checkConv = await prisma.conversation.findUnique({
      where: { id: convId },
      include: { messages: true },
    });
    expect(checkConv?.messages[0].content).toBe(promptText);
  });

  // G. Self-healing workspace: even if workspace is deleted from PostgreSQL, server recovers
  it('G. Self-healing workspace middleware recovers from deleted workspace without 500 error', async () => {
    // Intentionally delete the test workspace to simulate an external deletion / cache desync
    await prisma.workspace.delete({ where: { id: workspaceId } });

    // The next conversation creation should automatically recover, create a new workspace, and succeed
    const res = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Self-Healed Conversation' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe('Self-Healed Conversation');

    // Update workspaceId for subsequent cleanup
    workspaceId = res.body.data.workspaceId;
  });

  // H. Duplicate message prevention: multiple sends with different content are saved cleanly
  it('H. Successive messages maintain correct chronological ordering', async () => {
    const convRes = await supertest(app)
      .post('/api/v1/conversations')
      .send({ title: 'Multi-turn Ordering' });
    const convId = convRes.body.data.id;

    await supertest(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .send({ content: 'Turn 1' });

    await supertest(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .send({ content: 'Turn 2' });

    const conv = await prisma.conversation.findUnique({
      where: { id: convId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    const userMessages = (conv?.messages || []).filter((m) => m.role === 'USER');
    expect(userMessages.length).toBe(2);
    expect(userMessages[0].content).toBe('Turn 1');
    expect(userMessages[1].content).toBe('Turn 2');
  });
});
