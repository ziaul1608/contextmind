import { Prisma, Memory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HistoricalSearchResult, MemorySourceType, MemoryStatus } from '@contextmind/shared';

export type MemoryWithProvenance = Memory & {
  sourceConversation?: { id: string; title: string } | null;
  sourceMessage?: { id: string; content: string; createdAt: Date } | null;
};

export interface ListMemoriesOptions {
  workspaceId: string;
  q?: string;
  category?: string;
  status?: string;
  limit: number;
  cursor?: string;
}

const STOP_WORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
  'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did',
  'doing', 'would', 'should', 'could', 'ought', 'the', 'and', 'but', 'if',
  'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'tell', 'show', 'give', 'know',
  'using', 'use', 'my', 'our', 'your', 'i', 'we', 'you',
]);

function formatSearchTokens(rawQuery: string): { orQuery: string; mainKeyword: string } {
  const cleaned = rawQuery.replace(/[^\w\s]/g, ' ').trim();
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));

  if (words.length === 0) {
    const fallback = cleaned.slice(0, 30) || 'general';
    return { orQuery: fallback, mainKeyword: fallback };
  }

  return {
    orQuery: words.join(' or '),
    mainKeyword: words[0],
  };
}

export const memoryRepository = {
  async create(
    workspaceId: string,
    data: {
      content: string;
      category?: string;
      importance?: number;
      sourceConversationId?: string;
      sourceMessageId?: string;
      originalTimestamp?: Date;
      sourceType?: string;
    },
  ): Promise<Memory> {
    return prisma.memory.create({
      data: {
        workspaceId,
        content: data.content,
        category: data.category?.toLowerCase() || 'general',
        importance: data.importance ?? 0.5,
        sourceConversationId: data.sourceConversationId || null,
        sourceMessageId: data.sourceMessageId || null,
        originalTimestamp: data.originalTimestamp || new Date(),
        sourceType: data.sourceType || 'user_provided',
        status: 'active',
      },
    });
  },

  async findById(id: string, workspaceId: string): Promise<MemoryWithProvenance | null> {
    return prisma.memory.findFirst({
      where: { id, workspaceId },
      include: {
        sourceConversation: {
          select: { id: true, title: true },
        },
        sourceMessage: {
          select: { id: true, content: true, createdAt: true },
        },
      },
    });
  },

  async findMany(
    options: ListMemoriesOptions,
  ): Promise<{ items: MemoryWithProvenance[]; nextCursor: string | null }> {
    const { workspaceId, q, category, status, limit, cursor } = options;

    const where: Prisma.MemoryWhereInput = {
      workspaceId,
      ...(status ? { status } : { status: 'active' }),
      ...(category ? { category: { equals: category.toLowerCase(), mode: 'insensitive' } } : {}),
      ...(q ? { content: { contains: q, mode: 'insensitive' } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const items = await prisma.memory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      include: {
        sourceConversation: {
          select: { id: true, title: true },
        },
        sourceMessage: {
          select: { id: true, content: true, createdAt: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const lastItem = items.pop();
      if (lastItem) nextCursor = lastItem.id;
    }

    return { items, nextCursor };
  },

  async update(
    id: string,
    workspaceId: string,
    data: {
      content?: string;
      category?: string;
      importance?: number;
      status?: string;
      supersededById?: string;
    },
  ): Promise<Memory | null> {
    try {
      return await prisma.memory.update({
        where: { id, workspaceId },
        data: {
          ...(data.content !== undefined ? { content: data.content } : {}),
          ...(data.category !== undefined ? { category: data.category.toLowerCase() } : {}),
          ...(data.importance !== undefined ? { importance: data.importance } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.supersededById !== undefined ? { supersededById: data.supersededById } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  },

  async delete(id: string, workspaceId: string): Promise<boolean> {
    try {
      await prisma.memory.delete({
        where: { id, workspaceId },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return false;
      }
      throw err;
    }
  },

  /**
   * Supersedes an existing memory record by pointing its supersededById to the new memory
   * and changing its status to 'superseded'.
   */
  async supersede(oldId: string, newId: string, workspaceId: string): Promise<void> {
    await prisma.memory.updateMany({
      where: { id: oldId, workspaceId },
      data: {
        status: 'superseded',
        supersededById: newId,
      },
    });
  },

  /**
   * Search active memories using PostgreSQL full-text search with fallback to ILIKE.
   */
  async searchMemories(
    workspaceId: string,
    query: string,
    limit: number = 5,
  ): Promise<HistoricalSearchResult[]> {
    const { orQuery, mainKeyword } = formatSearchTokens(query);

    const rawResults = await prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        category: string;
        conversationId: string | null;
        conversationTitle: string | null;
        messageId: string | null;
        timestamp: Date;
        sourceType: string;
        score: number;
      }>
    >`
      SELECT 
        m.id,
        m.content,
        m.category,
        m.source_conversation_id as "conversationId",
        c.title as "conversationTitle",
        m.source_message_id as "messageId",
        m.original_timestamp as timestamp,
        m.source_type as "sourceType",
        (
          ts_rank_cd(m.search_vector, websearch_to_tsquery('english', ${orQuery})) * (0.8 + 0.4 * m.importance)
          + CASE WHEN m.content ILIKE ('%' || ${mainKeyword} || '%') THEN 0.5 ELSE 0 END
          + CASE WHEN m.category ILIKE ('%' || ${mainKeyword} || '%') THEN 0.3 ELSE 0 END
          + CASE WHEN m.source_type = 'user_provided' THEN 0.2 ELSE 0 END
        )::float as score
      FROM memories m
      LEFT JOIN conversations c ON m.source_conversation_id = c.id
      WHERE m.workspace_id = ${workspaceId}
        AND m.status = 'active'
        AND (
          m.search_vector @@ websearch_to_tsquery('english', ${orQuery})
          OR m.content ILIKE ('%' || ${mainKeyword} || '%')
          OR m.category ILIKE ('%' || ${mainKeyword} || '%')
        )
      ORDER BY score DESC, m.updated_at DESC
      LIMIT ${limit}
    `;

    return rawResults.map((r) => ({
      id: r.id,
      type: 'memory' as const,
      content: r.content,
      category: r.category,
      conversationId: r.conversationId,
      conversationTitle: r.conversationTitle,
      messageId: r.messageId,
      timestamp: r.timestamp.toISOString(),
      sourceType: r.sourceType as any,
      score: Number(r.score) || 0.5,
    }));
  },

  /**
   * Search historical messages across conversations in the workspace using PostgreSQL tsvector GIN index.
   */
  async searchHistoricalMessages(
    workspaceId: string,
    query: string,
    excludeConversationId?: string,
    limit: number = 5,
  ): Promise<HistoricalSearchResult[]> {
    const { orQuery, mainKeyword } = formatSearchTokens(query);

    const rawResults = await prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        conversationId: string;
        conversationTitle: string;
        createdAt: Date;
        score: number;
      }>
    >`
      SELECT 
        msg.id,
        msg.content,
        msg.conversation_id as "conversationId",
        c.title as "conversationTitle",
        msg.created_at as "createdAt",
        (
          ts_rank_cd(msg.search_vector, websearch_to_tsquery('english', ${orQuery}))
          + CASE WHEN msg.content ILIKE ('%' || ${mainKeyword} || '%') THEN 0.4 ELSE 0 END
        )::float as score
      FROM messages msg
      JOIN conversations c ON msg.conversation_id = c.id
      WHERE c.workspace_id = ${workspaceId}
        AND (${excludeConversationId || null}::text IS NULL OR msg.conversation_id != ${excludeConversationId || null})
        AND (
          msg.search_vector @@ websearch_to_tsquery('english', ${orQuery})
          OR msg.content ILIKE ('%' || ${mainKeyword} || '%')
        )
      ORDER BY score DESC, msg.created_at DESC
      LIMIT ${limit}
    `;

    return rawResults.map((r) => ({
      id: r.id,
      type: 'message' as const,
      content: r.content,
      conversationId: r.conversationId,
      conversationTitle: r.conversationTitle,
      messageId: r.id,
      timestamp: r.createdAt.toISOString(),
      score: Number(r.score) || 0.5,
    }));
  },

  /**
   * Search conversation summaries across the workspace.
   */
  async searchConversationSummaries(
    workspaceId: string,
    query: string,
    excludeConversationId?: string,
    limit: number = 3,
  ): Promise<HistoricalSearchResult[]> {
    const { orQuery, mainKeyword } = formatSearchTokens(query);

    const rawResults = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        summary: string;
        updatedAt: Date;
        score: number;
      }>
    >`
      SELECT 
        c.id,
        c.title,
        c.summary,
        c.updated_at as "updatedAt",
        (
          ts_rank_cd(to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')), websearch_to_tsquery('english', ${orQuery}))
          + CASE WHEN c.summary ILIKE ('%' || ${mainKeyword} || '%') THEN 0.5 ELSE 0 END
          + CASE WHEN c.title ILIKE ('%' || ${mainKeyword} || '%') THEN 0.4 ELSE 0 END
        )::float as score
      FROM conversations c
      WHERE c.workspace_id = ${workspaceId}
        AND c.summary IS NOT NULL
        AND (${excludeConversationId || null}::text IS NULL OR c.id != ${excludeConversationId || null})
        AND (
          to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')) @@ websearch_to_tsquery('english', ${orQuery})
          OR c.summary ILIKE ('%' || ${mainKeyword} || '%')
          OR c.title ILIKE ('%' || ${mainKeyword} || '%')
        )
      ORDER BY score DESC, c.updated_at DESC
      LIMIT ${limit}
    `;

    return rawResults.map((r) => ({
      id: r.id,
      type: 'summary' as const,
      content: r.summary,
      category: 'summary',
      conversationId: r.id,
      conversationTitle: r.title,
      messageId: null,
      timestamp: r.updatedAt.toISOString(),
      score: Number(r.score) || 0.5,
    }));
  },

  /**
   * Get all active memories for a workspace (for prompt injection or summary).
   */
  async getAllActiveMemories(workspaceId: string, limit: number = 50): Promise<MemoryWithProvenance[]> {
    return prisma.memory.findMany({
      where: { workspaceId, status: 'active' },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      include: {
        sourceConversation: {
          select: { id: true, title: true },
        },
        sourceMessage: {
          select: { id: true, content: true, createdAt: true },
        },
      },
    });
  },
};
