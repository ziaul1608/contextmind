import { Prisma, Conversation, Message, MessageSource } from '@prisma/client';
import { prisma } from '../config/prisma';

export type MessageWithSources = Message & { sources: MessageSource[] };
export type ConversationWithMessages = Conversation & { messages: MessageWithSources[] };

export interface FindManyOptions {
  workspaceId: string;
  q?: string;
  limit: number;
  cursor?: string;
}

export const conversationRepository = {
  async create(workspaceId: string, title: string): Promise<Conversation> {
    return prisma.conversation.create({
      data: { workspaceId, title },
    });
  },

  async findMany(options: FindManyOptions): Promise<{ items: Conversation[]; nextCursor: string | null }> {
    const { workspaceId, q, limit, cursor } = options;

    const where: Prisma.ConversationWhereInput = {
      workspaceId,
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };

    // Fetch one extra to determine if there's a next page
    const items = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const lastItem = items.pop();
      if (lastItem) nextCursor = lastItem.id;
    }

    return { items, nextCursor };
  },

  async findById(id: string, workspaceId: string): Promise<ConversationWithMessages | null> {
    return prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sources: {
              orderBy: { citationIndex: 'asc' },
            },
          },
        },
      },
    });
  },

  async update(id: string, workspaceId: string, title: string): Promise<Conversation | null> {
    try {
      return await prisma.conversation.update({
        where: { id, workspaceId },
        data: { title },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return null;
      }
      throw err;
    }
  },

  async delete(id: string, workspaceId: string): Promise<boolean> {
    try {
      await prisma.conversation.delete({
        where: { id, workspaceId },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return false;
      }
      throw err;
    }
  },

  async existsInWorkspace(id: string, workspaceId: string): Promise<boolean> {
    const count = await prisma.conversation.count({
      where: { id, workspaceId },
    });
    return count > 0;
  },
};
