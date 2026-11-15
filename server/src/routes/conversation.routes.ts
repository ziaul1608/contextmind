import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createConversationSchema,
  updateConversationSchema,
  listConversationsQuerySchema,
} from '../schemas/conversation.schema';
import { env } from '../config/env';
import rateLimit from 'express-rate-limit';


const router = Router();

const writeLimiter =
  env.NODE_ENV === 'test'
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        },
      });


import { memoryController } from '../controllers/memory.controller';

router.get('/', validateQuery(listConversationsQuerySchema), conversationController.list);
router.post('/', writeLimiter, validateBody(createConversationSchema), conversationController.create);
router.get('/:id/summary', memoryController.getConversationSummary);
router.get('/:id', conversationController.getById);
router.patch('/:id', writeLimiter, validateBody(updateConversationSchema), conversationController.update);
router.delete('/:id', writeLimiter, conversationController.delete);

export { router as conversationRouter };
