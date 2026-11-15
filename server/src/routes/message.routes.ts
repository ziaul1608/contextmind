import { Router } from 'express';
import { messageController } from '../controllers/message.controller';
import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

const router = Router({ mergeParams: true });

// Rate limit: 60 messages per minute per IP
const messageLimiter =
  env.NODE_ENV === 'test'
    ? (_req: any, _res: any, next: any) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many messages. Please slow down.',
          },
        },
      });


router.post('/', messageLimiter, messageController.send);

export { router as messageRouter };
