/**
 * BingUrlSubmissionProvider
 * ─────────────────────────
 * Submits URLs directly to Bing via the Bing URL Submission API.
 *
 * Unlike the Google Indexing API, Bing's URL submission API:
 * - Does NOT require domain ownership
 * - Does NOT require Search Console verification
 * - Works on any public URL
 * - Free tier: 10,000 URLs/day per API key
 *
 * Setup (one-time, free):
 * 1. Go to https://www.bing.com/webmasters
 * 2. Sign in with a Microsoft account
 * 3. Add any site (even your own) to get access to the API key
 * 4. Go to Settings → API Access → copy your API key
 * 5. Set BING_WEBMASTER_API_KEY in your .env
 *
 * Without the API key this provider gracefully skips and reports why.
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

const BING_SUBMISSION_URL = 'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch';

export class BingUrlSubmissionProvider implements IndexingProvider {
  readonly name = 'bing_url_submission';
  readonly description =
    'Submits URLs directly to Bing Webmaster API. No domain ownership required. ' +
    'Requires BING_WEBMASTER_API_KEY in environment.';

  async process(url: string, jobId: string): Promise<IndexingResult> {
    const apiKey = process.env['BING_WEBMASTER_API_KEY'];

    if (!apiKey) {
      logger.warn('BingUrlSubmissionProvider: no API key configured', { jobId });
      return {
        success: false,
        provider: this.name,
        message:
          'Bing URL Submission skipped — BING_WEBMASTER_API_KEY not configured. ' +
          'Get a free key at https://www.bing.com/webmasters',
        metadata: { skipped: true },
      };
    }

    logger.info('BingUrlSubmissionProvider: submitting URL', { jobId, url });

    try {
      const parsed = new URL(url);
      const siteUrl = `${parsed.protocol}//${parsed.hostname}/`;

      const body = {
        siteUrl,
        urlList: [url],
      };

      const resp = await fetch(
        `${BING_SUBMISSION_URL}?apikey=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
          timeout: 10_000,
        } as any,
      );

      const responseText = await resp.text();
      logger.info('BingUrlSubmissionProvider: response', {
        jobId,
        status: resp.status,
        body: responseText,
      });

      if (resp.status === 200) {
        return {
          success: true,
          provider: this.name,
          message: 'URL submitted to Bing Webmaster API successfully.',
          metadata: { httpStatus: resp.status, response: responseText },
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          success: false,
          provider: this.name,
          message:
            'Bing API rejected the key (401/403). Check BING_WEBMASTER_API_KEY is correct.',
          metadata: { httpStatus: resp.status, response: responseText },
        };
      }

      return {
        success: false,
        provider: this.name,
        message: `Bing URL Submission returned HTTP ${resp.status}.`,
        metadata: { httpStatus: resp.status, response: responseText },
      };
    } catch (err: any) {
      logger.error('BingUrlSubmissionProvider: request failed', {
        jobId,
        error: err.message,
      });
      return {
        success: false,
        provider: this.name,
        message: `Bing URL Submission failed: ${err.message}`,
        metadata: { error: err.message },
      };
    }
  }
}
