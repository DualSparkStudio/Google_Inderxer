/**
 * WorkerService
 * ─────────────
 * Simple in-process background job runner.
 *
 * Architecture:
 *   - Jobs are enqueued in memory by the URL submission handler.
 *   - A setInterval loop polls the queue and processes jobs sequentially.
 *   - Each job runs: validate → process via IndexingEngine → update DB.
 *
 * Replacement path:
 *   - To switch to BullMQ/Redis, replace the enqueue() call in url.service.ts
 *     with a BullMQ queue.add() call, and replace the process() logic here
 *     with a BullMQ Worker. The job processing function stays the same.
 *
 * Concurrency note:
 *   - For V1 this processes one job at a time to keep things simple.
 *   - Increase concurrency by running multiple parallel processNextJob() calls.
 */

import { prisma } from '../config/prisma';
import { validationService } from './validation.service';
import { indexingEngine } from '../engine/IndexingEngine';
import { bridgeService } from './bridge.service';
import { logger } from '../config/logger';

const POLL_INTERVAL_MS = 2_000; // check for pending jobs every 2 seconds
const MAX_CONCURRENT = 3;       // process up to 3 jobs at a time

interface QueueItem {
  jobId: string;
}

class WorkerService {
  private queue: QueueItem[] = [];
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  enqueue(jobId: string): void {
    this.queue.push({ jobId });
    logger.debug('Worker: job enqueued', { jobId });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.drain();
      // Clean up expired bridge pages every poll cycle
      bridgeService.deleteExpired().catch(() => {});
    }, POLL_INTERVAL_MS);
    logger.info('Worker: started', { pollIntervalMs: POLL_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('Worker: stopped');
  }

  private drain(): void {
    while (this.active < MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      this.active++;
      this.processJob(item.jobId).finally(() => {
        this.active--;
      });
    }
  }

  private async processJob(jobId: string): Promise<void> {
    logger.info('Worker: processing job', { jobId });

    // ── 1. Mark as VALIDATING ─────────────────────────────────────────────
    let job;
    try {
      job = await prisma.indexingJob.update({
        where: { id: jobId },
        data: { status: 'VALIDATING', startedAt: new Date() },
      });
    } catch (err: any) {
      logger.error('Worker: failed to load job', { jobId, error: err.message });
      return;
    }

    // ── 2. Validate URL ───────────────────────────────────────────────────
    let validationResult;
    try {
      logger.info('Worker: validating URL', { jobId, url: job.url });
      validationResult = await validationService.validate(job.url);
      logger.info('Worker: validation complete', {
        jobId,
        valid: validationResult.valid,
        httpStatus: validationResult.httpStatus,
        hasNoindex: validationResult.hasNoindex,
        robotsHint: validationResult.robotsHint,
      });
    } catch (err: any) {
      logger.error('Worker: validation threw unexpectedly', { jobId, error: err.message });
      await this.failJob(jobId, 'Validation encountered an unexpected error.', {});
      return;
    }

    const validationJson = JSON.stringify(validationResult);

    if (!validationResult.valid) {
      await prisma.indexingJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          validationResult: validationJson,
          resultMessage: validationResult.error ?? 'URL validation failed.',
        },
      });
      logger.warn('Worker: job failed validation', { jobId, reason: validationResult.error });
      return;
    }

    // ── 3. Mark as PROCESSING ─────────────────────────────────────────────
    await prisma.indexingJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        validationResult: validationJson,
      },
    });

    // ── 4. Run indexing engine ────────────────────────────────────────────
    let result;
    try {
      logger.info('Worker: running indexing engine', { jobId, url: job.url });
      result = await indexingEngine.process(job.url, jobId);
      logger.info('Worker: indexing engine result', {
        jobId,
        success: result.success,
        provider: result.providerUsed,
        message: result.message,
      });
    } catch (err: any) {
      logger.error('Worker: indexing engine threw', { jobId, error: err.message });
      await this.failJob(jobId, 'Indexing engine encountered an unexpected error.', validationJson);
      return;
    }

    // ── 5. Store result ───────────────────────────────────────────────────
    await prisma.indexingJob.update({
      where: { id: jobId },
      data: {
        status: result.success ? 'PROCESSED' : 'FAILED',
        provider: result.providerUsed ?? undefined,
        resultMessage: result.message,
        metadata: JSON.stringify(result.metadata ?? {}),
        completedAt: new Date(),
      },
    });

    logger.info('Worker: job complete', {
      jobId,
      status: result.success ? 'PROCESSED' : 'FAILED',
    });
  }

  private async failJob(
    jobId: string,
    message: string,
    validationResult: string | Record<string, unknown>,
  ): Promise<void> {
    try {
      await prisma.indexingJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          resultMessage: message,
          validationResult:
            typeof validationResult === 'string' ? validationResult : JSON.stringify(validationResult),
        },
      });
    } catch (err: any) {
      logger.error('Worker: failed to mark job as failed', { jobId, error: err.message });
    }
  }
}

export const workerService = new WorkerService();
