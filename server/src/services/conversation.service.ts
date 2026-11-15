import { conversationRepository, ConversationWithMessages } from '../repositories/conversation.repository';
import { NotFoundError } from '../middleware/errorHandler';
import { Conversation } from '@prisma/client';
import { PaginatedResponse } from '@contextmind/shared';

const DEFAULT_TITLE = 'New Conversation';
const MAX_LIST_LIMIT = 100;

export const conversationService = {
  async create(workspaceId: string, title?: string): Promise<Conversation> {
    const resolvedTitle = title?.trim() || DEFAULT_TITLE;
    return conversationRepository.create(workspaceId, resolvedTitle);
  },

  async list(
    workspaceId: string,
    options: { q?: string; limit: number; cursor?: string },
  ): Promise<PaginatedResponse<Conversation>> {
    const limit = Math.min(options.limit, MAX_LIST_LIMIT);
    const { items, nextCursor } = await conversationRepository.findMany({
      workspaceId,
      q: options.q,
      limit,
      cursor: options.cursor,
    });
    return {
      items,
      pagination: {
        limit,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    };
  },

  async getById(id: string, workspaceId: string): Promise<ConversationWithMessages> {
    const conversation = await conversationRepository.findById(id, workspaceId);
    if (!conversation) {
      throw new NotFoundError('Conversation', id);
    }
    return conversation;
  },

  async rename(id: string, workspaceId: string, title: string): Promise<Conversation> {
    const updated = await conversationRepository.update(id, workspaceId, title.trim());
    if (!updated) {
      throw new NotFoundError('Conversation', id);
    }
    return updated;
  },

  async delete(id: string, workspaceId: string): Promise<void> {
    const deleted = await conversationRepository.delete(id, workspaceId);
    if (!deleted) {
      throw new NotFoundError('Conversation', id);
    }
  },
};
