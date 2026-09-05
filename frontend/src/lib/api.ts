import { getToken } from './auth';
import type {
  AuthResponse,
  SubmitResponse,
  HistoryResponse,
  JobDetail,
  JobStatus,
} from '@/types';

// In development Next.js rewrites /api/* → backend.
// In production set NEXT_PUBLIC_API_URL and requests go directly.
const BASE = '';

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error ?? `Request failed: ${res.status}`);
    }

    return data as T;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  logout(): Promise<void> {
    return this.request<void>('/api/auth/logout', { method: 'POST' });
  }

  // ── URLs ────────────────────────────────────────────────────────────────────

  submitUrl(url: string): Promise<SubmitResponse> {
    return this.request<SubmitResponse>('/api/urls/submit', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  getHistory(
    page = 1,
    limit = 20,
    status?: JobStatus | '',
  ): Promise<HistoryResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) params.set('status', status);
    return this.request<HistoryResponse>(`/api/urls/history?${params}`);
  }

  getJobStatus(jobId: string): Promise<JobDetail> {
    return this.request<JobDetail>(`/api/urls/${jobId}/status`);
  }

  retryJob(jobId: string): Promise<SubmitResponse> {
    return this.request<SubmitResponse>(`/api/urls/${jobId}/retry`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
