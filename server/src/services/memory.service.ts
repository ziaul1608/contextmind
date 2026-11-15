import { memoryRepository, MemoryWithProvenance } from '../repositories/memory.repository';
import { prisma } from '../config/prisma';
import { ollamaService } from './ollama.service';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import {
  HistoricalSearchResult,
  Memory,
  MemoryProvenance,
  PaginatedResponse,
  ListMemoriesQuery,
  CreateMemoryRequest,
  UpdateMemoryRequest,
} from '@contextmind/shared';

const SENSITIVE_SECRET_PATTERNS = [
  /api[_-]?key\s*(?::=|:|=>|=)\s*['"]?[a-zA-Z0-9_\-]{8,}['"]?/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/i,
  /(?:password|passwd|pwd)\s*(?::=|:|=>|=)\s*['"]?[^\s]{4,}['"]?/i,
  /secret\s*(?::=|:|=>|=)\s*['"]?[a-zA-Z0-9_\-]{8,}['"]?/i,
  /ghp_[a-zA-Z0-9]{20,}/i,
  /sk-ant-[a-zA-Z0-9_\-]{20,}/i,
  /tvly-[a-zA-Z0-9_\-]{15,}/i,
];

/**
 * Checks whether content contains sensitive authentication secrets or API keys.
 */
export function containsSensitiveSecrets(content: string): boolean {
  return SENSITIVE_SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Sanitizes text by masking any detected secret patterns.
 */
export function sanitizeSecrets(content: string): string {
  let sanitized = content;
  for (const pattern of SENSITIVE_SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}

export const memoryService = {
  /**
   * Multi-layer historical context retrieval across:
   * 1. Active long-term memories
   * 2. Conversation summaries
   * 3. Historical cross-conversation messages
   */
  async searchHistoricalContext(
    workspaceId: string,
    query: string,
    activeConversationId?: string,
    maxItems: number = 6,
  ): Promise<HistoricalSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    try {
      const [memories, summaries, messages] = await Promise.all([
        memoryRepository.searchMemories(workspaceId, trimmed, 6),
        memoryRepository.searchConversationSummaries(workspaceId, trimmed, activeConversationId, 3),
        memoryRepository.searchHistoricalMessages(workspaceId, trimmed, activeConversationId, 5),
      ]);

      const allResults: HistoricalSearchResult[] = [...memories, ...summaries, ...messages];

      // Deduplicate by normalized content snippet
      const seenSnippets = new Set<string>();
      const deduplicated: HistoricalSearchResult[] = [];

      for (const item of allResults) {
        const normalized = item.content.trim().toLowerCase().slice(0, 120);
        if (!seenSnippets.has(normalized)) {
          seenSnippets.add(normalized);
          deduplicated.push(item);
        }
      }

      // Rank by composite score (relevance score + recency boost)
      deduplicated.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        const recencyScoreA = Math.min((Date.now() - timeA) / (1000 * 60 * 60 * 24 * 30), 1); // 0 (new) to 1 (30+ days old)
        const recencyScoreB = Math.min((Date.now() - timeB) / (1000 * 60 * 60 * 24 * 30), 1);

        // Preference to higher score and slightly to recent
        const finalScoreA = a.score - 0.1 * recencyScoreA;
        const finalScoreB = b.score - 0.1 * recencyScoreB;

        return finalScoreB - finalScoreA;
      });

      return deduplicated.slice(0, maxItems);
    } catch (err) {
      console.error('[ContextMind] Error during historical search:', err);
      return [];
    }
  },

  /**
   * Extracts durable facts, decisions, preferences, and project details from a conversation turn
   * and saves or supersedes existing memories.
   */
  async extractAndSaveMemories(params: {
    workspaceId: string;
    conversationId: string;
    userMessageId?: string;
    userContent: string;
    assistantContent?: string;
  }): Promise<Memory[]> {
    const { workspaceId, conversationId, userMessageId, userContent, assistantContent } = params;

    // Do not extract memories from trivial greetings or short inputs
    if (userContent.trim().length < 15) {
      return [];
    }

    // Do NOT store secrets, API keys, or passwords
    if (containsSensitiveSecrets(userContent)) {
      return [];
    }

    const createdMemories: Memory[] = [];

    // Guard against exploratory questions (e.g. "Should I use PostgreSQL?")
    const isQuestion = /(?:\?|^(?:should|can|could|would|shall|is it|are we|do we|why not|how should|what if|how do|what do)\b)/i.test(
      userContent.trim(),
    );

    // Check if the statement contains an explicit confirmed decision
    const hasConfirmedDecision = /(?:we\s+decided\s+to|i\s+have\s+decided\s+to|i\s+decided\s+to|the\s+decision\s+is\s+to|we\s+will\s+use|agreed\s+to)\b/i.test(
      userContent,
    );

    // Guard against hypothetical, conditional, or exploratory musings (e.g. "If I use PostgreSQL, I might migrate later" or "I am considering switching to MongoDB")
    const isHypotheticalOrConditional =
      !hasConfirmedDecision &&
      /\b(?:if\s+i|if\s+we|might\s+|maybe\s+|hypothetically|suppose\s+|could\s+potentially|considering\s+|evaluating\s+|thinking\s+of\s+|thinking\s+about\s+)\b/i.test(
        userContent,
      );

    // Guard against past one-off experiences (e.g. "I used PostgreSQL once")
    const isPastOneOff = /\b(?:used\b.*\bonce\b|tried\b.*\bonce\b|used\b.*\bbefore\b|tried\b.*\bbefore\b|in\s+the\s+past\b|years\s+ago\b)/i.test(
      userContent,
    );

    // Handle explicit migrations: "I switched from PostgreSQL to SQLite"
    const switchedMatch = userContent.match(
      /(?:switched\s+from|migrated\s+from)\s+([a-zA-Z0-9_\-\.]+)\s+to\s+([a-zA-Z0-9_\-\.]+)/i,
    );
    if (switchedMatch && !isQuestion && !isHypotheticalOrConditional) {
      const fromTech = switchedMatch[1].trim();
      const toTech = switchedMatch[2].trim();
      try {
        // Atomically supersede ONLY tech_stack / current usage memories matching fromTech (never personal preferences)
        await prisma.memory.updateMany({
          where: {
            workspaceId,
            category: 'tech_stack',
            status: 'active',
            content: { contains: fromTech, mode: 'insensitive' },
          },
          data: { status: 'superseded' },
        });

        // Create new tech_stack memory for the new technology
        const newRecord = await memoryRepository.create(workspaceId, {
          content: `using ${toTech}`,
          category: 'tech_stack',
          importance: 0.85,
          sourceConversationId: conversationId,
          sourceMessageId: userMessageId,
          originalTimestamp: new Date(),
          sourceType: 'user_provided',
        });

        createdMemories.push({
          id: newRecord.id,
          workspaceId: newRecord.workspaceId,
          content: newRecord.content,
          category: newRecord.category,
          sourceConversationId: newRecord.sourceConversationId,
          sourceMessageId: newRecord.sourceMessageId,
          originalTimestamp: newRecord.originalTimestamp.toISOString(),
          importance: newRecord.importance,
          sourceType: newRecord.sourceType as any,
          status: newRecord.status as any,
          supersededById: newRecord.supersededById,
          createdAt: newRecord.createdAt.toISOString(),
          updatedAt: newRecord.updatedAt.toISOString(),
        });
      } catch (err) {
        console.error('[ContextMind] Error handling switch migration:', err);
      }
    }

    // Handle discontinuation / no longer using statements (e.g. "I no longer use PostgreSQL")
    const noLongerUsingMatch = userContent.match(
      /(?:no\s+longer\s+use|stopped\s+using|migrated\s+away\s+from|abandoned|dropped)\s+([a-zA-Z0-9_\-\.]+)/i,
    );
    if (noLongerUsingMatch && !isQuestion && !isHypotheticalOrConditional && !switchedMatch) {
      const discontinuedTarget = noLongerUsingMatch[1].trim();
      try {
        // Discontinuation only supersedes current usage (tech_stack), NOT personal preferences
        await prisma.memory.updateMany({
          where: {
            workspaceId,
            category: 'tech_stack',
            status: 'active',
            content: { contains: discontinuedTarget, mode: 'insensitive' },
          },
          data: { status: 'superseded' },
        });
      } catch (err) {
        console.error('[ContextMind] Error updating discontinued memory:', err);
      }
    }

    // If the input is a question, hypothetical/considering, or past one-off, do not extract preferences or decisions
    if (isQuestion || isHypotheticalOrConditional || isPastOneOff) {
      return createdMemories;
    }

    // Deterministic rule-based extraction patterns for common facts, tech stacks, preferences, and decisions
    const extractionPatterns: Array<{
      category: string;
      regex: RegExp;
      importance: number;
    }> = [
      {
        category: 'project',
        regex: /(?:my project is|we are building|building a|the project is called|contextmind is|the app is|the application is|project code is|our project code is)\s+([^.?!]+)/i,
        importance: 0.8,
      },
      {
        category: 'tech_stack',
        regex: /(?:i currently use|currently using|using|stack is|database is|frontend is|backend is|framework is|written in)\s+([^.?!]+)/i,
        importance: 0.85,
      },
      {
        category: 'preference',
        regex: /(?:my preferred\s+[^.?!]+?\s+is|my favorite (?:database|framework|language|tool|stack)\s+is|i prefer|always use|never use|my preference is|please ensure that we|i like to)\s+([^.?!]+)/i,
        importance: 0.75,
      },
      {
        category: 'decision',
        regex: /(?:we decided to|i have decided to|i decided to|the decision is to|we will use|agreed to)\s+([^.?!]+)/i,
        importance: 0.8,
      },
      {
        category: 'fact',
        regex: /(?:my name is|i am a|i work on|i live in|the deadline is)\s+([^.?!]+)/i,
        importance: 0.7,
      },
    ];

    for (const pattern of extractionPatterns) {
      const match = userContent.match(pattern.regex);
      if (match) {
        const rawFact = match[0].trim();
        const sanitized = sanitizeSecrets(rawFact);

        // Check if a similar memory exists in this category
        const existingMemories = await memoryRepository.findMany({
          workspaceId,
          category: pattern.category,
          status: 'active',
          limit: 10,
        });

        const duplicate = existingMemories.items.find(
          (m) => m.content.toLowerCase() === sanitized.toLowerCase(),
        );

        if (!duplicate) {
          // Check if this fact supersedes an existing one (e.g., changing database or framework)
          const supersedeCandidate = existingMemories.items.find((m) => {
            const hasTechConflict =
              pattern.category === 'tech_stack' &&
              ((sanitized.includes('database') && m.content.includes('database')) ||
                (sanitized.includes('frontend') && m.content.includes('frontend')) ||
                (sanitized.includes('backend') && m.content.includes('backend')));
            return hasTechConflict;
          });

          const newMem = await memoryRepository.create(workspaceId, {
            content: sanitized,
            category: pattern.category,
            importance: pattern.importance,
            sourceConversationId: conversationId,
            sourceMessageId: userMessageId,
            originalTimestamp: new Date(),
            sourceType: 'user_provided',
          });

          if (supersedeCandidate) {
            await memoryRepository.supersede(supersedeCandidate.id, newMem.id, workspaceId);
          }

          createdMemories.push({
            id: newMem.id,
            workspaceId: newMem.workspaceId,
            content: newMem.content,
            category: newMem.category,
            sourceConversationId: newMem.sourceConversationId,
            sourceMessageId: newMem.sourceMessageId,
            originalTimestamp: newMem.originalTimestamp.toISOString(),
            importance: newMem.importance,
            sourceType: newMem.sourceType as any,
            status: newMem.status as any,
            supersededById: newMem.supersededById,
            createdAt: newMem.createdAt.toISOString(),
            updatedAt: newMem.updatedAt.toISOString(),
          });
        }
      }
    }

    return createdMemories;
  },

  /**
   * Generates or updates a rolling summary of the conversation using Claude.
   * Runs non-blockingly to preserve response latency.
   */
  async updateRollingSummary(conversationId: string, workspaceId: string): Promise<string | null> {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation || conversation.messages.length < 3) {
        return null;
      }

      const existingSummary = conversation.summary || 'None';
      const recentMessagesText = conversation.messages
        .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'} [${m.createdAt.toISOString()}]: ${m.content}`)
        .join('\n');

      const summaryPrompt = [
        {
          role: 'user' as const,
          content: `You are the conversation summarizer for ContextMind.
Update the persistent conversation summary concisely.

CURRENT SUMMARY:
${existingSummary}

ALL MESSAGES:
${recentMessagesText}

INSTRUCTIONS:
1. Preserve key decisions, project requirements, architectural facts, user preferences, and unresolved tasks.
2. Maintain timestamps or chronological provenance for important milestones where available.
3. Keep the summary concise (150-300 words), well-structured, and factual.
4. Do NOT include greetings, small talk, or speculative remarks.
5. Do NOT include passwords, API keys, or sensitive secrets.

OUTPUT ONLY THE UPDATED SUMMARY TEXT:`,
        },
      ];

      const rawSummary = await ollamaService.generateCompletion(
        summaryPrompt,
        'You are the conversation summarizer for ContextMind.',
      );

      const updatedSummary = rawSummary.trim();
      if (updatedSummary.length > 0) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { summary: updatedSummary },
        });
        return updatedSummary;
      }

      return null;
    } catch (err) {
      console.error('[ContextMind] Failed to update rolling conversation summary:', err);
      return null;
    }
  },

  /**
   * List memories with filtering and pagination.
   */
  async list(
    workspaceId: string,
    query: ListMemoriesQuery,
  ): Promise<PaginatedResponse<Memory>> {
    const limit = Math.min(query.limit ?? 30, 100);
    const { items, nextCursor } = await memoryRepository.findMany({
      workspaceId,
      q: query.q,
      category: query.category,
      status: query.status,
      limit,
      cursor: query.cursor,
    });

    const mapped: Memory[] = items.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      content: m.content,
      category: m.category,
      sourceConversationId: m.sourceConversationId,
      sourceMessageId: m.sourceMessageId,
      originalTimestamp: m.originalTimestamp.toISOString(),
      importance: m.importance,
      sourceType: m.sourceType as any,
      status: m.status as any,
      supersededById: m.supersededById,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      sourceConversationTitle: m.sourceConversation?.title ?? null,
    }));

    return {
      items: mapped,
      pagination: {
        limit,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    };
  },

  /**
   * Retrieve a memory record with full provenance details.
   */
  async getById(id: string, workspaceId: string): Promise<MemoryProvenance> {
    const memory = await memoryRepository.findById(id, workspaceId);
    if (!memory) {
      throw new NotFoundError('Memory', id);
    }

    return {
      memoryId: memory.id,
      conversationId: memory.sourceConversationId,
      conversationTitle: memory.sourceConversation?.title ?? null,
      messageId: memory.sourceMessageId,
      originalTimestamp: memory.originalTimestamp.toISOString(),
      sourceType: memory.sourceType as any,
      importance: memory.importance,
    };
  },

  /**
   * Create a memory record manually.
   */
  async create(workspaceId: string, data: CreateMemoryRequest): Promise<Memory> {
    if (containsSensitiveSecrets(data.content)) {
      throw new ValidationError('Memory content cannot contain sensitive credentials or API keys.');
    }

    if (data.sourceConversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: data.sourceConversationId, workspaceId },
      });
      if (!conv) {
        throw new NotFoundError('Conversation', data.sourceConversationId);
      }
    }

    if (data.sourceMessageId) {
      const msg = await prisma.message.findFirst({
        where: {
          id: data.sourceMessageId,
          conversation: { workspaceId },
        },
      });
      if (!msg) {
        throw new NotFoundError('Message', data.sourceMessageId);
      }

      // Prevent forging user_provided provenance on an assistant message
      if (data.sourceType === 'user_provided' && msg.role !== 'USER') {
        throw new ValidationError('Cannot attribute user_provided provenance to an assistant message.');
      }
    }

    const sanitized = sanitizeSecrets(data.content);
    const record = await memoryRepository.create(workspaceId, {
      content: sanitized,
      category: data.category,
      importance: data.importance,
      sourceConversationId: data.sourceConversationId,
      sourceMessageId: data.sourceMessageId,
      originalTimestamp: data.originalTimestamp ? new Date(data.originalTimestamp) : new Date(),
      sourceType: data.sourceType || 'user_provided',
    });

    return {
      id: record.id,
      workspaceId: record.workspaceId,
      content: record.content,
      category: record.category,
      sourceConversationId: record.sourceConversationId,
      sourceMessageId: record.sourceMessageId,
      originalTimestamp: record.originalTimestamp.toISOString(),
      importance: record.importance,
      sourceType: record.sourceType as any,
      status: record.status as any,
      supersededById: record.supersededById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  },

  /**
   * Update an existing memory record.
   */
  async update(id: string, workspaceId: string, data: UpdateMemoryRequest): Promise<Memory> {
    const updated = await memoryRepository.update(id, workspaceId, {
      content: data.content ? sanitizeSecrets(data.content) : undefined,
      category: data.category,
      importance: data.importance,
      status: data.status,
    });

    if (!updated) {
      throw new NotFoundError('Memory', id);
    }

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      content: updated.content,
      category: updated.category,
      sourceConversationId: updated.sourceConversationId,
      sourceMessageId: updated.sourceMessageId,
      originalTimestamp: updated.originalTimestamp.toISOString(),
      importance: updated.importance,
      sourceType: updated.sourceType as any,
      status: updated.status as any,
      supersededById: updated.supersededById,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },

  /**
   * Delete a memory record.
   */
  async delete(id: string, workspaceId: string): Promise<void> {
    const deleted = await memoryRepository.delete(id, workspaceId);
    if (!deleted) {
      throw new NotFoundError('Memory', id);
    }
  },

  /**
   * Get the rolling summary for a conversation.
   */
  async getConversationSummary(
    conversationId: string,
    workspaceId: string,
  ): Promise<{ conversationId: string; summary: string | null }> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true, summary: true },
    });

    if (!conv) {
      throw new NotFoundError('Conversation', conversationId);
    }

    return {
      conversationId: conv.id,
      summary: conv.summary,
    };
  },
};
