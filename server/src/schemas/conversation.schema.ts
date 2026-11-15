import { z } from 'zod';

export const createConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty.')
    .max(200, 'Title must not exceed 200 characters.')
    .optional(),
});

export const updateConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty.')
    .max(200, 'Title must not exceed 200 characters.'),
});

export const listConversationsQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
