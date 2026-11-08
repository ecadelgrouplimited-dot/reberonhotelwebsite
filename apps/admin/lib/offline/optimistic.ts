'use client';
import type { OutboxItem } from './idb';

/**
 * Offline changes show up on screen straight away.
 *
 * For a queued `PATCH …/<id>[/status]` every object anywhere in the cached data
 * with that id gets the new values (only fields it already has, only plain values).
 * For a queued `DELETE …/<id>` that object disappears from lists. The same patch
 * is re-applied to every saved copy the service worker serves until it syncs, so
 * a reload offline still shows the change.
 */
const ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{20,})$/i;
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isValue = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

type Op = { kind: 'merge'; id: string; fields: Record<string, unknown> } | { kind: 'remove'; id: string };

export function opFor(item: Pick<OutboxItem, 'method' | 'path' | 'body' | 'form'>): Op | null {
  const parts = item.path.split('?')[0]!.split('/').filter(Boolean);
  const idIdx = parts.findLastIndex((p) => ID.test(p));
  if (idIdx < 0) return null;
  const id = parts[idIdx]!;
  const tail = parts.slice(idIdx + 1);
  if (item.method === 'DELETE' && tail.length === 0) return { kind: 'remove', id };
  // Actions whose result is a known status change.
  if (item.method === 'POST' && tail.length === 1) {
    const b = isPlain(item.body) ? item.body : {};
    const ACTIONS: Record<string, Record<string, unknown>> = {
      'check-in': { status: 'IN_HOUSE' },
      'check-out': { status: 'CHECKED_OUT' },
      'no-show': { status: 'NO_SHOW' },
      cancel: { status: 'CANCELLED' },
      confirm: { status: 'CONFIRMED', holdExpiresAt: null },
      settle: { status: 'COMPLETED', ...(typeof b.paymentMethod === 'string' ? { paymentMethod: b.paymentMethod } : {}) },
    };
    const f = ACTIONS[tail[0]!];
    if (f) return { kind: 'merge', id, fields: f };
  }
  if ((item.method === 'PATCH' || item.method === 'PUT') && (tail.length === 0 || (tail.length === 1 && tail[0] === 'status')) && isPlain(item.body)) {
    const fields = Object.fromEntries(Object.entries(item.body).filter(([, v]) => isValue(v)));
    return Object.keys(fields).length ? { kind: 'merge', id, fields } : null;
  }
  return null;
}

function walk(v: unknown, op: Op): unknown {
  if (Array.isArray(v)) {
    let changed = false;
    const out: unknown[] = [];
    for (const x of v) {
      if (op.kind === 'remove' && isPlain(x) && x.id === op.id) {
        changed = true;
        continue;
      }
      const y = walk(x, op);
      if (y !== x) changed = true;
      out.push(y);
    }
    return changed ? out : v;
  }
  if (!isPlain(v)) return v;
  let next: Record<string, unknown> | null = null;
  if (op.kind === 'merge' && (v.id === op.id || v.roomId === op.id)) {
    for (const [k, val] of Object.entries(op.fields)) {
      // Only fields the object already has; `roomId` matches touch room fields (hkStatus) only.
      if (k in v && v[k] !== val && (v.id === op.id || k === 'hkStatus')) {
        next ??= { ...v };
        next[k] = val;
      }
    }
    if (next) next.__offline = true;
  }
  for (const [k, child] of Object.entries(v)) {
    if (child && typeof child === 'object') {
      const c = walk(child, op);
      if (c !== child) {
        next ??= { ...v };
        next[k] = c;
      }
    }
  }
  return next ?? v;
}

export function applyOps<T>(data: T, items: Pick<OutboxItem, 'method' | 'path' | 'body' | 'form' | 'status'>[]): T {
  let out: unknown = data;
  for (const it of items) {
    if (it.status === 'failed') continue;
    const op = opFor(it);
    if (op) out = walk(out, op);
  }
  return out as T;
}
