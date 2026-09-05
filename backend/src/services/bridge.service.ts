/**
 * BridgeService
 * ─────────────
 * Manages temporary bridge pages used by the GoogleBridgeProvider.
 *
 * A bridge page is a minimal HTML page hosted on our verified domain
 * (index.dualsparkstudio.com) that contains a link to the target URL.
 * When Google crawls the bridge page via the Indexing API, it follows
 * the link and discovers the target URL.
 *
 * Pages are automatically deleted after CRAWL_WINDOW_HOURS.
 */

import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

// How long to keep bridge pages alive after creation (gives Google time to crawl)
const CRAWL_WINDOW_HOURS = 24;

export const bridgeService = {
  /**
   * Create a new bridge page record for a target URL.
   */
  async create(jobId: string, targetUrl: string): Promise<{ id: string; bridgeUrl: string }> {
    const deleteAfter = new Date(Date.now() + CRAWL_WINDOW_HOURS * 60 * 60 * 1000);

    const page = await prisma.bridgePage.create({
      data: {
        jobId,
        targetUrl,
        deleteAfter,
      },
    });

    const bridgeHost = process.env['BRIDGE_HOST'] ?? 'index.dualsparkstudio.com';
    const bridgeUrl = `https://${bridgeHost}/bridge/${page.id}`;

    logger.info('BridgeService: page created', { id: page.id, jobId, targetUrl, bridgeUrl });

    return { id: page.id, bridgeUrl };
  },

  /**
   * Get a bridge page by ID (used by the serving route).
   */
  async get(id: string) {
    return prisma.bridgePage.findUnique({ where: { id } });
  },

  /**
   * Mark a bridge page as crawled.
   */
  async markCrawled(id: string): Promise<void> {
    await prisma.bridgePage.update({
      where: { id },
      data: { crawled: true, crawledAt: new Date() },
    });
    logger.info('BridgeService: page marked as crawled', { id });
  },

  /**
   * Delete expired bridge pages (called by the cleanup worker).
   */
  async deleteExpired(): Promise<number> {
    const result = await prisma.bridgePage.deleteMany({
      where: { deleteAfter: { lte: new Date() } },
    });
    if (result.count > 0) {
      logger.info('BridgeService: deleted expired pages', { count: result.count });
    }
    return result.count;
  },

  /**
   * Build the HTML content for a bridge page.
   * Minimal, clean HTML that Googlebot can crawl easily.
   */
  buildHtml(targetUrl: string, bridgeId: string): string {
    const escaped = targetUrl.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="index,follow">
  <meta name="google-site-verification" content="VOsCR2OanRtdaCTSeC7dCdxlF6VuS3hMPqj02VzDVBY">
  <title>Page Discovery</title>
  <link rel="canonical" href="${escaped}">
</head>
<body>
  <p>Discovering: <a href="${escaped}" rel="follow">${escaped}</a></p>
  <!-- bridge:${bridgeId} -->
</body>
</html>`;
  },
};
