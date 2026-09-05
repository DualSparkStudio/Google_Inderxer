'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import type { JobSummary, JobStatus } from '@/types';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',           label: 'All statuses' },
  { value: 'QUEUED',     label: 'Queued' },
  { value: 'VALIDATING', label: 'Validating' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PROCESSED',  label: 'Processed' },
  { value: 'FAILED',     label: 'Failed' },
  { value: 'INDEXED',    label: 'Indexed' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateUrl(url: string, max = 60) {
  if (url.length <= max) return url;
  return url.slice(0, max) + '…';
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchHistory = useCallback(async (p: number, s: JobStatus | '') => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getHistory(p, 20, s);
      setJobs(res.jobs);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page, status);
  }, [page, status, fetchHistory]);

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      await api.retryJob(jobId);
      fetchHistory(page, status);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetrying(null);
    }
  }

  function handleStatusChange(val: string) {
    setStatus(val as JobStatus | '');
    setPage(1);
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">History</h1>
            {!loading && (
              <p className="text-sm text-gray-400 mt-0.5">
                {total} {total === 1 ? 'submission' : 'submissions'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Status filter */}
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Refresh */}
            <button
              onClick={() => fetchHistory(page, status)}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              aria-label="Refresh"
            >
              {loading ? '↻ Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading && jobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-500">No submissions yet.</p>
              <Link
                href="/submit-url"
                className="mt-2 inline-block text-sm text-brand-600 hover:underline"
              >
                Submit your first URL →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    URL
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Provider
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Submitted
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Last Updated
                  </th>
                  <th className="py-3 pl-3 pr-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    {/* URL */}
                    <td className="py-3 pl-4 pr-3 font-mono text-xs text-gray-700 max-w-xs">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                        title={job.url}
                      >
                        {truncateUrl(job.url)}
                      </a>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <StatusBadge status={job.status} />
                    </td>

                    {/* Provider */}
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap hidden md:table-cell">
                      {job.provider ?? '—'}
                    </td>

                    {/* Submitted */}
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap hidden lg:table-cell">
                      {formatDate(job.createdAt)}
                    </td>

                    {/* Updated */}
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap hidden lg:table-cell">
                      {formatDate(job.updatedAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/history/${job.id}`}
                          className="rounded px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          View
                        </Link>
                        {job.status === 'FAILED' && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            disabled={retrying === job.id}
                            className="rounded px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                          >
                            {retrying === job.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
