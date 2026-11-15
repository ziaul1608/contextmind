import { Request, Response, NextFunction } from 'express';
import { agentService } from '../services/agent.service';
import { setSseHeaders, writeSseEvent } from '../services/sse.service';
import { sendMessageSchema } from '../schemas/message.schema';
import { NotFoundError, AppError } from '../middleware/errorHandler';

export const messageController = {
  async send(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Validate body
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      const details: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        details[issue.path.join('.')] = issue.message;
      }
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid message.', details },
      });
      return;
    }

    const { content } = parsed.data;
    const { id: conversationId } = req.params;

    // Set up SSE before anything async so the client can receive errors too
    setSseHeaders(res);

    // Create AbortController tied to client disconnect
    const abortController = new AbortController();
    let isCompletedNormally = false;

    const onClientClose = () => {
      // Premature close: client closed connection before normal response completion
      if (!isCompletedNormally && !res.writableEnded) {
        abortController.abort();
      }
    };

    req.on('aborted', () => {
      if (!isCompletedNormally) {
        abortController.abort();
      }
    });

    res.on('close', onClientClose);

    try {
      await agentService.handleMessage(
        conversationId,
        req.workspaceId,
        content,
        res,
        abortController.signal,
      );
      isCompletedNormally = true;
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }
      if (err instanceof NotFoundError || err instanceof AppError) {
        // Stream hasn't started sending tokens yet — emit SSE error and close
        if (!res.headersSent) {
          // Headers not sent yet (shouldn't happen since setSseHeaders runs first),
          // fall through to normal error handler
          next(err);
          return;
        }
        writeSseEvent(res, 'error', {
          code: err instanceof AppError ? err.code : 'NOT_FOUND',
          message: err.message,
          retryable: false,
        });
      } else {
        console.error('[ContextMind] Unhandled message error:', err);
        writeSseEvent(res, 'error', {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
          retryable: true,
        });
      }
    } finally {
      res.removeListener('close', onClientClose);
      if (!res.writableEnded) {
        res.end();
      }
    }
  },
};
