/**
 * URL Validation Service
 *
 * Validates user-submitted URLs before processing:
 * - Structural validity
 * - SSRF protection (blocks private/internal IPs after DNS resolution)
 * - Reachability check
 * - HTTP response code check
 * - Redirect chain safety (each hop is also SSRF-checked)
 * - robots.txt hint (best-effort)
 * - noindex meta tag detection (best-effort)
 * - canonical URL extraction (best-effort)
 */

import dns from 'dns/promises';
import { URL } from 'url';
import fetch, { Response as FetchResponse } from 'node-fetch';
import { logger } from '../config/logger';

// ── SSRF block-lists ──────────────────────────────────────────────────────────

// Private IPv4 ranges (CIDR notation as prefix checks)
const PRIVATE_IP_PREFIXES = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '100.64.', // RFC 6598 shared address space
  '169.254.', // Link-local
  '192.0.2.', // TEST-NET-1
  '198.51.100.', // TEST-NET-2
  '203.0.113.', // TEST-NET-3
  '240.', // Reserved
  '255.255.255.255',
];

const PRIVATE_HOSTNAMES = [
  'localhost',
  'broadcasthost',
];

// Cloud metadata endpoints
const BLOCKED_HOSTS = [
  '169.254.169.254', // AWS/GCP/Azure metadata
  'metadata.google.internal',
  '100.100.100.200', // Alibaba Cloud metadata
];

/**
 * Returns true if the resolved IP address is private/internal.
 */
function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) return true;
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.slice(7);
    return isPrivateIpv4(ipv4);
  }
  if (ip.includes(':')) return isPrivateIpv6(ip);
  return isPrivateIpv4(ip);
}

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // fc00::/7 — Unique Local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // fe80::/10 — Link-local
  if (lower.startsWith('fe80')) return true;
  // loopback
  if (lower === '::1') return true;
  return false;
}

/**
 * Resolves the hostname and throws if any resolved address is private/internal.
 */
async function assertNotSsrfTarget(hostname: string): Promise<void> {
  const lowerHost = hostname.toLowerCase();

  if (PRIVATE_HOSTNAMES.includes(lowerHost)) {
    throw new ValidationError(`Blocked hostname: ${hostname}`);
  }

  if (BLOCKED_HOSTS.includes(lowerHost)) {
    throw new ValidationError(`Blocked metadata endpoint: ${hostname}`);
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new ValidationError(`DNS resolution failed for: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new ValidationError(
        `URL resolves to a private/internal address. Requests to internal networks are not allowed.`,
      );
    }
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  normalizedUrl: string;
  originalUrl: string;
  reachable: boolean;
  httpStatus?: number;
  finalUrl?: string;         // After redirects
  redirectChain?: string[];
  canonicalUrl?: string;
  hasNoindex?: boolean;
  robotsHint?: string;       // e.g. "disallowed" | "allowed" | "unknown"
  error?: string;
  checkedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const parsed = new URL(trimmed); // throws on invalid URL
  // Remove trailing slash from path only when path is "/"
  const normalized = parsed.toString();
  return normalized;
}

const NOINDEX_RE = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*["']/i;
const CANONICAL_RE = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;

function extractMetaTags(html: string): { hasNoindex: boolean; canonicalUrl?: string } {
  const hasNoindex = NOINDEX_RE.test(html);
  const canonicalMatch = CANONICAL_RE.exec(html);
  return {
    hasNoindex,
    canonicalUrl: canonicalMatch?.[1],
  };
}

// ── Main validation function ──────────────────────────────────────────────────

export const validationService = {
  async validate(rawUrl: string): Promise<ValidationResult> {
    const checkedAt = new Date().toISOString();

    // 1. Parse and normalize
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return {
        valid: false,
        normalizedUrl: rawUrl,
        originalUrl: rawUrl,
        reachable: false,
        error: 'Invalid URL format. Must be a valid HTTP or HTTPS URL.',
        checkedAt,
      };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        valid: false,
        normalizedUrl: rawUrl,
        originalUrl: rawUrl,
        reachable: false,
        error: `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`,
        checkedAt,
      };
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeUrl(rawUrl);
    } catch {
      return {
        valid: false,
        normalizedUrl: rawUrl,
        originalUrl: rawUrl,
        reachable: false,
        error: 'URL could not be normalized.',
        checkedAt,
      };
    }

    // 2. SSRF check — resolve the hostname before any outbound request
    try {
      await assertNotSsrfTarget(parsed.hostname);
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : 'SSRF check failed.';
      logger.warn('SSRF check blocked URL', { url: normalizedUrl, reason: message });
      return {
        valid: false,
        normalizedUrl,
        originalUrl: rawUrl,
        reachable: false,
        error: message,
        checkedAt,
      };
    }

    // 3. Fetch with redirect handling
    const redirectChain: string[] = [];
    let httpStatus: number | undefined;
    let finalUrl = normalizedUrl;
    let responseBody = '';

    try {
      // Manual redirect following so we can SSRF-check each hop
      let currentUrl = normalizedUrl;
      let hops = 0;
      const MAX_HOPS = 10;

      while (hops < MAX_HOPS) {
        hops++;

        // SSRF-check this hop's hostname
        const hopParsed = new URL(currentUrl);
        try {
          await assertNotSsrfTarget(hopParsed.hostname);
        } catch (err) {
          const message = err instanceof ValidationError ? err.message : 'SSRF check failed on redirect.';
          logger.warn('SSRF check blocked redirect', { url: currentUrl, reason: message });
          return {
            valid: false,
            normalizedUrl,
            originalUrl: rawUrl,
            reachable: false,
            error: `Redirect target blocked: ${message}`,
            redirectChain,
            checkedAt,
          };
        }

        let resp: FetchResponse;
        try {
          resp = await fetch(currentUrl, {
            method: 'GET',
            redirect: 'manual', // Handle redirects manually
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; URLIndexer/1.0)',
              Accept: 'text/html,application/xhtml+xml',
            },
            // node-fetch v2 doesn't have `signal` + AbortController natively in all versions,
            // use timeout option
            timeout: 10_000,
          } as any);
        } catch (fetchErr: any) {
          return {
            valid: false,
            normalizedUrl,
            originalUrl: rawUrl,
            reachable: false,
            error: `Could not reach URL: ${fetchErr.message ?? 'Network error'}`,
            redirectChain,
            checkedAt,
          };
        }

        httpStatus = resp.status;

        // Redirect?
        if ([301, 302, 303, 307, 308].includes(resp.status)) {
          const location = resp.headers.get('location');
          if (!location) {
            return {
              valid: false,
              normalizedUrl,
              originalUrl: rawUrl,
              reachable: false,
              httpStatus,
              error: 'Redirect with no Location header.',
              redirectChain,
              checkedAt,
            };
          }

          // Resolve relative redirects
          const nextUrl = new URL(location, currentUrl).toString();
          redirectChain.push(currentUrl);
          currentUrl = nextUrl;
          continue;
        }

        // Non-redirect response
        finalUrl = currentUrl;

        // Only read body for HTML content types (guard against binary responses)
        const contentType = resp.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          // Read up to 50KB of the body for meta tag analysis
          const buffer = await resp.buffer();
          responseBody = buffer.slice(0, 50_000).toString('utf-8');
        }

        break;
      }

      if (hops >= MAX_HOPS) {
        return {
          valid: false,
          normalizedUrl,
          originalUrl: rawUrl,
          reachable: false,
          error: 'Too many redirects.',
          redirectChain,
          checkedAt,
        };
      }

      // 4. Check HTTP status
      if (httpStatus && httpStatus >= 400) {
        return {
          valid: false,
          normalizedUrl,
          originalUrl: rawUrl,
          reachable: true,
          httpStatus,
          finalUrl,
          redirectChain,
          error: `URL returned HTTP ${httpStatus}.`,
          checkedAt,
        };
      }

    } catch (err: any) {
      return {
        valid: false,
        normalizedUrl,
        originalUrl: rawUrl,
        reachable: false,
        error: `Fetch error: ${err.message ?? 'Unknown error'}`,
        checkedAt,
      };
    }

    // 5. Meta tag analysis
    const { hasNoindex, canonicalUrl } = extractMetaTags(responseBody);

    // 6. robots.txt check (best-effort, non-blocking)
    let robotsHint: string = 'unknown';
    try {
      const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
      const robotsResp = await fetch(robotsUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; URLIndexer/1.0)' },
        timeout: 5_000,
      } as any);

      if (robotsResp.status === 200) {
        const robotsText = await robotsResp.text();
        // Very basic check: look for Disallow rules that could match the path
        const pathDisallowed = isPathDisallowedByRobots(robotsText, parsed.pathname);
        robotsHint = pathDisallowed ? 'disallowed' : 'allowed';
      } else {
        robotsHint = 'no-robots-file';
      }
    } catch {
      robotsHint = 'unknown';
    }

    return {
      valid: true,
      normalizedUrl,
      originalUrl: rawUrl,
      reachable: true,
      httpStatus,
      finalUrl,
      redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
      canonicalUrl,
      hasNoindex,
      robotsHint,
      checkedAt,
    };
  },
};

/**
 * Very basic robots.txt parser — checks if any Disallow rule matches the path.
 * This is a best-effort hint only; not a full RFC-compliant parser.
 */
function isPathDisallowedByRobots(robotsText: string, urlPath: string): boolean {
  const lines = robotsText.split('\n');
  let inRelevantUserAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.toLowerCase().startsWith('user-agent:')) {
      const agent = line.slice('user-agent:'.length).trim();
      inRelevantUserAgent = agent === '*' || agent.toLowerCase().includes('urlindexer');
      continue;
    }

    if (!inRelevantUserAgent) continue;

    if (line.toLowerCase().startsWith('disallow:')) {
      const disallowedPath = line.slice('disallow:'.length).trim();
      if (!disallowedPath) continue; // Empty disallow = allow everything
      if (urlPath.startsWith(disallowedPath)) return true;
    }
  }

  return false;
}
