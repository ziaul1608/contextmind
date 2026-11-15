import { Router } from 'express';
import { memoryController } from '../controllers/memory.controller';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createMemorySchema,
  updateMemorySchema,
  listMemoriesQuerySchema,
  searchMemoriesQuerySchema,
} from '../schemas/memory.schema';
import rateLimit from 'express-rate-limit';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
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

// Search route must be defined before /:id parameter route
router.get('/search', validateQuery(searchMemoriesQuerySchema), memoryController.search);

router.get('/', validateQuery(listMemoriesQuerySchema), memoryController.list);
router.post('/', writeLimiter, validateBody(createMemorySchema), memoryController.create);
router.get('/:id', memoryController.getById);
router.patch('/:id', writeLimiter, validateBody(updateMemorySchema), memoryController.update);
router.delete('/:id', writeLimiter, memoryController.delete);

export { router as memoryRouter };
