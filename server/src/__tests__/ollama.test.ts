import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ollamaService,
  WEB_SEARCH_TOOL,
  buildSystemPromptWithMemory,
  OllamaChatMessage,
} from '../services/ollama.service';

describe('Local Ollama AI Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Connectivity & Health Check', () => {
    it('returns reachable=true and modelInstalled=true when Ollama and qwen2.5:3b are available', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'qwen2.5:3b', model: 'qwen2.5:3b' },
            { name: 'llama3:latest', model: 'llama3:latest' },
          ],
        }),
      } as any);

      const health = await ollamaService.checkHealth();
      expect(health.reachable).toBe(true);
      expect(health.modelInstalled).toBe(true);
      expect(health.installedModels).toContain('qwen2.5:3b');
      expect(health.currentModel).toBe('qwen2.5:3b');
    });

    it('returns modelInstalled=false when Ollama is running but configured model is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'mistral:7b', model: 'mistral:7b' }],
        }),
      } as any);

      const health = await ollamaService.checkHealth();
      expect(health.reachable).toBe(true);
      expect(health.modelInstalled).toBe(false);
      expect(health.installedModels).toEqual(['mistral:7b']);
    });

    it('returns reachable=false when Ollama daemon is stopped or unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:11434'),
      );

      const health = await ollamaService.checkHealth();
      expect(health.reachable).toBe(false);
      expect(health.modelInstalled).toBe(false);
      expect(health.error).toContain('ECONNREFUSED');
    });
  });

  describe('2. Streaming Generation & Tool Calling', () => {
    it('streams text deltas and calculates token metrics', async () => {
      const mockChunks = [
        JSON.stringify({
          message: { role: 'assistant', content: 'Local ' },
          done: false,
        }) + '\n',
        JSON.stringify({
          message: { role: 'assistant', content: 'AI streaming!' },
          done: true,
          prompt_eval_count: 12,
          eval_count: 5,
        }) + '\n',
      ];

      const encoder = new TextEncoder();
      let chunkIdx = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (chunkIdx < mockChunks.length) {
            controller.enqueue(encoder.encode(mockChunks[chunkIdx++]));
          } else {
            controller.close();
          }
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as any);

      const deltas: string[] = [];
      const messages: OllamaChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await ollamaService.streamTurn(
        messages,
        undefined,
        {
          onText: (d) => deltas.push(d),
        },
      );

      expect(deltas).toEqual(['Local ', 'AI streaming!']);
      expect(result.fullText).toBe('Local AI streaming!');
      expect(result.inputTokens).toBe(12);
      expect(result.outputTokens).toBe(5);
      expect(result.toolCalls).toHaveLength(0);
    });

    it('parses native Ollama function tool_calls for web_search', async () => {
      const toolChunk =
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'web_search',
                  arguments: { query: 'latest open source models 2026' },
                },
              },
            ],
          },
          done: true,
          prompt_eval_count: 25,
          eval_count: 14,
        }) + '\n';

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(toolChunk));
          controller.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as any);

      const deltas: string[] = [];
      const messages: OllamaChatMessage[] = [
        { role: 'user', content: 'Search the web' },
      ];

      const result = await ollamaService.streamTurn(
        messages,
        [WEB_SEARCH_TOOL],
        {
          onText: (d) => deltas.push(d),
        },
      );

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('web_search');
      expect((result.toolCalls[0].function.arguments as any).query).toBe(
        'latest open source models 2026',
      );
    });

    it('injects system prompt with historical context correctly', async () => {
      let sentPayload: any = null;
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        sentPayload = JSON.parse(init?.body as string);
        const encoder = new TextEncoder();
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    message: { role: 'assistant', content: 'Understood.' },
                    done: true,
                  }) + '\n',
                ),
              );
              controller.close();
            },
          }),
        } as any;
      });

      const memories = [
        {
          id: 'mem-1',
          content: 'User prefers dark mode and vim keybindings.',
          type: 'memory' as const,
          sourceType: 'user_provided' as const,
          category: 'preferences',
          conversationId: 'conv-1',
          conversationTitle: 'Preferences Chat',
          messageId: 'msg-1',
          timestamp: '2026-11-15T10:00:00.000Z',
          score: 0.95,
        },
      ];

      const systemPrompt = buildSystemPromptWithMemory(memories);
      await ollamaService.streamTurn(
        [{ role: 'user', content: 'What are my preferences?' }],
        undefined,
        { onText: () => {} },
        undefined,
        systemPrompt,
      );

      expect(sentPayload).not.toBeNull();
      expect(sentPayload.messages[0].role).toBe('system');
      expect(sentPayload.messages[0].content).toContain('<historical_memory_context>');
      expect(sentPayload.messages[0].content).toContain('User prefers dark mode and vim keybindings.');
      expect(sentPayload.messages[0].content).toContain('USER-STATED EVIDENCE');
    });
  });

  describe('3. Non-streaming Completion', () => {
    it('generates a non-streaming completion for conversation summary', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: 'Summary: Discussed migrating ContextMind from Claude to local Ollama.',
          },
        }),
      } as any);

      const summary = await ollamaService.generateCompletion([
        { role: 'user', content: 'Summarize our discussion' },
      ]);

      expect(summary).toContain('Summary: Discussed migrating ContextMind from Claude to local Ollama.');
    });
  });
});
