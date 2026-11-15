import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service';
import { CreateConversationInput, UpdateConversationInput, ListConversationsQuery } from '../schemas/conversation.schema';

// Extend Express Request to include workspaceId (injected by middleware)
declare global {
  namespace Express {
    interface Request {
      workspaceId: string;
    }
  }
}

export const conversationController = {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title } = req.body as CreateConversationInput;
      const conversation = await conversationService.create(req.workspaceId, title);
      res.status(201).json({ data: conversation });
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, limit, cursor } = req.query as unknown as ListConversationsQuery;
      const result = await conversationService.list(req.workspaceId, { q, limit, cursor });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const conversation = await conversationService.getById(id, req.workspaceId);
      res.status(200).json({ data: conversation });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { title } = req.body as UpdateConversationInput;
      const conversation = await conversationService.rename(id, req.workspaceId, title);
      res.status(200).json({ data: conversation });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await conversationService.delete(id, req.workspaceId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
