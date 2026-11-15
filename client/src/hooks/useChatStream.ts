import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Message,
  MessageRole,
  MessageSource,
  SseMetaEvent,
  SseStatusEvent,
  SseTextDeltaEvent,
  SseDoneEvent,
  SseErrorEvent,
  SseSourcesEvent,
  SseMemoryRetrievedEvent,
} from '@contextmind/shared';

export interface StreamingMessageState {
  isStreaming: boolean;
  currentAssistantText: string;
  statusPhase: 'thinking' | 'searching' | 'synthesizing' | null;
  statusQuery: string | null;
  currentSources: MessageSource[];
  retrievedMemories: SseMemoryRetrievedEvent['memories'];
  error: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export function useChatStream(
  conversationId: string | null,
  onMessageDone?: (persistedMessage: Message) => void,
) {
  const [streamState, setStreamState] = useState<StreamingMessageState>({
    isStreaming: false,
    currentAssistantText: '',
    statusPhase: null,
    statusQuery: null,
    currentSources: [],
    retrievedMemories: [],
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeStreamingIdRef = useRef<string | null>(null);

  // Cleanup active stream on unmount or when switching to a DIFFERENT conversation
  useEffect(() => {
    return () => {
      if (
        abortControllerRef.current &&
        activeStreamingIdRef.current &&
        conversationId &&
        activeStreamingIdRef.current !== conversationId
      ) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        activeStreamingIdRef.current = null;
      }
    };
  }, [conversationId]);

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamState((prev) => ({
      ...prev,
      isStreaming: false,
      statusPhase: null,
      statusQuery: null,
    }));
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      targetConversationId?: string | null,
      onUserMessageCreated?: (userMsg: Message) => void,
      onError?: (errorMsg: string) => void,
    ): Promise<boolean> => {
      const activeId = targetConversationId || conversationId;
      if (!activeId) {
        const errMsg = 'No conversation selected.';
        setStreamState((prev) => ({ ...prev, error: errMsg }));
        onError?.(errMsg);
        return false;
      }
      if (streamState.isStreaming) return false;

      const trimmed = content.trim();
      if (!trimmed) return false;

      // Reset stream state
      setStreamState({
        isStreaming: true,
        currentAssistantText: '',
        statusPhase: 'thinking',
        statusQuery: null,
        currentSources: [],
        retrievedMemories: [],
        error: null,
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      activeStreamingIdRef.current = activeId;

      let accumulatedText = '';
      let accumulatedSources: MessageSource[] = [];
      let assistantMsgId: string | null = null;
      let assistantCreatedAt: string = new Date().toISOString();
      let hasReceivedMeta = false;

      try {
        const response = await fetch(
          `${API_BASE_URL}/conversations/${activeId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: trimmed }),
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg =
            errData?.error?.message || `HTTP error ${response.status}`;
          throw new Error(errMsg);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream available in response.');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          // Keep trailing incomplete block in buffer
          buffer = parts.pop() ?? '';

          for (const block of parts) {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            // Parse event: <name> and data: <json>
            let eventName = 'message';
            let dataStr = '';

            const lines = trimmedBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);

              switch (eventName) {
                case 'meta': {
                  hasReceivedMeta = true;
                  const meta = parsed as SseMetaEvent;
                  if (onUserMessageCreated) {
                    onUserMessageCreated({
                      id: meta.userMessageId,
                      conversationId: activeId,
                      role: 'USER' as MessageRole,
                      content: trimmed,
                      createdAt: meta.createdAt,
                    });
                  }
                  break;
                }

                case 'status': {
                  const status = parsed as SseStatusEvent;
                  setStreamState((prev) => ({
                    ...prev,
                    statusPhase: status.phase,
                    statusQuery: status.query ?? null,
                  }));
                  break;
                }

                case 'memory_retrieved': {
                  const memEvent = parsed as SseMemoryRetrievedEvent;
                  setStreamState((prev) => ({
                    ...prev,
                    retrievedMemories: memEvent.memories || [],
                  }));
                  break;
                }

                case 'sources': {
                  const sourcesEvent = parsed as SseSourcesEvent;
                  accumulatedSources = sourcesEvent.sources;
                  setStreamState((prev) => ({
                    ...prev,
                    currentSources: sourcesEvent.sources,
                  }));
                  break;
                }

                case 'text_delta': {
                  const delta = (parsed as SseTextDeltaEvent).delta;
                  accumulatedText += delta;
                  setStreamState((prev) => ({
                    ...prev,
                    currentAssistantText: accumulatedText,
                    statusPhase: null, // text is flowing, done thinking/searching
                    statusQuery: null,
                  }));
                  break;
                }

                case 'done': {
                  const doneEvent = parsed as SseDoneEvent;
                  assistantMsgId = doneEvent.assistantMessageId;
                  assistantCreatedAt = doneEvent.createdAt;
                  break;
                }

                case 'error': {
                  const errEvent = parsed as SseErrorEvent;
                  setStreamState((prev) => ({
                    ...prev,
                    error: errEvent.message,
                  }));
                  break;
                }
              }
            } catch (jsonErr) {
              console.warn('[ContextMind SSE Parse Error]', jsonErr, dataStr);
            }
          }
        }

        // Finalize completed assistant message
        if (accumulatedText.trim().length > 0 && onMessageDone) {
          onMessageDone({
            id: assistantMsgId || `temp-${Date.now()}`,
            conversationId: activeId,
            role: 'ASSISTANT' as MessageRole,
            content: accumulatedText,
            createdAt: assistantCreatedAt,
            sources: accumulatedSources,
          });
        }
        return true;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User aborted generation — append whatever text was accumulated so far
          if (accumulatedText.trim().length > 0 && onMessageDone) {
            onMessageDone({
              id: assistantMsgId || `aborted-${Date.now()}`,
              conversationId: activeId,
              role: 'ASSISTANT' as MessageRole,
              content: accumulatedText,
              createdAt: assistantCreatedAt,
              sources: accumulatedSources,
            });
          }
          return false;
        } else {
          console.error('[ContextMind Streaming Error]', err);
          const errorMsg =
            err instanceof Error ? err.message : 'Streaming error occurred.';
          setStreamState((prev) => ({
            ...prev,
            error: errorMsg,
          }));
          if (!hasReceivedMeta) {
            onError?.(errorMsg);
          }
          return false;
        }
      } finally {
        abortControllerRef.current = null;
        activeStreamingIdRef.current = null;
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          currentAssistantText: '',
          statusPhase: null,
          statusQuery: null,
          currentSources: [],
        }));
      }
    },
    [conversationId, streamState.isStreaming, onMessageDone],
  );

  return {
    streamState,
    sendMessage,
    stopGenerating,
  };
}
