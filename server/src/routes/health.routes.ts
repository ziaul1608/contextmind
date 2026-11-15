import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ollamaService } from '../services/ollama.service';
import { webSearchService } from '../services/webSearch.service';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus: 'up' | 'down' = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'up';
  } catch {
    dbStatus = 'down';
  }

  const ollamaHealth = await ollamaService.checkHealth();
  const isHealthy = dbStatus === 'up' && ollamaHealth.reachable;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    db: dbStatus,
    providers: {
      ollama: ollamaHealth.reachable,
      ollamaModel: ollamaHealth.currentModel,
      modelInstalled: ollamaHealth.modelInstalled,
      tavily: webSearchService.isConfigured(),
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
