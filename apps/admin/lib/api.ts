'use client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
  fieldErrors() {
    return Object.fromEntries(this.errors.map((e) => [e.path, e.message]));
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh() {
  const res = await fetch('/v1/admin/auth/refresh', { method: 'POST', headers: { 'x-reberon-client': 'admin' } });
  return res.ok;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Same-origin call to the API (rewritten by Next). An expired access token is
 * refreshed once (single flight for concurrent calls) and the request retried.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const run = () =>
    fetch(`/v1/admin${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'x-reberon-client': 'admin',
        ...(opts.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  let res = await run();
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) res = await run();
    else if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = `/login?expired=1&next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.detail ?? 'Something went wrong', data.errors ?? []);
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T,>(path: string, body: unknown, headers?: Record<string, string>) => api<T>(path, { method: 'PATCH', body, headers });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T = void>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
export const MEDIA_URL = process.env.NEXT_PUBLIC_MEDIA_URL ?? 'http://localhost:4000/media';
export const thumb = (id: string, w: 320 | 640 | 960 | 1280 = 640) => `${MEDIA_URL}/i/${id}/${w}.webp`;
