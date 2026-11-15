import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content cannot be empty.')
    .max(8000, 'Message must not exceed 8000 characters.'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
