import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string> = {};
        for (const issue of err.issues) {
          details[issue.path.join('.')] = issue.message;
        }
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed.',
            details,
          },
        });
        return;
      }
      next(err);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string> = {};
        for (const issue of err.issues) {
          details[issue.path.join('.')] = issue.message;
        }
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter validation failed.',
            details,
          },
        });
        return;
      }
      next(err);
    }
  };
}
