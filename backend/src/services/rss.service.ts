/**
 * RssService
 * ──────────
 * Generates dynamic RSS 2.0 / Atom feeds containing recently submitted URLs.
 *
 * Search engines (especially Google) use RSS feeds coupled with WebSub (PubSubHubbub)
 * to instantly detect new links published on the web.
 */

import { prisma } from '../config/prisma';

export const rssService = {
  /**
   * Generate RSS 2.0 XML with WebSub hub headers.
   */
  async generateRssXml(bridgeHost: string): Promise<string> {
    const recentJobs = await prisma.indexingJob.findMany({
      where: {
        status: { in: ['PROCESSED', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        url: true,
        createdAt: true,
      },
    });

    const feedUrl = `https://${bridgeHost}/rss.xml`;
    const siteUrl = `https://${bridgeHost}`;
    const buildDate = new Date().toUTCString();

    const itemsXml = recentJobs
      .map((job) => {
        const escapedUrl = job.url
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        const pubDate = new Date(job.createdAt).toUTCString();

        return `    <item>
      <title>Discovery: ${escapedUrl}</title>
      <link>${escapedUrl}</link>
      <guid isPermaLink="false">${job.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>Real-time link discovery update: ${escapedUrl}</description>
    </item>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>URL Indexer Real-Time Discovery Feed</title>
    <link>${siteUrl}</link>
    <description>Live syndication and rapid indexing discovery feed</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/>
    <atom:link href="https://pubsubhubbub.superfeedr.com/" rel="hub"/>
${itemsXml}
  </channel>
</rss>`;
  },
};
