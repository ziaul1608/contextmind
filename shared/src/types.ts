// ============================================================
// Domain Enums
// ============================================================

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export enum ToolStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT',
}

// ============================================================
// Domain Types
// ============================================================

export interface Workspace {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  sources?: MessageSource[];
}

export interface MessageSource {
  id: string;
  messageId: string;
  citationIndex: number;
  title: string;
  url: string;
  snippet: string;
  score: number;
  retrievedAt: string;
}

export interface ToolExecution {
  id: string;
  conversationId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: ToolStatus;
  errorMessage: string | null;
  createdAt: string;
}

// ============================================================
// API Response Wrappers
// ============================================================

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ============================================================
// Pagination
// ============================================================

export interface PaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ============================================================
// Conversation API DTOs
// ============================================================

export interface CreateConversationRequest {
  title?: string;
}

export interface UpdateConversationRequest {
  title: string;
}

export interface ListConversationsQuery {
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// ============================================================
// Health Check
// ============================================================

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  providers?: {
    aiProvider?: 'ollama' | 'groq';
    ollama: boolean;
    ollamaModel?: string;
    modelInstalled?: boolean;
    groq?: boolean;
    groqModel?: string;
    tavily: boolean;
  };
  timestamp: string;
}

// ============================================================
// Message & SSE Stream Types
// ============================================================

export interface SendMessageRequest {
  content: string;
}

export interface SseMetaEvent {
  userMessageId: string;
  createdAt: string;
}

export interface SseStatusEvent {
  phase: 'thinking' | 'searching' | 'synthesizing';
  query?: string;
}

export interface SseTextDeltaEvent {
  delta: string;
}

export interface SseSourcesEvent {
  sources: MessageSource[];
}

export interface SseDoneEvent {
  assistantMessageId: string | null;
  createdAt: string;
  model: string;
  latencyMs: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface SseErrorEvent {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface SseMemoryRetrievedEvent {
  count: number;
  memories: Array<{
    id: string;
    content: string;
    category: string;
    originalTimestamp: string;
    conversationTitle?: string | null;
  }>;
}

// ============================================================
// Memory & Historical Retrieval Types (Phase 4)
// ============================================================

export type MemorySourceType = 'user_provided' | 'assistant_inferred';
export type MemoryStatus = 'active' | 'superseded' | 'archived';

export interface Memory {
  id: string;
  workspaceId: string;
  content: string;
  category: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  originalTimestamp: string; // ISO 8601
  importance: number; // 0.0 to 1.0
  sourceType: MemorySourceType;
  status: MemoryStatus;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  sourceConversationTitle?: string | null;
}

export interface MemoryProvenance {
  memoryId: string;
  conversationId: string | null;
  conversationTitle: string | null;
  messageId: string | null;
  originalTimestamp: string;
  sourceType: MemorySourceType;
  importance: number;
}

export interface HistoricalSearchResult {
  id: string;
  type: 'memory' | 'summary' | 'message';
  content: string;
  category?: string;
  conversationId: string | null;
  conversationTitle: string | null;
  messageId: string | null;
  timestamp: string;
  score: number;
  sourceType?: MemorySourceType;
}

export interface ListMemoriesQuery {
  q?: string;
  category?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface SearchMemoriesQuery {
  q: string;
  limit?: number;
}

export interface CreateMemoryRequest {
  content: string;
  category?: string;
  importance?: number;
  sourceConversationId?: string;
  sourceMessageId?: string;
  originalTimestamp?: string;
  sourceType?: MemorySourceType;
}

export interface UpdateMemoryRequest {
  content?: string;
  category?: string;
  importance?: number;
  status?: MemoryStatus;
}

