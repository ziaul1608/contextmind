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

  const aiHealth = await ollamaService.checkHealth();
  const isHealthy = dbStatus === 'up' && aiHealth.reachable;
  const provider = aiHealth.provider;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    db: dbStatus,
    providers: {
      aiProvider: provider,
      ollama: provider === 'ollama' ? aiHealth.reachable : false,
      ollamaModel: provider === 'ollama' ? aiHealth.currentModel : undefined,
      modelInstalled: aiHealth.modelInstalled,
      groq: provider === 'groq' ? aiHealth.reachable : false,
      groqModel: provider === 'groq' ? aiHealth.currentModel : undefined,
      tavily: webSearchService.isConfigured(),
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
