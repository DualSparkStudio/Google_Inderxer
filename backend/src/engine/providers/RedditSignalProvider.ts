/**
 * RedditSignalProvider
 * ────────────────────
 * Posts target URLs to Reddit to trigger Google's real-time crawler.
 *
 * Why Reddit:
 * - 100% Free API for personal script apps (up to 100 requests/minute, no credit card required).
 * - Google has a multi-million dollar real-time content licensing agreement with Reddit.
 * - Googlebot crawls and parses fresh Reddit posts within 60 to 180 seconds.
 * - Links posted to an owned subreddit or user profile are treated as immediate discovery hints.
 *
 * Required environment variables:
 * - REDDIT_CLIENT_ID
 * - REDDIT_CLIENT_SECRET
 * - REDDIT_USERNAME
 * - REDDIT_PASSWORD
 * - REDDIT_SUBREDDIT (optional: defaults to personal profile u_<username>)
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
const SUBMIT_ENDPOINT = 'https://oauth.reddit.com/api/submit';

export class RedditSignalProvider implements IndexingProvider {
  readonly name = 'reddit_signal';
  readonly description =
    'Posts target URLs to Reddit (100% free) to trigger Google’s real-time crawler ' +
    'via Google’s official Reddit data partnership.';

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  /**
   * Acquire or reuse a valid OAuth2 Bearer token using Password Grant.
   */
  private async getAccessToken(
    clientId: string,
    clientSecret: string,
    username: string,
    password: string,
  ): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const userAgent = `web:com.urlindexer.discovery:v1.0.0 (by /u/${username})`;

    const params = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: params.toString(),
      timeout: 10_000,
    } as any);

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Reddit auth HTTP ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(`Reddit auth error: ${data.error ?? 'Unknown error'}`);
    }

    this.cachedToken = data.access_token;
    // Expire 60s early for safety
    this.tokenExpiresAt = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;

    return this.cachedToken;
  }

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('RedditSignalProvider: starting', { jobId, url });

    const clientId = process.env['REDDIT_CLIENT_ID'];
    const clientSecret = process.env['REDDIT_CLIENT_SECRET'];
    const username = process.env['REDDIT_USERNAME'];
    const password = process.env['REDDIT_PASSWORD'];
    const subreddit = process.env['REDDIT_SUBREDDIT'] || (username ? `u_${username}` : '');

    if (!clientId || !clientSecret || !username || !password) {
      logger.warn('RedditSignalProvider: credentials not configured', { jobId });
      return {
        success: false,
        provider: this.name,
        message:
          'Reddit Signal skipped — REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, ' +
          'REDDIT_USERNAME, or REDDIT_PASSWORD not configured.',
        metadata: {
          note: 'Add your free Reddit script app credentials to environment variables to enable.',
        },
      };
    }

    try {
      const token = await this.getAccessToken(clientId, clientSecret, username, password);
      const userAgent = `web:com.urlindexer.discovery:v1.0.0 (by /u/${username})`;

      const cleanSub = subreddit.replace(/^r\//, '');
      const postTitle = `Discovery update: ${url}`;

      const submitParams = new URLSearchParams({
        sr: cleanSub,
        kind: 'link',
        title: postTitle,
        url,
        resubmit: 'true',
        api_type: 'json',
      });

      const submitResp = await fetch(SUBMIT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
        },
        body: submitParams.toString(),
        timeout: 10_000,
      } as any);

      if (!submitResp.ok) {
        const errorText = await submitResp.text();
        logger.error('RedditSignalProvider: submit failed HTTP status', {
          jobId,
          status: submitResp.status,
          errorText,
        });
        return {
          success: false,
          provider: this.name,
          message: `Reddit API returned HTTP ${submitResp.status}`,
          metadata: { error: errorText },
        };
      }

      const resData = (await submitResp.json()) as {
        json?: {
          errors?: Array<string[]>;
          data?: {
            id?: string;
            name?: string;
            url?: string;
          };
        };
      };

      const errors = resData.json?.errors;
      if (errors && errors.length > 0) {
        const errorMsg = errors.map((e) => e.join(': ')).join('; ');
        logger.warn('RedditSignalProvider: submission error response', { jobId, errorMsg });
        return {
          success: false,
          provider: this.name,
          message: `Reddit submission error: ${errorMsg}`,
          metadata: { errors },
        };
      }

      const postData = resData.json?.data;
      const postId = postData?.id || postData?.name || 'unknown';
      const postUrl = postData?.url || `https://reddit.com/r/${cleanSub}/comments/${postId}`;

      logger.info('RedditSignalProvider: post created successfully', {
        jobId,
        url,
        postId,
        postUrl,
        subreddit: cleanSub,
      });

      return {
        success: true,
        provider: this.name,
        message: `Post published to Reddit (${cleanSub}). Google real-time feed signaled.`,
        metadata: {
          postId,
          postUrl,
          subreddit: cleanSub,
          publishedAt: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('RedditSignalProvider: threw exception', { jobId, error: message });
      return {
        success: false,
        provider: this.name,
        message: `Reddit error: ${message}`,
        metadata: { error: message },
      };
    }
  }
}
