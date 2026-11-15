import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';
import { memoryService } from '../services/memory.service';
import { memoryRepository } from '../repositories/memory.repository';
import { normalizeUrl, webSearchService } from '../services/webSearch.service';

describe('Phase 5 Security, Reliability & Quality Audit', () => {
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

  // =========================================================================
  // 1. Memory Superseding Precision (Follow-up 2.B)
  // =========================================================================
  describe('1. Memory Superseding Precision (Audit 2.B)', () => {
    it('does NOT erase personal preferences when current project usage changes', async () => {
      const conv = await prisma.conversation.create({
        data: { workspaceId, title: 'Preference vs Usage Conv' },
      });

      // 1. User states personal favorite database
      await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'My favorite database is PostgreSQL because of its extension ecosystem.',
      });

      // 2. User states current project tech stack
      await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'I currently use PostgreSQL for this project backend.',
      });

      // 3. User says they no longer use PostgreSQL in the project
      await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'I no longer use PostgreSQL for our microservices.',
      });

      // 4. Verify: Preference memory is STILL ACTIVE; only tech_stack was superseded!
      const activeMemories = await prisma.memory.findMany({
        where: { workspaceId, status: 'active' },
      });

      const preferenceMem = activeMemories.find((m) => m.category === 'preference');
      expect(preferenceMem).toBeDefined();
      expect(preferenceMem?.content).toContain('favorite database is PostgreSQL');

      // The tech_stack memory must be superseded
      const supersededMemories = await prisma.memory.findMany({
        where: { workspaceId, status: 'superseded' },
      });
      const techStackSuperseded = supersededMemories.find((m) => m.category === 'tech_stack');
      expect(techStackSuperseded).toBeDefined();
    });

    it('does NOT store speculative thoughts ("I am considering switching to MongoDB")', async () => {
      const conv = await prisma.conversation.create({
        data: { workspaceId, title: 'Exploration Conv' },
      });

      const extracted = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'I am considering switching to MongoDB for document flexibility.',
      });

      expect(extracted).toHaveLength(0);

      const mongoMemories = await prisma.memory.findMany({
        where: { workspaceId, content: { contains: 'MongoDB' } },
      });
      expect(mongoMemories).toHaveLength(0);
    });

    it('correctly handles explicit migrations ("I switched from PostgreSQL to SQLite")', async () => {
      const conv = await prisma.conversation.create({
        data: { workspaceId, title: 'Migration Conv' },
      });

      // Seed current PostgreSQL usage
      await prisma.memory.create({
        data: {
          workspaceId,
          content: 'using PostgreSQL',
          category: 'tech_stack',
          status: 'active',
          sourceType: 'user_provided',
        },
      });

      // User performs migration
      const extracted = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'I switched from PostgreSQL to SQLite for local file database simplicity.',
      });

      expect(extracted.length).toBeGreaterThan(0);
      expect(extracted[0].content).toContain('using SQLite');
      expect(extracted[0].category).toBe('tech_stack');

      // Check PostgreSQL tech_stack memory is now superseded
      const oldMem = await prisma.memory.findFirst({
        where: {
          workspaceId,
          category: 'tech_stack',
          content: { contains: 'PostgreSQL' },
        },
      });
      expect(oldMem?.status).toBe('superseded');
    });

    it('extracts and persists preferred programming language ("My preferred programming language for backend development is Java.")', async () => {
      const conv = await prisma.conversation.create({
        data: { workspaceId, title: 'Preference Test Conv' },
      });

      const extracted = await memoryService.extractAndSaveMemories({
        workspaceId,
        conversationId: conv.id,
        userContent: 'My preferred programming language for backend development is Java.',
      });

      expect(extracted.length).toBeGreaterThan(0);
      expect(extracted[0].category).toBe('preference');
      expect(extracted[0].content).toContain('Java');
      expect(extracted[0].sourceType).toBe('user_provided');
      expect(extracted[0].importance).toBe(0.75);

      // Verify retrievable via memory repository & API
      const stored = await memoryRepository.findMany({
        workspaceId,
        category: 'preference',
        limit: 10,
      });
      const match = stored.items.find((m) => m.content.includes('Java'));
      expect(match).toBeDefined();
      expect(match?.status).toBe('active');
    });

    it('retrieves cross-conversation historical project code ("PROJECT-ALPHA-729") from separate conversation', async () => {
      // 1. Create first conversation: "ContextMind Historical Retrieval Test"
      const convA = await prisma.conversation.create({
        data: { workspaceId, title: 'ContextMind Historical Retrieval Test' },
      });
      await prisma.message.create({
        data: {
          conversationId: convA.id,
          role: 'USER',
          content: 'For this test, our project code is PROJECT-ALPHA-729.',
        },
      });

      // 2. Create second, completely separate conversation
      const convB = await prisma.conversation.create({
        data: { workspaceId, title: 'Unrelated Query Conversation' },
      });

      // 3. Perform historical context search from conversation B
      const historicalResults = await memoryService.searchHistoricalContext(
        workspaceId,
        'What project code did I mention in my previous conversation?',
        convB.id,
        5,
      );

      // 4. Verify that conversation A message was retrieved with high relevance
      expect(historicalResults.length).toBeGreaterThan(0);
      const foundItem = historicalResults.find(
        (r) => r.content.includes('PROJECT-ALPHA-729'),
      );
      expect(foundItem).toBeDefined();
      expect(foundItem?.conversationId).toBe(convA.id);
      expect(foundItem?.conversationTitle).toBe('ContextMind Historical Retrieval Test');
    });
  });

  // =========================================================================
  // 2. Security & SQL Injection Hardening
  // =========================================================================
  describe('2. Security & SQL Injection Hardening', () => {
    it('safely handles SQL injection attempts in memory search query', async () => {
      const maliciousQuery = "' OR '1'='1'; DROP TABLE memories; --";
      const res = await supertest(app).get(
        `/api/v1/memories/search?q=${encodeURIComponent(maliciousQuery)}`,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Verify memories table still exists and is untouched
      const count = await prisma.memory.count({ where: { workspaceId } });
      expect(typeof count).toBe('number');
    });

    it('safely handles SQL injection attempts in conversation search query', async () => {
      const maliciousQuery = "test'; DROP TABLE conversations; --";
      const res = await supertest(app).get(
        `/api/v1/conversations?q=${encodeURIComponent(maliciousQuery)}`,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);

      const count = await prisma.conversation.count({ where: { workspaceId } });
      expect(typeof count).toBe('number');
    });

    it('enforces payload size limits (rejects bodies exceeding 1MB)', async () => {
      const hugeContent = 'A'.repeat(1.2 * 1024 * 1024); // 1.2 MB
      const res = await supertest(app)
        .post('/api/v1/memories')
        .send({ content: hugeContent });

      // Express body parser returns 413 Payload Too Large
      expect(res.status).toBe(413);
    });

    it('rejects malicious URL schemes in search normalization', () => {
      expect(normalizeUrl('javascript:alert(document.cookie)')).toBeNull();
      expect(normalizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(normalizeUrl('file:///etc/passwd')).toBeNull();
      expect(normalizeUrl('ftp://malicious.org/exploit')).toBeNull();
      expect(normalizeUrl('vbscript:msgbox(1)')).toBeNull();

      // Only safe HTTP and HTTPS are permitted
      expect(normalizeUrl('https://example.com/safe')).toBe('https://example.com/safe');
      expect(normalizeUrl('http://example.com/safe')).toBe('http://example.com/safe');
    });
  });

  // =========================================================================
  // 3. Observability, Request Logging & Health Checks
  // =========================================================================
  describe('3. Observability, Request Logging & Health Checks', () => {
    it('propagates client-provided x-request-id in response header', async () => {
      const customId = 'req-trace-audit-9988';
      const res = await supertest(app)
        .get('/api/v1/conversations')
        .set('x-request-id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('generates a valid UUID x-request-id when client does not supply one', async () => {
      const res = await supertest(app).get('/api/v1/conversations');

      expect(res.status).toBe(200);
      const generatedId = res.headers['x-request-id'];
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('includes provider availability in health check response without leaking credentials', async () => {
      const res = await supertest(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('up');
      expect(res.body.providers).toBeDefined();
      expect(typeof res.body.providers.ollama).toBe('boolean');
      expect(typeof res.body.providers.modelInstalled).toBe('boolean');
      expect(typeof res.body.providers.tavily).toBe('boolean');

      // Verify NO secrets leaked in health payload
      const payloadStr = JSON.stringify(res.body);
      expect(payloadStr).not.toContain('sk-');
      expect(payloadStr).not.toContain('tvly-');
      expect(payloadStr).not.toContain('password');
    });
  });

  // =========================================================================
  // 4. Database Foreign Key Integrity & Cascading
  // =========================================================================
  describe('4. Database Foreign Key Integrity & Cascading', () => {
    it('sets sourceConversationId to NULL when conversation is deleted (SetNull constraint)', async () => {
      // 1. Create conversation and memory linked to it
      const conv = await prisma.conversation.create({
        data: { workspaceId, title: 'To Be Deleted Conversation' },
      });

      const mem = await prisma.memory.create({
        data: {
          workspaceId,
          content: 'Important historical insight linked to conversation.',
          category: 'project_decision',
          sourceConversationId: conv.id,
          sourceType: 'user_provided',
        },
      });

      // 2. Delete the conversation
      await prisma.conversation.delete({ where: { id: conv.id } });

      // 3. Verify memory survives and sourceConversationId is gracefully NULL
      const survivingMem = await prisma.memory.findUnique({
        where: { id: mem.id },
      });
      expect(survivingMem).not.toBeNull();
      expect(survivingMem?.sourceConversationId).toBeNull();
      expect(survivingMem?.content).toBe('Important historical insight linked to conversation.');
    });

    it('cascades deletion of all conversations, messages, and memories when workspace is deleted', async () => {
      // Create isolated workspace with complete child hierarchy
      const tempWorkspace = await prisma.workspace.create({ data: {} });
      const tempConv = await prisma.conversation.create({
        data: { workspaceId: tempWorkspace.id, title: 'Workspace Cascade Test' },
      });
      const tempMsg = await prisma.message.create({
        data: { conversationId: tempConv.id, role: 'USER', content: 'Cascade message' },
      });
      const tempMem = await prisma.memory.create({
        data: {
          workspaceId: tempWorkspace.id,
          content: 'Cascade memory',
          sourceConversationId: tempConv.id,
          sourceMessageId: tempMsg.id,
        },
      });

      // Delete workspace
      await prisma.workspace.delete({ where: { id: tempWorkspace.id } });

      // Verify all children are cleanly deleted
      const checkConv = await prisma.conversation.findUnique({ where: { id: tempConv.id } });
      const checkMsg = await prisma.message.findUnique({ where: { id: tempMsg.id } });
      const checkMem = await prisma.memory.findUnique({ where: { id: tempMem.id } });

      expect(checkConv).toBeNull();
      expect(checkMsg).toBeNull();
      expect(checkMem).toBeNull();
    });
  });

  // =========================================================================
  // 5. Tavily Search Error & Cache Expiration Handling
  // =========================================================================
  describe('5. Tavily Search Error & Cache Expiration Handling', () => {
    it('returns empty results gracefully when search query has no matches', async () => {
      // Mock fetch returning empty results
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            query: 'asldkfjalskdfj90238402934',
            results: [],
            response_time: 0.1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      try {
        const response = await webSearchService.search({
          query: 'asldkfjalskdfj90238402934',
        });
        expect(response.results).toEqual([]);
        expect(response.fromCache).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles HTTP 401 Unauthorized from search provider cleanly', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(
          JSON.stringify({ detail: 'Invalid API key' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );

      try {
        await expect(
          webSearchService.search({ query: 'test auth failure' }),
        ).rejects.toThrow(/status 401/i);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles HTTP 429 Rate Limit from search provider without infinite retries', async () => {
      let callCount = 0;
      const originalFetch = global.fetch;
      global.fetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({ detail: 'Usage limit reached' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        );
      };

      try {
        await expect(
          webSearchService.search({ query: 'test rate limit' }),
        ).rejects.toThrow(/status 429/i);

        // Client errors (4xx) must never be retried
        expect(callCount).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
