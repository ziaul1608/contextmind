import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';
import { memoryService, containsSensitiveSecrets } from '../services/memory.service';
import {
  ollamaService,
  OllamaStreamResult,
  OllamaTool,
  OllamaChatMessage,
} from '../services/ollama.service';

let mockStreamTurnHandler: (
  messages: OllamaChatMessage[],
  tools?: OllamaTool[],
  callbacks?: { onText: (d: string) => void },
  abortSignal?: AbortSignal,
  systemPrompt?: string,
) => Promise<OllamaStreamResult>;
let capturedSystemPrompt: string | undefined;

describe('Phase 4: Persistent Memory & Historical Retrieval', () => {
  let app: Application;
  let workspaceId: string;
  let conversationId: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    workspaceId = result.workspaceId;
    cleanup = result.cleanup;

    const conv = await prisma.conversation.create({
      data: {
        workspaceId,
        title: 'Project Setup Conversation',
        summary: 'Decided on PostgreSQL database and React frontend for ContextMind.',
      },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSystemPrompt = undefined;
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
      reachable: true,
      modelInstalled: true,
      installedModels: ['qwen2.5:3b'],
      currentModel: 'qwen2.5:3b',
    });
    vi.spyOn(ollamaService, 'streamTurn').mockImplementation(
      async (messages, tools, callbacks, abortSignal, systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return mockStreamTurnHandler(messages, tools, callbacks, abortSignal, systemPrompt);
      },
    );
  });

  // ==========================================
  // 1. Memory Storage & CRUD APIs
  // ==========================================
  describe('Memory Storage & Provenance', () => {
    let createdMemoryId: string;

    it('creates a memory with category and provenance', async () => {
      const res = await supertest(app)
        .post('/api/v1/memories')
        .send({
          content: 'The user prefers TypeScript over JavaScript.',
          category: 'preference',
          importance: 0.9,
          sourceConversationId: conversationId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe('The user prefers TypeScript over JavaScript.');
      expect(res.body.data.category).toBe('preference');
      expect(res.body.data.importance).toBe(0.9);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.sourceConversationId).toBe(conversationId);

      createdMemoryId = res.body.data.id;
    });

    it('retrieves memory details and provenance via GET /api/v1/memories/:id', async () => {
      const res = await supertest(app).get(`/api/v1/memories/${createdMemoryId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.memoryId).toBe(createdMemoryId);
      expect(res.body.data.conversationId).toBe(conversationId);
      expect(res.body.data.conversationTitle).toBe('Project Setup Conversation');
      expect(res.body.data.sourceType).toBe('user_provided');
      expect(res.body.data.originalTimestamp).toBeDefined();
    });

    it('lists memories filtered by category', async () => {
      const res = await supertest(app).get('/api/v1/memories?category=preference');
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].category).toBe('preference');
    });

    it('updates a memory status or importance via PATCH /api/v1/memories/:id', async () => {
      const res = await supertest(app)
        .patch(`/api/v1/memories/${createdMemoryId}`)
        .send({ importance: 1.0 });

      expect(res.status).toBe(200);
      expect(res.body.data.importance).toBe(1.0);
    });

    it('enforces workspace isolation: cannot access memory from another workspace', async () => {
      const otherWorkspace = await prisma.workspace.create({ data: {} });
      const otherMemory = await prisma.memory.create({
        data: {
          workspaceId: otherWorkspace.id,
          content: 'Confidential other workspace data',
          category: 'fact',
        },
      });

      const res = await supertest(app).get(`/api/v1/memories/${otherMemory.id}`);
      expect(res.status).toBe(404);

      // Cleanup
      await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
    });

    it('deletes a memory via DELETE /api/v1/memories/:id', async () => {
      const tempMem = await prisma.memory.create({
        data: {
          workspaceId,
          content: 'Temporary memory to delete',
          category: 'fact',
        },
      });

      const delRes = await supertest(app).delete(`/api/v1/memories/${tempMem.id}`);
      expect(delRes.status).toBe(204);

      const getRes = await supertest(app).get(`/api/v1/memories/${tempMem.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ==========================================
  // 2. Historical Retrieval
  // ==========================================
  describe('Historical Retrieval across Workspace', () => {
    beforeAll(async () => {
      // Seed historical records in this workspace
      await prisma.memory.createMany({
        data: [
          {
            workspaceId,
            content: 'We are building ContextMind with PostgreSQL and Prisma ORM.',
            category: 'tech_stack',
            importance: 0.9,
            sourceConversationId: conversationId,
            status: 'active',
          },
          {
            workspaceId,
            content: 'Authentication is handled using JWT Bearer tokens.',
            category: 'tech_stack',
            importance: 0.7,
            sourceConversationId: conversationId,
            status: 'active',
          },
        ],
      });
    });

    it('retrieves relevant memories via full-text search /api/v1/memories/search', async () => {
      const res = await supertest(app).get('/api/v1/memories/search?q=PostgreSQL');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const match = res.body.data.find((item: any) => item.content.includes('PostgreSQL'));
      expect(match).toBeDefined();
    });

    it('searches across conversation summaries', async () => {
      const res = await supertest(app).get('/api/v1/memories/search?q=frontend');
      expect(res.status).toBe(200);
      const summaryMatch = res.body.data.find(
        (item: any) => item.type === 'summary' && item.content.includes('React frontend'),
      );
      expect(summaryMatch).toBeDefined();
      expect(summaryMatch.conversationTitle).toBe('Project Setup Conversation');
    });

    it('retrieves conversation summary directly via GET /api/v1/conversations/:id/summary', async () => {
      const res = await supertest(app).get(`/api/v1/conversations/${conversationId}/summary`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toContain('Decided on PostgreSQL database');
    });

    it('returns empty array when search query finds no matches', async () => {
      const res = await supertest(app).get('/api/v1/memories/search?q=unrelated_nonexistent_term_xyz');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('prevents cross-workspace historical retrieval', async () => {
      const otherWs = await prisma.workspace.create({ data: {} });
      await prisma.memory.create({
        data: {
          workspaceId: otherWs.id,
          content: 'SecretQuantumKey99 is active in other workspace',
          category: 'project',
        },
      });

      const res = await supertest(app).get('/api/v1/memories/search?q=SecretQuantumKey99');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0); // Cannot see other workspace memory

      await prisma.workspace.delete({ where: { id: otherWs.id } });
    });
  });

  // ==========================================
  // 3. Memory Lifecycle, Secret Filtering & Superseding
  // ==========================================
  describe('Memory Lifecycle & Secret Protection', () => {
    it('detects sensitive secrets and refuses to save them to memory', async () => {
      expect(containsSensitiveSecrets('My API key is sk-ant-api03-abcdef1234567890')).toBe(true);
      expect(containsSensitiveSecrets('password := admin123')).toBe(true);
      expect(containsSensitiveSecrets('I like using Tailwind CSS')).toBe(false);

      const extracted = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId,
        userContent: 'My API key is sk-ant-api03-secret1234567890123456 and password is password123',
      });
      expect(extracted).toHaveLength(0); // Zero memories saved with secrets
    });

    it('supersedes an older contradictory fact when a newer fact is extracted', async () => {
      // 1. First statement: "We are using MySQL database"
      const mem1 = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId,
        userContent: 'For the database is MySQL database in this project',
      });
      expect(mem1.length).toBeGreaterThan(0);
      const oldMemId = mem1[0].id;

      // 2. Newer statement: "We are using PostgreSQL database"
      const mem2 = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId,
        userContent: 'Actually the database is PostgreSQL database for our backend',
      });
      expect(mem2.length).toBeGreaterThan(0);
      const newMemId = mem2[0].id;

      // 3. Verify old memory is now 'superseded' and points to new memory
      const updatedOldMem = await prisma.memory.findUnique({ where: { id: oldMemId } });
      expect(updatedOldMem?.status).toBe('superseded');
      expect(updatedOldMem?.supersededById).toBe(newMemId);

      // 4. Verify new memory is active
      const activeMem = await prisma.memory.findUnique({ where: { id: newMemId } });
      expect(activeMem?.status).toBe('active');
    });

    it('prevents saving duplicate memories for identical statements', async () => {
      const statement = 'The application is called ContextMind Conversational Bot';
      const first = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId,
        userContent: statement,
      });

      const second = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId,
        userContent: statement,
      });

      expect(first.length).toBeGreaterThan(0);
      expect(second).toHaveLength(0); // Duplicate ignored
    });
  });

  // ==========================================
  // ==========================================
  // 4. Ollama Context Injection & Memory Retrieval Workflow
  // ==========================================
  describe('Memory Context Injection into Agent Workflow', () => {
    it('injects relevant historical memories into system prompt and emits memory_retrieved event', async () => {
      // Create a new separate conversation in the same workspace
      const newConv = await prisma.conversation.create({
        data: { workspaceId, title: 'New Conversation B' },
      });

      mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
        callbacks?.onText('You are using PostgreSQL for your database.');
        return {
          fullText: 'You are using PostgreSQL for your database.',
          toolCalls: [],
          inputTokens: 40,
          outputTokens: 15,
          model: 'qwen2.5:3b',
        };
      };

      const res = await supertest(app)
        .post(`/api/v1/conversations/${newConv.id}/messages`)
        .send({ content: 'What database am I using in ContextMind?' });

      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const body = res.text;

      // Verify memory_retrieved SSE event was emitted
      expect(body).toContain('event: memory_retrieved');
      expect(body).toContain('"count"');

      // Verify that Ollama received <historical_memory_context> in its system prompt
      expect(capturedSystemPrompt).toBeDefined();
      expect(capturedSystemPrompt).toContain('<historical_memory_context>');
      expect(capturedSystemPrompt).toContain('PostgreSQL');
    });

    it('does NOT inject memories when user asks an unrelated general question', async () => {
      const generalConv = await prisma.conversation.create({
        data: { workspaceId, title: 'General Math' },
      });

      mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
        callbacks?.onText('42');
        return {
          fullText: '42',
          toolCalls: [],
          inputTokens: 10,
          outputTokens: 5,
          model: 'qwen2.5:3b',
        };
      };

      const res = await supertest(app)
        .post(`/api/v1/conversations/${generalConv.id}/messages`)
        .send({ content: 'What is 6 * 7?' });

      const body = res.text;
      // Should not find or emit memories for unrelated math question
      expect(body).not.toContain('event: memory_retrieved');
      expect(capturedSystemPrompt).not.toContain('<historical_memory_context>');
    });

    it('allows memory retrieval and Phase 3 web search to coexist in one turn if needed', async () => {
      const hybridConv = await prisma.conversation.create({
        data: { workspaceId, title: 'Hybrid Query' },
      });

      // Local AI calls web search while having memory context
      let turn = 0;
      mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
        turn++;
        if (turn === 1) {
          return {
            fullText: '',
            toolCalls: [
              {
                id: 'tool_hybrid_1',
                type: 'function',
                function: {
                  name: 'web_search',
                  arguments: { query: 'PostgreSQL latest release 2026' },
                },
              },
            ],
            inputTokens: 30,
            outputTokens: 10,
            model: 'qwen2.5:3b',
          };
        } else {
          callbacks?.onText('Based on our project memory and web search...');
          return {
            fullText: 'Based on our project memory and web search...',
            toolCalls: [],
            inputTokens: 60,
            outputTokens: 20,
            model: 'qwen2.5:3b',
          };
        }
      };

      const res = await supertest(app)
        .post(`/api/v1/conversations/${hybridConv.id}/messages`)
        .send({ content: 'What is the latest release of our database PostgreSQL?' });

      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.text).toContain('event: memory_retrieved');
      expect(res.text).toContain('event: status');
      expect(res.text).toContain('"phase":"searching"');
      expect(res.text).toContain('event: done');
    });
  });
});
