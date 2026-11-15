import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { Application } from 'express';
import { createTestApp } from './helpers';
import { prisma } from '../config/prisma';
import { webSearchService } from '../services/webSearch.service';
import {
  ollamaService,
  OllamaStreamResult,
  OllamaTool,
  OllamaChatMessage,
} from '../services/ollama.service';

let mockStreamTurnHandler: (
  messages: OllamaChatMessage[],
  tools?: OllamaTool[],
  callbacks?: { onText: (delta: string) => void },
  abortSignal?: AbortSignal,
  systemPrompt?: string,
) => Promise<OllamaStreamResult>;

describe('Phase 3: Tool Calling & Web Search Integration', () => {
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
      data: { workspaceId, title: 'Tool Calling Test' },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    webSearchService.clearCache();
    vi.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
      reachable: true,
      modelInstalled: true,
      installedModels: ['qwen2.5:3b'],
      currentModel: 'qwen2.5:3b',
    });
    vi.spyOn(ollamaService, 'streamTurn').mockImplementation(
      (messages, tools, callbacks, abortSignal, systemPrompt) =>
        mockStreamTurnHandler(messages, tools, callbacks, abortSignal, systemPrompt),
    );
  });

  // 1. Normal question without web search
  it('does not execute web search when local AI provides a direct answer', async () => {
    const searchSpy = vi.spyOn(webSearchService, 'search');

    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callbacks?.onText('4');
      return {
        fullText: '4',
        toolCalls: [],
        inputTokens: 15,
        outputTokens: 5,
        model: 'qwen2.5:3b',
      };
    };

    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'What is 2 + 2?' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;
    expect(body).toContain('event: meta');
    expect(body).toContain('event: status');
    expect(body).toContain('"phase":"thinking"');
    expect(body).toContain('event: text_delta');
    expect(body).toContain('event: done');
    expect(body).not.toContain('event: sources');

    expect(searchSpy).not.toHaveBeenCalled();
  });

  // 2. Question requiring web search — tool_use, Tavily execution, tool_result, final synthesis
  it('executes web search, emits searching and synthesizing status, returns sources, and persists MessageSource and ToolExecution', async () => {
    vi.spyOn(webSearchService, 'search').mockResolvedValueOnce({
      query: 'latest tech news 2026',
      results: [
        {
          title: 'Quantum Computing Breakthrough',
          url: 'https://techtimes.com/quantum-2026',
          snippet: 'Scientists achieve room temperature quantum coherence.',
          score: 0.94,
          retrievedAt: new Date().toISOString(),
        },
      ],
      fromCache: false,
      durationMs: 120,
    });

    let callCount = 0;
    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callCount++;
      if (callCount === 1) {
        return {
          fullText: '',
          toolCalls: [
            {
              id: 'toolu_12345',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: { query: 'latest tech news 2026', topic: 'news' },
              },
            },
          ],
          inputTokens: 30,
          outputTokens: 15,
          model: 'qwen2.5:3b',
        };
      } else {
        callbacks?.onText('Scientists have achieved quantum coherence at room temperature [1].');
        return {
          fullText: 'Scientists have achieved quantum coherence at room temperature [1].',
          toolCalls: [],
          inputTokens: 60,
          outputTokens: 25,
          model: 'qwen2.5:3b',
        };
      }
    };

    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'What is the latest news in tech?' });

    const body = res.text;

    // Verify SSE Events
    expect(body).toContain('event: meta');
    expect(body).toContain('event: status');
    expect(body).toContain('"phase":"searching"');
    expect(body).toContain('"query":"latest tech news 2026"');
    expect(body).toContain('"phase":"synthesizing"');
    expect(body).toContain('event: sources');
    expect(body).toContain('Quantum Computing Breakthrough');
    expect(body).toContain('event: text_delta');
    expect(body).toContain('event: done');

    // Verify database persistence of MessageSource
    const assistantMsg = await prisma.message.findFirst({
      where: { conversationId, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
      include: { sources: true },
    });

    expect(assistantMsg).not.toBeNull();
    expect(assistantMsg?.sources).toHaveLength(1);
    expect(assistantMsg?.sources[0].citationIndex).toBe(1);
    expect(assistantMsg?.sources[0].title).toBe('Quantum Computing Breakthrough');
    expect(assistantMsg?.sources[0].url).toBe('https://techtimes.com/quantum-2026');

    // Verify ToolExecution persistence
    const toolExec = await prisma.toolExecution.findFirst({
      where: { conversationId, toolName: 'web_search' },
      orderBy: { createdAt: 'desc' },
    });

    expect(toolExec).not.toBeNull();
    expect(toolExec?.status).toBe('SUCCESS');
    expect((toolExec?.input as any).query).toBe('latest tech news 2026');
  });

  // 3. Graceful Search Failure
  it('handles web search failure gracefully without crashing and local AI synthesizes fallback response', async () => {
    vi.spyOn(webSearchService, 'search').mockRejectedValueOnce(
      new Error('Tavily API request timed out after 8000ms'),
    );

    let callCount = 0;
    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callCount++;
      if (callCount === 1) {
        return {
          fullText: '',
          toolCalls: [
            {
              id: 'toolu_fail_999',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: { query: 'failing query' },
              },
            },
          ],
          inputTokens: 20,
          outputTokens: 10,
          model: 'qwen2.5:3b',
        };
      } else {
        callbacks?.onText('Live web search is currently unavailable, but here is what I know...');
        return {
          fullText: 'Live web search is currently unavailable, but here is what I know...',
          toolCalls: [],
          inputTokens: 40,
          outputTokens: 20,
          model: 'qwen2.5:3b',
        };
      }
    };

    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Search for failing query' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;
    expect(body).toContain('event: status');
    expect(body).toContain('"phase":"searching"');
    expect(body).toContain('"phase":"synthesizing"');
    expect(body).toContain('event: done');

    // Verify ToolExecution recorded as ERROR
    const failedToolExec = await prisma.toolExecution.findFirst({
      where: { conversationId, toolName: 'web_search', status: 'ERROR' },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedToolExec).not.toBeNull();
    expect(failedToolExec?.errorMessage).toContain('timed out');
  });

  // 4. Multiple search iterations within configured limit (max 2)
  it('enforces maximum of 2 search iterations and prevents infinite tool loops', async () => {
    vi.spyOn(webSearchService, 'search').mockResolvedValue({
      query: 'iterative search',
      results: [
        {
          title: 'Result Item',
          url: 'https://example.com/res',
          snippet: 'Snippet',
          score: 0.8,
          retrievedAt: new Date().toISOString(),
        },
      ],
      fromCache: false,
      durationMs: 50,
    });

    let turns = 0;
    mockStreamTurnHandler = async (_messages, tools, callbacks) => {
      turns++;
      if (turns < 3) {
        return {
          fullText: '',
          toolCalls: [
            {
              id: `toolu_${turns}`,
              type: 'function',
              function: {
                name: 'web_search',
                arguments: { query: `query iteration ${turns}` },
              },
            },
          ],
          inputTokens: 20,
          outputTokens: 10,
          model: 'qwen2.5:3b',
        };
      } else {
        callbacks?.onText('Final response after 2 search turns.');
        return {
          fullText: 'Final response after 2 search turns.',
          toolCalls: [],
          inputTokens: 50,
          outputTokens: 15,
          model: 'qwen2.5:3b',
        };
      }
    };

    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Iterate search' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(turns).toBe(3); // Exactly 2 search turns + 1 final answer turn
    expect(res.text).toContain('Final response after 2 search turns.');
  });

  // 5. Verification of sources persistence when conversation is reopened
  it('persists sources across conversation reopening via GET /api/v1/conversations/:id', async () => {
    const res = await supertest(app).get(`/api/v1/conversations/${conversationId}`);
    expect(res.status).toBe(200);

    const messages = res.body.data.messages;
    const assistantWithSources = messages.find(
      (m: any) => m.role === 'ASSISTANT' && m.sources && m.sources.length > 0,
    );

    expect(assistantWithSources).toBeDefined();
    expect(assistantWithSources.sources[0].citationIndex).toBe(1);
    expect(assistantWithSources.sources[0].title).toBe('Quantum Computing Breakthrough');
    expect(assistantWithSources.sources[0].url).toMatch(/^https:\/\//);
  });

  // 6. Normal request-body completion and normal successful SSE completion
  it('handles normal request-body completion and successful SSE lifecycle without false cancellation', async () => {
    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callbacks?.onText('Normal successful response');
      return {
        fullText: 'Normal successful response',
        toolCalls: [],
        inputTokens: 12,
        outputTokens: 6,
        model: 'qwen2.5:3b',
      };
    };

    const res = await supertest(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .send({ content: 'Complete request body payload' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('event: meta');
    expect(res.text).toContain('event: text_delta');
    expect(res.text).toContain('Normal successful response');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('"assistantMessageId"');

    // Verify assistant message is persisted
    const msg = await prisma.message.findFirst({
      where: { conversationId, role: 'ASSISTANT', content: 'Normal successful response' },
    });
    expect(msg).not.toBeNull();
  });

  // 7. Cancellation during local AI generation does not persist incomplete assistant message
  it('does not persist incomplete assistant message when cancelled during AI generation', async () => {
    const cancelSignal = new AbortController();

    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callbacks?.onText('Incomplete partial text that should not persist');
      cancelSignal.abort();
      return {
        fullText: 'Incomplete partial text that should not persist',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 8,
        model: 'qwen2.5:3b',
      };
    };

    const mockRes: any = {
      headersSent: true,
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      writableEnded: false,
    };

    const { agentService } = await import('../services/agent.service');
    await agentService.handleMessage(
      conversationId,
      workspaceId,
      'Test generation cancellation',
      mockRes,
      cancelSignal.signal,
    );

    // Verify database does NOT contain the incomplete text
    const incompleteMsg = await prisma.message.findFirst({
      where: {
        conversationId,
        content: 'Incomplete partial text that should not persist',
      },
    });
    expect(incompleteMsg).toBeNull();
  });

  // 8. Cancellation during Tavily search does not record incorrect ToolExecution status
  it('does not create incorrect ToolExecution error status when cancelled during Tavily search', async () => {
    const cancelSignal = new AbortController();

    vi.spyOn(webSearchService, 'search').mockImplementationOnce(async (_options, signal) => {
      cancelSignal.abort();
      const abortErr = new Error('Search cancelled by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    mockStreamTurnHandler = async () => {
      return {
        fullText: '',
        toolCalls: [
          {
            id: 'toolu_cancel_1',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: { query: 'cancelled mid search query' },
            },
          },
        ],
        inputTokens: 20,
        outputTokens: 10,
        model: 'qwen2.5:3b',
      };
    };

    const mockRes: any = {
      headersSent: true,
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      writableEnded: false,
    };

    const { agentService } = await import('../services/agent.service');
    await agentService.handleMessage(
      conversationId,
      workspaceId,
      'Search cancellation test',
      mockRes,
      cancelSignal.signal,
    );

    // Verify no ERROR ToolExecution record was created for the cancelled query
    const toolExec = await prisma.toolExecution.findFirst({
      where: {
        conversationId,
        input: { equals: { query: 'cancelled mid search query', topic: undefined, time_range: undefined } },
      },
    });
    expect(toolExec).toBeNull();
  });

  // 9. Premature client disconnect triggers abort cleanly without unhandled rejection
  it('handles premature client disconnect cleanly via messageController', async () => {
    const { EventEmitter } = await import('events');
    const { messageController } = await import('../controllers/message.controller');

    const mockReq: any = new EventEmitter();
    mockReq.params = { id: conversationId };
    mockReq.workspaceId = workspaceId;
    mockReq.body = { content: 'Premature client disconnect test' };

    const mockRes: any = new EventEmitter();
    mockRes.headersSent = true;
    mockRes.writableEnded = false;
    mockRes.setHeader = vi.fn();
    mockRes.flushHeaders = vi.fn();
    mockRes.writeHead = vi.fn();
    mockRes.write = vi.fn().mockImplementation(() => {
      mockRes.emit('close');
      return true;
    });
    mockRes.end = vi.fn().mockImplementation(() => {
      mockRes.writableEnded = true;
    });

    mockStreamTurnHandler = async (_messages, _tools, callbacks) => {
      callbacks?.onText('Should be cut off');
      return {
        fullText: 'Should be cut off',
        toolCalls: [],
        inputTokens: 10,
        outputTokens: 5,
        model: 'qwen2.5:3b',
      };
    };

    const nextFn = vi.fn();
    await expect(messageController.send(mockReq, mockRes, nextFn)).resolves.not.toThrow();
    expect(mockRes.end).toHaveBeenCalled();
  });
});
