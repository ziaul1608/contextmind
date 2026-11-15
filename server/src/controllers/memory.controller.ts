import { Request, Response, NextFunction } from 'express';
import { memoryService } from '../services/memory.service';
import {
  CreateMemoryInput,
  UpdateMemoryInput,
  ListMemoriesQuery,
  SearchMemoriesQuery,
} from '../schemas/memory.schema';

export const memoryController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as ListMemoriesQuery;
      const result = await memoryService.list(req.workspaceId, query);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as SearchMemoriesQuery;
      const results = await memoryService.searchHistoricalContext(
        req.workspaceId,
        query.q,
        undefined,
        query.limit,
      );
      res.status(200).json({ data: results });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const memory = await memoryService.getById(id, req.workspaceId);
      res.status(200).json({ data: memory });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as CreateMemoryInput;
      const memory = await memoryService.create(req.workspaceId, input);
      res.status(201).json({ data: memory });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = req.body as UpdateMemoryInput;
      const memory = await memoryService.update(id, req.workspaceId, input);
      res.status(200).json({ data: memory });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await memoryService.delete(id, req.workspaceId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async getConversationSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const summary = await memoryService.getConversationSummary(id, req.workspaceId);
      res.status(200).json({ data: summary });
    } catch (err) {
      next(err);
    }
  },
};
