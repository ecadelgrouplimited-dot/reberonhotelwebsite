'use client';
import { idbAll, idbDelete, idbPut, metaGet, metaSet, type OutboxItem } from './idb';

/** Shown instead of an error when a change is kept on the device for later. */
export const QUEUED_MESSAGE = 'Saved on this device — it will sync automatically when the connection is back.';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rb-outbox') : null;
export function onOutbox(fn: (msg: { type: string; [k: string]: unknown }) => void) {
  const h = (e: MessageEvent) => fn(e.data);
  channel?.addEventListener('message', h);
  return () => channel?.removeEventListener('message', h);
}
function notify(msg: { type: string; [k: string]: unknown }) {
  channel?.postMessage(msg);
  // BroadcastChannel does not deliver to its own sender.
  window.dispatchEvent(new CustomEvent('rb:outbox', { detail: msg }));
}

/** Plain-language names for what is waiting to sync. */
const LABELS: [RegExp, string][] = [
  [/^POST \/reservations\/[^/]+\/payments$/, 'Payment recorded'],
  [/^POST \/reservations\/[^/]+\/refunds$/, 'Refund recorded'],
  [/^POST \/reservations\/[^/]+\/cancel$/, 'Booking cancelled'],
  [/^POST \/reservations\/[^/]+\/amend$/, 'Booking changed'],
  [/^POST \/reservations\/[^/]+\/confirm$/, 'Booking confirmed'],
  [/^POST \/reservations\/[^/]+\/extend-hold$/, 'Hold extended'],
  [/^POST \/reservations$/, 'New reservation'],
  [/^PATCH \/reservations\/[^/]+$/, 'Booking notes'],
  [/^POST \/desk\/reservations\/[^/]+\/check-in$/, 'Check-in'],
  [/^POST \/desk\/reservations\/[^/]+\/check-out$/, 'Check-out'],
  [/^POST \/desk\/reservations\/[^/]+\/assign$/, 'Room given'],
  [/^POST \/desk\/reservations\/[^/]+\/move$/, 'Room move'],
  [/^POST \/desk\/reservations\/[^/]+\/charges$/, 'Charge on a bill'],
  [/^POST \/desk\/reservations\/[^/]+\/no-show$/, 'No-show'],
  [/^PATCH \/rack\/[^/]+\/status$/, 'Room status'],
  [/^(POST|PATCH|DELETE) \/housekeeping/, 'Housekeeping update'],
  [/^(POST|PATCH) \/pos.*\/(settle|pay)/, 'POS payment'],
  [/^(POST|PATCH|DELETE) \/pos/, 'POS order'],
  [/^(POST|PATCH|DELETE) \/expenses/, 'Expense'],
  [/^(POST|PATCH|DELETE) \/requisitions/, 'Requisition'],
  [/^(POST|PATCH|DELETE) \/inventory/, 'Stock update'],
  [/^(POST|PATCH|DELETE) \/health-club/, 'Health club'],
  [/^(POST|PATCH|DELETE) \/(conversations|inbox)/, 'Inbox reply'],
  [/^(POST|PATCH|DELETE) \/waitlist/, 'Waitlist update'],
  [/^(POST|PATCH|DELETE) \/guests/, 'Guest profile'],
  [/^(POST|PATCH|DELETE) \/(hr|staff|leave|shifts|payroll)/, 'HR update'],
  [/^(POST|PATCH|DELETE) \/quotations/, 'Quotation'],
  [/^(POST|PATCH|DELETE) \/receipts/, 'Receipt'],
];
export function labelFor(method: string, path: string) {
  const sig = `${method} ${path.split('?')[0]}`;
  const hit = LABELS.find(([re]) => re.test(sig));
  if (hit) return hit[1];
  const seg = path.split('/').filter(Boolean)[0] ?? 'change';
  return `${method === 'DELETE' ? 'Delete' : method === 'POST' ? 'New' : 'Update'} · ${seg.replace(/-/g, ' ')}`;
}

/** Writes that must happen live (signing in, devices) are never queued. */
export const queueable = (method: string, path: string) => method !== 'GET' && !/^\/(auth|push)\//.test(path);

/** In-memory copy of what is still waiting, so every read can show it applied. */
export let pendingSnapshot: OutboxItem[] = [];

export async function listOutbox() {
  const list = (await idbAll<OutboxItem>('outbox')).sort((a, b) => a.createdAt - b.createdAt);
  pendingSnapshot = list.filter((i) => i.status !== 'failed');
  return list;
}

if (typeof window !== 'undefined') {
  void listOutbox().catch(() => undefined);
  onOutbox(() => void listOutbox().catch(() => undefined));
  window.addEventListener('rb:outbox', () => void listOutbox().catch(() => undefined));
}

export async function enqueue(input: { id: string; method: OutboxItem['method']; path: string; body?: unknown }) {
  const items = await listOutbox();
  const bodyJson = input.body instanceof FormData ? null : JSON.stringify(input.body ?? null);
  // Pressing Save twice offline must not queue the same change twice.
  const dup = items.find((i) => i.status !== 'failed' && i.method === input.method && i.path === input.path && !i.form && bodyJson !== null && JSON.stringify(i.body ?? null) === bodyJson);
  if (dup) return dup;
  const me = await metaGet<{ id: string; name: string }>('me');
  let form: OutboxItem['form'];
  if (input.body instanceof FormData) {
    form = [];
    for (const [k, v] of input.body.entries()) form.push(typeof v === 'string' ? [k, v] : [k, v, (v as File).name]);
  }
  const item: OutboxItem = {
    id: input.id,
    method: input.method,
    path: input.path,
    body: form ? undefined : input.body,
    form,
    label: labelFor(input.method, input.path),
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
    userId: me?.id ?? null,
    userName: me?.name ?? null,
    route: typeof location !== 'undefined' ? location.pathname : undefined,
  };
  await idbPut('outbox', item);
  pendingSnapshot = [...pendingSnapshot, item];
  notify({ type: 'queued', id: item.id, label: item.label });
  void requestSync();
  return item;
}

export async function retry(id: string) {
  const it = (await listOutbox()).find((i) => i.id === id);
  if (!it) return;
  await idbPut('outbox', { ...it, status: 'pending', error: undefined });
  notify({ type: 'changed' });
  return syncNow();
}

export async function discard(id: string) {
  await idbDelete('outbox', id);
  notify({ type: 'changed' });
}

/** Ask the browser to replay when online again — works with the app closed where supported. */
export async function requestSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } })?.sync;
    if (sync) await sync.register('rb-outbox');
  } catch {
    /* Background Sync unsupported (Safari, Firefox) — the page replays on "online". */
  }
}

let localRun: Promise<void> | null = null;
/** Replay now: through the service worker when there is one, otherwise from the page. */
export async function syncNow() {
  const ctl = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (ctl) {
    ctl.postMessage({ type: 'SYNC_NOW' });
    return;
  }
  localRun ??= replayHere().finally(() => (localRun = null));
  return localRun;
}

async function replayHere() {
  const me = await metaGet<{ id: string }>('me');
  const items = (await listOutbox()).filter((i) => i.status !== 'failed' && (!i.userId || !me || i.userId === me.id));
  if (!items.length) return;
  notify({ type: 'sync-start', total: items.length });
  let done = 0;
  let failed = 0;
  for (const it of items) {
    const headers: Record<string, string> = { 'x-reberon-client': 'admin', 'idempotency-key': it.id, 'x-offline-queued-at': new Date(it.createdAt).toISOString() };
    let body: BodyInit | undefined;
    if (it.form) {
      const fd = new FormData();
      for (const [k, v, name] of it.form) (name ? fd.append(k, v as Blob, name) : fd.append(k, v));
      body = fd;
    } else if (it.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(it.body);
    }
    let res: Response;
    try {
      res = await fetch(`/v1/admin${it.path}`, { method: it.method, headers, body });
      if (res.status === 401) {
        const r = await fetch('/v1/admin/auth/refresh', { method: 'POST', headers: { 'x-reberon-client': 'admin' } });
        if (!r.ok) {
          notify({ type: 'auth-required' });
          break;
        }
        res = await fetch(`/v1/admin${it.path}`, { method: it.method, headers, body });
      }
    } catch {
      break;
    }
    if (res.ok) {
      await idbDelete('outbox', it.id);
      done += 1;
      notify({ type: 'item-synced', id: it.id, label: it.label });
    } else if (res.status >= 500 || res.status === 429) {
      await idbPut('outbox', { ...it, attempts: it.attempts + 1, error: `Server said ${res.status}` });
      break;
    } else {
      const j = await res.json().catch(() => ({}));
      await idbPut('outbox', { ...it, status: 'failed', attempts: it.attempts + 1, error: j.detail ?? `Server said ${res.status}`, failedAt: Date.now() });
      failed += 1;
      notify({ type: 'item-failed', id: it.id, label: it.label, error: j.detail });
    }
  }
  const left = (await listOutbox()).filter((i) => i.status !== 'failed').length;
  if (done) await metaSet('lastSyncAt', Date.now());
  notify({ type: 'sync-done', done, failed, left });
}
