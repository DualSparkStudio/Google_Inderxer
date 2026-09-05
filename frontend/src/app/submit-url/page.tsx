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

export default function SubmitUrlPage() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [polling, setPolling] = useState(false);

  // Poll for status updates while job is in a transient state
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
      // Fetch the full status immediately for detail view
      const detail = await api.getJobStatus(res.jobId);
      setJob(detail);
      setUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Submit URL for Discovery</h1>

        {/* Submission form */}
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
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
        </div>

        {/* Result card */}
        {job && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Job Status
              </h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={job.status} />
                {polling && (
                  <span className="text-xs text-gray-400 animate-pulse">updating…</span>
                )}
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <Row label="URL">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline break-all"
                >
                  {job.url}
                </a>
              </Row>

              <Row label="Job ID">
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{job.jobId}</code>
              </Row>

              <Row label="Provider">{job.provider ?? '—'}</Row>

              <Row label="Submitted">{formatDate(job.submittedAt)}</Row>

              {job.completedAt && (
                <Row label="Completed">{formatDate(job.completedAt)}</Row>
              )}

              {job.message && (
                <Row label="Message">
                  <span className={job.status === 'FAILED' ? 'text-red-600' : 'text-gray-700'}>
                    {job.message}
                  </span>
                </Row>
              )}
            </dl>

            {/* Validation summary */}
            {job.validationResult && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                  Validation details
                </summary>
                <ValidationSummary result={job.validationResult} />
              </details>
            )}

            {/* Disclaimer */}
            <p className="mt-5 text-xs text-gray-400 border-t border-gray-100 pt-4">
              Processing/discovery completion does not guarantee inclusion in any search index.
              Crawling and indexing decisions are controlled by each search engine independently.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 flex-shrink-0 text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

function ValidationSummary({ result }: { result: Record<string, unknown> }) {
  const fields: Array<{ key: string; label: string }> = [
    { key: 'httpStatus',  label: 'HTTP Status' },
    { key: 'finalUrl',    label: 'Final URL' },
    { key: 'hasNoindex',  label: 'Noindex' },
    { key: 'robotsHint',  label: 'Robots' },
    { key: 'canonicalUrl',label: 'Canonical' },
  ];

  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
      {fields.map(({ key, label }) =>
        result[key] !== undefined && result[key] !== null ? (
          <div key={key} className="flex gap-1">
            <dt className="text-gray-400">{label}:</dt>
            <dd>{String(result[key])}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
