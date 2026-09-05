import { Router, Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { submitLimiter } from '../middleware/rateLimiter';
import { urlService } from '../services/url.service';

export const urlsRouter = Router();

// All URL routes require authentication
urlsRouter.use(authenticate);

// ── POST /api/urls/submit ─────────────────────────────────────────────────────
urlsRouter.post(
  '/submit',
  submitLimiter,
  [
    body('url')
      .trim()
      .notEmpty().withMessage('URL is required.')
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Must be a valid HTTP or HTTPS URL.'),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { url } = req.body as { url: string };
      const result = await urlService.submit(url, req.user!.userId);

      res.status(201).json({
        success: true,
        jobId: result.jobId,
        url: result.url,
        status: result.status,
        submittedAt: result.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/urls/history ─────────────────────────────────────────────────────
urlsRouter.get(
  '/history',
  [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('page must be a positive integer.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('limit must be between 1 and 100.'),
    query('status')
      .optional()
      .isIn(['QUEUED', 'VALIDATING', 'PROCESSING', 'PROCESSED', 'FAILED', 'INDEXED'])
      .withMessage('Invalid status filter.'),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const page = (req.query['page'] as unknown as number) || 1;
      const limit = (req.query['limit'] as unknown as number) || 20;
      const status = req.query['status'] as string | undefined;

      const result = await urlService.getHistory(req.user!.userId, page, limit, status);

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/urls/:jobId/status ───────────────────────────────────────────────
urlsRouter.get(
  '/:jobId/status',
  [param('jobId').notEmpty().withMessage('Job ID required.')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const job = await urlService.getStatus(req.params['jobId']!, req.user!.userId);

      res.json({
        success: true,
        jobId: job.id,
        url: job.url,
        normalizedUrl: job.normalizedUrl,
        status: job.status,
        provider: job.provider,
        submittedAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
        message: job.resultMessage,
        validationResult: job.validationResult,
        metadata: job.metadata,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/urls/:jobId/retry ───────────────────────────────────────────────
urlsRouter.post(
  '/:jobId/retry',
  [param('jobId').notEmpty().withMessage('Job ID required.')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const result = await urlService.retry(req.params['jobId']!, req.user!.userId);

      res.json({
        success: true,
        jobId: result.jobId,
        url: result.url,
        status: result.status,
        submittedAt: result.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);
