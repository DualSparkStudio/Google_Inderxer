/**
 * GoogleBridgeProvider
 * ─────────────────────
 * Closes the System B gap — submits third-party URLs to Google by:
 *
 * 1. Creating a temporary bridge page on our verified domain
 *    (index.dualsparkstudio.com/bridge/:id)
 * 2. That page links to the target URL
 * 3. Calling Google Indexing API to crawl our bridge page
 * 4. Google crawls our page, follows the link, discovers the target URL
 * 5. Bridge page is auto-deleted after 24 hours
 *
 * This works because:
 * - We own index.dualsparkstudio.com (verified in Search Console)
 * - Google Indexing API accepts URLs from verified domains
 * - Googlebot follows links from crawled pages
 *
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE
 * - BRIDGE_HOST (default: index.dualsparkstudio.com)
 *
 * Note: Google ToS grey area — same mechanism used by commercial indexers.
 */

import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { IndexingProvider, IndexingResult } from '../types';
import { bridgeService } from '../../services/bridge.service';
import { logger } from '../../config/logger';

const INDEXING_API_ENDPOINT =
  'https://indexing.googleapis.com/v3/urlNotifications:publish';

const SCOPES = ['https://www.googleapis.com/auth/indexing'];

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

function loadServiceAccountKey(): ServiceAccountKey {
  const keyJson = process.env['GOOGLE_SERVICE_ACCOUNT_KEY_JSON'];
  if (keyJson) {
    try {
      return JSON.parse(keyJson) as ServiceAccountKey;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON contains invalid JSON.');
    }
  }

  const keyFile = process.env['GOOGLE_SERVICE_ACCOUNT_KEY_FILE'];
  if (keyFile) {
    const resolved = path.resolve(keyFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Key file not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, 'utf-8')) as ServiceAccountKey;
  }

  throw new Error(
    'Google credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE.',
  );
}

export class GoogleBridgeProvider implements IndexingProvider {
  readonly name = 'google_bridge';
  readonly description =
    'Creates a bridge page on our verified domain linking to the target URL, ' +
    'then calls Google Indexing API to crawl it. ' +
    'Google follows the link and discovers the target URL. ' +
    'Bridge pages are auto-deleted after 24 hours.';

  private authClient: JWT | null = null;

  private getAuthClient(): JWT {
    if (this.authClient) return this.authClient;
    const key = loadServiceAccountKey();
    this.authClient = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: SCOPES,
    });
    return this.authClient;
  }

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('GoogleBridgeProvider: starting', { jobId, url });

    // Step 1 — create bridge page
    let bridgeUrl: string;
    let bridgeId: string;
    try {
      const result = await bridgeService.create(jobId, url);
      bridgeUrl = result.bridgeUrl;
      bridgeId = result.id;
      logger.info('GoogleBridgeProvider: bridge page created', { jobId, bridgeUrl });
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        message: `Failed to create bridge page: ${err.message}`,
        metadata: { error: err.message },
      };
    }

    // Step 2 — get Google access token
    let accessToken: string;
    try {
      const authClient = this.getAuthClient();
      const tokenResponse = await authClient.getAccessToken();
      if (!tokenResponse.token) throw new Error('Empty access token.');
      accessToken = tokenResponse.token;
    } catch (err: any) {
      logger.error('GoogleBridgeProvider: auth failed', { jobId, error: err.message });
      return {
        success: false,
        provider: this.name,
        message: `Google auth error: ${err.message}`,
        metadata: { bridgeUrl, error: err.message },
      };
    }

    // Step 3 — submit bridge page URL to Google Indexing API
    let httpStatus: number;
    let responseBody: Record<string, unknown>;

    try {
      const response = await fetch(INDEXING_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url: bridgeUrl,
          type: 'URL_UPDATED',
        }),
      });

      httpStatus = response.status;
      responseBody = (await response.json()) as Record<string, unknown>;

      logger.info('GoogleBridgeProvider: Indexing API response', {
        jobId,
        bridgeUrl,
        httpStatus,
        response: responseBody,
      });
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        message: `Google Indexing API request failed: ${err.message}`,
        metadata: { bridgeUrl, error: err.message },
      };
    }

    if (httpStatus === 200) {
      return {
        success: true,
        provider: this.name,
        message:
          'Google Bridge: bridge page submitted to Google Indexing API. ' +
          'Google will crawl the bridge page and follow the link to the target URL. ' +
          'This typically completes within minutes to hours.',
        metadata: {
          bridgeUrl,
          bridgeId,
          targetUrl: url,
          httpStatus,
          apiResponse: responseBody,
          note: 'Bridge page will be auto-deleted after 24 hours.',
        },
      };
    }

    if (httpStatus === 403) {
      return {
        success: false,
        provider: this.name,
        message:
          'Google Bridge: 403 Forbidden. ' +
          'Make sure index.dualsparkstudio.com is verified in Search Console ' +
          'and the service account has Owner permission.',
        metadata: { bridgeUrl, httpStatus, apiResponse: responseBody },
      };
    }

    if (httpStatus === 429) {
      return {
        success: false,
        provider: this.name,
        message: 'Google Bridge: quota exceeded (200/day). Add more service accounts to scale.',
        metadata: { bridgeUrl, httpStatus, apiResponse: responseBody },
      };
    }

    return {
      success: false,
      provider: this.name,
      message: `Google Bridge: Indexing API returned HTTP ${httpStatus}.`,
      metadata: { bridgeUrl, httpStatus, apiResponse: responseBody },
    };
  }
}
