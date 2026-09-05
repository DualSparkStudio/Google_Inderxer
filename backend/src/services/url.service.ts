import { prisma } from '../config/prisma';
import { workerService } from './worker.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

export interface SubmitResult {
  jobId: string;
  url: string;
  status: string;
  createdAt: Date;
}

export interface HistoryResult {
  jobs: JobSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JobSummary {
  id: string;
  url: string;
  status: string;
  provider: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  resultMessage: string | null;
}

export interface JobDetail extends JobSummary {
  normalizedUrl: string;
  startedAt: Date | null;
  validationResult: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const VALID_STATUSES = ['QUEUED', 'VALIDATING', 'PROCESSING', 'PROCESSED', 'FAILED', 'INDEXED'];

export const urlService = {
  async submit(rawUrl: string, userId: string): Promise<SubmitResult> {
    // Basic URL structure check before hitting the worker
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl.trim());
    } catch {
      throw new AppError(400, 'Invalid URL format.');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new AppError(400, 'Only HTTP and HTTPS URLs are accepted.');
    }

    const normalizedUrl = parsedUrl.toString();

    // Duplicate check — only block if same user submitted same URL and it's active
    const existing = await prisma.indexingJob.findFirst({
      where: {
        userId,
        normalizedUrl,
        status: { in: ['QUEUED', 'VALIDATING', 'PROCESSING'] },
      },
    });

    if (existing) {
      throw new AppError(
        409,
        `This URL is already being processed (Job ID: ${existing.id}).`,
      );
    }

    const job = await prisma.indexingJob.create({
      data: {
        userId,
        url: rawUrl.trim(),
        normalizedUrl,
        status: 'QUEUED',
      },
    });

    logger.info('URL submitted', { jobId: job.id, userId, url: normalizedUrl });

    // Enqueue for async processing — does not block the HTTP response
    workerService.enqueue(job.id);

    return {
      jobId: job.id,
      url: job.url,
      status: job.status,
      createdAt: job.createdAt,
    };
  },

  async getStatus(jobId: string, userId: string): Promise<JobDetail> {
    const job = await prisma.indexingJob.findUnique({ where: { id: jobId } });

    if (!job) throw new AppError(404, 'Job not found.');
    if (job.userId !== userId) throw new AppError(403, 'Access denied.');

    return {
      id: job.id,
      url: job.url,
      normalizedUrl: job.normalizedUrl,
      status: job.status,
      provider: job.provider,
      resultMessage: job.resultMessage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
      validationResult: job.validationResult ? safeJsonParse(job.validationResult) : null,
      metadata: job.metadata ? safeJsonParse(job.metadata) : null,
    };
  },

  async getHistory(
    userId: string,
    page: number,
    limit: number,
    statusFilter?: string,
  ): Promise<HistoryResult> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where: Record<string, unknown> = { userId };
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      where['status'] = statusFilter;
    }

    const [total, jobs] = await Promise.all([
      prisma.indexingJob.count({ where }),
      prisma.indexingJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          url: true,
          status: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          resultMessage: true,
        },
      }),
    ]);

    return {
      jobs,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  },

  async retry(jobId: string, userId: string): Promise<SubmitResult> {
    const job = await prisma.indexingJob.findUnique({ where: { id: jobId } });

    if (!job) throw new AppError(404, 'Job not found.');
    if (job.userId !== userId) throw new AppError(403, 'Access denied.');

    const retryableStatuses = ['FAILED'];
    if (!retryableStatuses.includes(job.status)) {
      throw new AppError(
        400,
        `Job cannot be retried. Current status: ${job.status}. Only FAILED jobs can be retried.`,
      );
    }

    const updated = await prisma.indexingJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        startedAt: null,
        completedAt: null,
        resultMessage: null,
        provider: null,
        validationResult: null,
        metadata: null,
      },
    });

    logger.info('Job retried', { jobId, userId });
    workerService.enqueue(jobId);

    return {
      jobId: updated.id,
      url: updated.url,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  },
};

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
