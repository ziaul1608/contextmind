import { z } from 'zod';

export const createMemorySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Memory content cannot be empty.')
    .max(4000, 'Memory content must not exceed 4000 characters.'),
  category: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .default('general'),
  importance: z
    .coerce
    .number()
    .min(0.0)
    .max(1.0)
    .default(0.5),
  sourceConversationId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  originalTimestamp: z.string().datetime().optional(),
  sourceType: z.enum(['user_provided', 'assistant_inferred']).default('user_provided'),
});

export const updateMemorySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Memory content cannot be empty.')
    .max(4000, 'Memory content must not exceed 4000 characters.')
    .optional(),
  category: z.string().trim().min(1).max(50).optional(),
  importance: z.coerce.number().min(0.0).max(1.0).optional(),
  status: z.enum(['active', 'superseded', 'archived']).optional(),
});

export const listMemoriesQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: z.enum(['active', 'superseded', 'archived']).optional().default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const searchMemoriesQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required.'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
export type ListMemoriesQuery = z.infer<typeof listMemoriesQuerySchema>;
export type SearchMemoriesQuery = z.infer<typeof searchMemoriesQuerySchema>;
