'use client';

import { useState, useEffect, FormEvent } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import type { JobDetail } from '@/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Parse the raw combined message into per-provider results
function parseProviderResults(message: string | null): Array<{
  name: string;
  success: boolean;
  summary: string;
}> {
  if (!message) return [];

  const PROVIDER_LABELS: Record<string, string> = {
    google_bridge: 'Google (Bridge)',
    google_indexing: 'Google (Direct)',
    ping_discovery: 'Bing / Yandex (IndexNow)',
    sitemap_ping: 'Sitemap Ping',
    bing_url_submission: 'Bing (Direct)',
    websub: 'WebSub Hubs',
    ping_services: 'Ping Services',
  };

  const SUCCESS_KEYWORDS = [
    'submitted', 'accepted', 'notified', 'pinged', 'success',
  ];

  const SKIP_KEYWORDS = ['skipped', 'not configured'];
  const FAIL_KEYWORDS = ['failed', 'rejected', 'forbidden', 'error', '403', '404', '410'];

  // Split by " | [" pattern
  const parts = message.split(/\s*\|\s*(?=\[)/);

  return parts.map((part) => {
    const match = part.match(/\[([^\]]+)\]\s*(.*)/s);
    if (!match) return null;

    const key = match[1].trim();
    const raw = match[2].trim();

    const label = PROVIDER_LABELS[key] ?? key;
    const lower = raw.toLowerCase();

    let success = false;
    let summary = '';

    if (SKIP_KEYWORDS.some((k) => lower.includes(k))) {
      success = false;
      summary = 'Not configured';
    } else if (FAIL_KEYWORDS.some((k) => lower.includes(k))) {
      success = false;
      // Extract a short reason
      if (lower.includes('403')) summary = 'Not authorized for this domain';
      else if (lower.includes('rejected') || lower.includes('failed')) summary = 'Not accepted';
      else summary = 'Failed';
    } else if (SUCCESS_KEYWORDS.some((k) => lower.includes(k))) {
      success = true;
      // Short friendly summary
      if (key === 'google_bridge') summary = 'Submitted to Google — bridge page created';
      else if (key === 'ping_discovery') summary = 'Accepted by Bing & Yandex';
      else if (key === 'websub') {
        const m = raw.match(/(\d+)\/(\d+) accepted/);
        summary = m ? `${m[1]} of ${m[2]} hubs notified` : 'Hubs notified';
      } else if (key === 'ping_services') {
        const m = raw.match(/(\d+) accepted/);
        summary = m ? `${m[1]} services notified` : 'Services notified';
      } else {
        summary = 'Accepted';
      }
    } else {
      summary = raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
    }

    return { name: label, success, summary };
  }).filter(Boolean) as Array<{ name: string; success: boolean; summary: string }>;
}

export default function SubmitUrlPage() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!job) return;
    const transient = ['QUEUED', 'VALIDATING', 'PROCESSING'];
    if (!transient.includes(job.status)) return;

    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const updated = await api.getJobStatus(job.jobId);
        setJob(updated);
        if (!transient.includes(updated.status)) {
          clearInterval(interval);
          setPolling(false);
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      setPolling(false);
    };
  }, [job?.jobId, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setJob(null);
    setLoading(true);
    try {
      const res = await api.submitUrl(url.trim());
      const detail = await api.getJobStatus(res.jobId);
      setJob(detail);
      setUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  const providerResults = parseProviderResults(job?.message ?? null);
  const successCount = providerResults.filter((r) => r.success).length;

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Submit URL for Indexing</h1>

        {/* Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              URL
            </label>
            <div className="flex gap-3">
              <input
                id="url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                placeholder="https://example.com/article"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {loading ? 'Submitting…' : 'Submit for Indexing'}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </form>
        </div>

        {/* Result */}
        {job && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 break-all">{job.url}</p>
                <p className="text-xs text-gray-400 mt-0.5">Job ID: {job.jobId}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <StatusBadge status={job.status} />
                {polling && <span className="text-xs text-gray-400 animate-pulse">updating…</span>}
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Submitted</p>
                <p className="text-gray-700">{formatDate(job.submittedAt)}</p>
              </div>
              {job.completedAt && (
                <div>
                  <p className="text-xs text-gray-400">Completed</p>
                  <p className="text-gray-700">{formatDate(job.completedAt)}</p>
                </div>
              )}
            </div>

            {/* Provider results */}
            {providerResults.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Discovery Channels — {successCount}/{providerResults.length} active
                </p>
                <div className="space-y-2">
                  {providerResults.map((r) => (
                    <div key={r.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          r.success ? 'bg-green-500' : 'bg-gray-300'
                        }`} />
                        <span className={r.success ? 'text-gray-800' : 'text-gray-400'}>
                          {r.name}
                        </span>
                      </div>
                      <span className={`text-xs ${r.success ? 'text-green-600' : 'text-gray-400'}`}>
                        {r.summary}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation summary */}
            {job.validationResult && (
              <details className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer hover:text-gray-600">Validation details</summary>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500">
                  {(['httpStatus', 'finalUrl', 'hasNoindex', 'robotsHint', 'canonicalUrl'] as const).map((k) => {
                    const v = (job.validationResult as Record<string, unknown>)[k];
                    if (v === null || v === undefined) return null;
                    return (
                      <div key={k} className="flex gap-1">
                        <span className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                        <span>{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
              Submission complete. Google and other search engines make final crawling and indexing decisions independently. Most URLs are crawled within minutes to a few hours.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
