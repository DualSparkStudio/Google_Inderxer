/**
 * PingServicesProvider
 * ─────────────────────
 * Pings 20+ public ping services simultaneously.
 *
 * Ping services are notification endpoints that aggregators, blog directories,
 * and search crawlers monitor. When a URL is pinged, these services flag it
 * for crawling. Googlebot and other crawlers actively monitor several of these.
 *
 * No API key required.
 * No domain ownership required.
 * Works on any public URL.
 *
 * Uses the XML-RPC weblogUpdates.ping protocol (industry standard since 2001)
 * and REST GET ping endpoints where available.
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

// XML-RPC ping body builder
function buildXmlRpcPing(title: string, url: string): string {
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value><string>${escapeXml(title)}</string></value></param>
    <param><value><string>${escapeXml(url)}</string></value></param>
  </params>
</methodCall>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// XML-RPC ping services
const XMLRPC_SERVICES: string[] = [
  'http://rpc.pingomatic.com/',
  'http://ping.feedburner.com/',
  'http://rpc.twingly.com/',
  'http://ping.blogs.yandex.ru/RPC2',
  'http://blogsearch.google.com/ping/RPC2',
  'http://ping.blo.gs/',
  'http://rpc.blogrolling.com/pinger/',
  'http://ping.syndic8.com/xmlrpc.php',
  'http://ping.weblogalot.com/rpc.php',
  'http://rpc.weblogs.com/RPC2',
  'http://ping.feedster.com/do.php',
  'http://www.blogpeople.net/servlet/weblogUpdates',
  'http://ping.blogmaru.com/',
  'http://ping.rootblog.com/rpc.php',
  'http://ping.bloggers.jp/rpc/',
];

// REST GET ping services
const REST_SERVICES: Array<{ name: string; url: (u: string) => string }> = [
  {
    name: 'Ping-O-Matic',
    url: (u) =>
      `http://rpc.pingomatic.com/?url=${encodeURIComponent(u)}`,
  },
  {
    name: 'Google Blog Search',
    url: (u) =>
      `https://blogsearch.google.com/ping?url=${encodeURIComponent(u)}`,
  },
  {
    name: 'Bing Blog Ping',
    url: (u) =>
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(u)}`,
  },
  {
    name: 'Feedburner',
    url: (u) =>
      `http://ping.feedburner.com/?url=${encodeURIComponent(u)}`,
  },
  {
    name: 'Twingly',
    url: (u) =>
      `http://rpc.twingly.com/?url=${encodeURIComponent(u)}`,
  },
];

const TIMEOUT_MS = 8_000;
const MAX_CONCURRENT = 10; // Don't hammer all at once

async function pingXmlRpc(
  serviceUrl: string,
  url: string,
): Promise<{ service: string; accepted: boolean; note: string }> {
  try {
    const body = buildXmlRpcPing(url, url);
    const resp = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body,
      timeout: TIMEOUT_MS,
    } as any);

    const accepted = resp.status === 200;
    return {
      service: serviceUrl,
      accepted,
      note: `HTTP ${resp.status}`,
    };
  } catch (err: any) {
    return {
      service: serviceUrl,
      accepted: false,
      note: err.message ?? 'Network error',
    };
  }
}

async function pingRest(
  name: string,
  pingUrl: string,
): Promise<{ service: string; accepted: boolean; note: string }> {
  try {
    const resp = await fetch(pingUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; URLIndexer/1.0)' },
      timeout: TIMEOUT_MS,
    } as any);

    const accepted = resp.status === 200;
    return { service: name, accepted, note: `HTTP ${resp.status}` };
  } catch (err: any) {
    return {
      service: name,
      accepted: false,
      note: err.message ?? 'Network error',
    };
  }
}

// Run array of async tasks with max concurrency
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

export class PingServicesProvider implements IndexingProvider {
  readonly name = 'ping_services';
  readonly description =
    'Pings 20+ public ping services (XML-RPC + REST). ' +
    'No API key or domain ownership required.';

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('PingServicesProvider: starting', {
      jobId,
      url,
      totalServices: XMLRPC_SERVICES.length + REST_SERVICES.length,
    });

    // Build task list
    const tasks: Array<() => Promise<{ service: string; accepted: boolean; note: string }>> = [
      // XML-RPC pings
      ...XMLRPC_SERVICES.map(
        (svc) => () => pingXmlRpc(svc, url),
      ),
      // REST pings
      ...REST_SERVICES.map(
        (svc) => () => pingRest(svc.name, svc.url(url)),
      ),
    ];

    const results = await runConcurrent(tasks, MAX_CONCURRENT);

    const accepted = results.filter((r) => r.accepted);
    const failed = results.filter((r) => !r.accepted);

    logger.info('PingServicesProvider: complete', {
      jobId,
      total: results.length,
      accepted: accepted.length,
      failed: failed.length,
    });

    return {
      success: accepted.length > 0,
      provider: this.name,
      message:
        `Pinged ${results.length} services: ` +
        `${accepted.length} accepted, ${failed.length} failed/unreachable.`,
      metadata: {
        total: results.length,
        accepted: accepted.length,
        failed: failed.length,
        acceptedServices: accepted.map((r) => r.service),
        failedServices: failed.map((r) => ({
          service: r.service,
          reason: r.note,
        })),
      },
    };
  }
}
