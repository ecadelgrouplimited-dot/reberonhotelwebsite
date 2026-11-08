'use client';
import { enqueue, pendingSnapshot, queueable, QUEUED_MESSAGE } from './offline/outbox';
import { applyOps } from './offline/optimistic';
import type { OutboxItem } from './offline/idb';

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

/** A write kept on the device while offline. Extends ApiError so every screen's error path shows the friendly message. */
export class OfflineQueuedError extends ApiError {
  constructor(readonly item: OutboxItem) {
    super(0, 'QUEUED_OFFLINE', QUEUED_MESSAGE);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh() {
  try {
    const res = await fetch('/v1/admin/auth/refresh', { method: 'POST', headers: { 'x-reberon-client': 'admin' } });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/** When the shown data came from the device instead of the server (offline / very slow). */
export const savedCopy = { at: null as string | null };

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/**
 * Same-origin call to the API (rewritten by Next). An expired access token is
 * refreshed once (single flight for concurrent calls) and the request retried.
 *
 * Offline: every write carries an Idempotency-Key. If the network is gone the
 * write is kept in the device outbox and an OfflineQueuedError is thrown, so the
 * screen can say "saved, will sync" — the service worker replays it later and the
 * key makes sure the server applies it exactly once.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const method = opts.method ?? 'GET';
  const canQueue = queueable(method, path);
  const idemKey = canQueue ? (opts.headers?.['idempotency-key'] ?? uuid()) : undefined;
  const run = () =>
    fetch(`/v1/admin${path}`, {
      method,
      headers: {
        'x-reberon-client': 'admin',
        ...(opts.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...(idemKey ? { 'idempotency-key': idemKey } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  const queue = async () => {
    const item = await enqueue({ id: idemKey!, method: method as 'POST', path, body: opts.body });
    window.dispatchEvent(new CustomEvent('rb:offline-queued', { detail: item }));
    throw new OfflineQueuedError(item);
  };
  if (canQueue && typeof navigator !== 'undefined' && navigator.onLine === false) return queue();
  let res: Response;
  try {
    res = await run();
  } catch (e) {
    if (canQueue) return queue();
    throw new ApiError(0, 'OFFLINE', method === 'GET' ? 'You are offline and this has not been saved on this device yet.' : 'You are offline — this action needs a connection.', []);
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) res = await run();
    else if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = `/login?expired=1&next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }
  if (method === 'GET' && typeof window !== 'undefined') {
    const saved = res.headers.get('x-rb-cache');
    const prev = savedCopy.at;
    savedCopy.at = saved && saved !== 'none' ? saved : res.ok ? null : prev;
    if (prev !== savedCopy.at) window.dispatchEvent(new CustomEvent('rb:saved-copy', { detail: savedCopy.at }));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data.code === 'OFFLINE_NO_DATA' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rb:offline-missing', { detail: path }));
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.detail ?? 'Something went wrong', data.errors ?? []);
  // Changes made offline and not yet synced are shown on top of whatever the server (or saved copy) says.
  if (method === 'GET' && pendingSnapshot.length) return applyOps(data as T, pendingSnapshot);
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
