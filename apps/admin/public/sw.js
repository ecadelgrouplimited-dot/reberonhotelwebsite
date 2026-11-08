/* The House — service worker.
 *
 * Offline-first for the hotel's admin panel:
 *  - App shell & code:      cache-first (/_next/static is content-hashed)
 *  - Pages (HTML):          network-first with a short timeout, then the saved copy
 *  - Router (RSC) fetches:  network-only; when that fails Next falls back to a full
 *                           page load, which the page cache then answers
 *  - API reads (GET):       network-first, saved per signed-in person, marked with
 *                           x-rb-cache when served from the device
 *  - API writes:            never touched here — the page queues them in IndexedDB
 *                           (the outbox) and this worker replays them on reconnect,
 *                           even with the app closed (Background Sync)
 *  - Web Push:              system notifications that open the right screen
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const STATIC = `rb-static-${VERSION}`;
const PAGES = 'rb-pages-v1';
const API = 'rb-api-v1';
const ASSETS = 'rb-assets-v1';
const KEEP = [STATIC, PAGES, API, ASSETS];
const NAV_TIMEOUT = 3500;
const API_TIMEOUT = 6000;
const CORE = ['/', '/manifest.webmanifest', '/pwa/maskable-192.png', '/pwa/badge-96.png', '/pwa/notify-192.png', '/icon.svg', '/favicon.ico'];
const NEVER_CACHE_API = /^\/v1\/admin\/(auth\/(login|refresh|logout)|push\/|.*\.csv$|.*\/export)/;

/* ───────── lifecycle ───────── */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { credentials: 'include' })).catch(() => undefined)))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('rb-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await self.clients.claim();
      broadcast({ type: 'sw-activated', version: VERSION });
      // New release: save every screen again in the background (needs a signed-in cookie; skipped otherwise).
      const routes = await metaGet('routes');
      if (Array.isArray(routes) && routes.length) precacheAll(routes).catch(() => undefined);
    })(),
  );
});

/* ───────── fetch routing ───────── */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // writes go to the network; the page owns the outbox
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith('/v1/admin/')) {
    if (NEVER_CACHE_API.test(url.pathname)) return;
    return event.respondWith(apiNetworkFirst(event, req));
  }
  if (url.pathname.startsWith('/v1/')) return;
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return; // let Next fall back to a full navigation
  if (req.mode === 'navigate') return event.respondWith(page(event, req));
  if (/\.(png|svg|ico|webp|jpg|jpeg|woff2?|webmanifest)$/.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    return event.respondWith(staleWhileRevalidate(event, req, ASSETS));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return (await fresh) || new Response('', { status: 504 });
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

/** Strip router noise so one page = one cache entry. */
function pageKey(url) {
  const u = new URL(url);
  u.searchParams.delete('_rsc');
  u.searchParams.delete('__warm');
  u.hash = '';
  return u.toString();
}

async function page(event, req) {
  const cache = await caches.open(PAGES);
  const key = pageKey(req.url);
  const network = (async () => {
    const preload = await event.preloadResponse;
    const res = preload || (await fetch(req));
    // A redirect to /login means the session ended; never save that as the page.
    if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(key, res.clone());
      await trim(PAGES, 250);
    }
    return res;
  })();
  event.waitUntil(network.catch(() => undefined));
  const res = await withTimeout(network, NAV_TIMEOUT);
  if (res) return res;
  const hit = (await cache.match(key)) || (await cache.match(key, { ignoreSearch: true }));
  if (hit) return hit;
  const tpl = await fromTemplate(cache, req.url);
  if (tpl) return tpl;
  // Slow but alive: keep waiting for the real page rather than show the offline card.
  const late = await network.catch(() => null);
  if (late) return late;
  return offlinePage(new URL(req.url).pathname);
}

async function apiNetworkFirst(event, req) {
  const cache = await caches.open(API);
  const scope = (await metaGet('userId')) || 'anon';
  const key = `${self.location.origin}/__rb/${scope}${new URL(req.url).pathname}${new URL(req.url).search}`;
  event.waitUntil(remember(event.clientId, new URL(req.url)).catch(() => undefined));
  const network = (async () => {
    const res = await fetch(req);
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const copy = new Response(await res.clone().blob(), { status: res.status, headers: { 'content-type': 'application/json', 'x-rb-saved-at': new Date().toISOString() } });
      await cache.put(key, copy);
      await trim(API, 1200);
    }
    return res;
  })();
  event.waitUntil(network.catch(() => undefined));
  const res = await withTimeout(network, API_TIMEOUT);
  if (res && (res.ok || res.status < 500)) return res;
  const hit = (await cache.match(key)) || (await newestSamePath(cache, key));
  if (hit) {
    const h = new Headers(hit.headers);
    h.set('x-rb-cache', hit.headers.get('x-rb-saved-at') || 'unknown');
    return new Response(await hit.blob(), { status: 200, headers: h });
  }
  if (res) return res;
  const late = await network.catch(() => null);
  if (late) return late;
  return new Response(JSON.stringify({ status: 503, code: 'OFFLINE_NO_DATA', detail: 'You are offline and this has not been saved on this device yet. Open it once while online, or use “Download for offline”.' }), { status: 503, headers: { 'content-type': 'application/json', 'x-rb-cache': 'none' } });
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

function offlinePage(path) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · The House</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#F4F5F7;color:#1A1E43}@media(prefers-color-scheme:dark){body{background:#0B0E22;color:#F4F5F7}}main{max-width:26rem;padding:2rem;text-align:center}img{width:64px;height:64px;border-radius:16px}h1{font-size:1.25rem;margin:1rem 0 .5rem}p{opacity:.75}a,button{display:inline-block;margin:.5rem .25rem 0;padding:.6rem 1.1rem;border-radius:999px;border:0;background:#E88432;color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}a.ghost{background:transparent;color:inherit;border:1px solid currentColor;opacity:.8}</style></head>
<body><main><img src="/pwa/maskable-192.png" alt=""><h1>This page isn’t saved offline yet</h1><p><code>${path.replace(/[<>&"]/g, '')}</code> hasn’t been opened on this device while online. Everything you have opened before still works, and changes you make are kept and synced when the connection returns.</p><a href="/">Go to Today</a><a class="ghost" href="/desk">Front desk</a><button onclick="location.reload()">Try again</button></main></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/* ───────── every screen offline ───────── */

const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{20,}|\d+)$/i;
const segs = (u) => new URL(u, self.location.origin).pathname.split('/').filter(Boolean);
const pattern = (path) => '/' + path.split('/').filter(Boolean).map((x) => (ID_LIKE.test(x) ? ':id' : x)).join('/');

/**
 * A detail page (/reservations/<id>) that was never opened: take any saved page of the
 * same shape (a template is saved for every detail route) and swap the id everywhere in
 * it, so the server-rendered HTML and the router agree on which record this is.
 */
async function fromTemplate(cache, url) {
  const want = segs(url);
  if (!want.some((x) => ID_LIKE.test(x))) return null;
  const keys = await cache.keys();
  let best = null;
  for (const k of keys) {
    const have = segs(k.url);
    if (have.length !== want.length) continue;
    let ok = true;
    const swaps = [];
    for (let i = 0; i < want.length; i++) {
      if (have[i] === want[i]) continue;
      if (ID_LIKE.test(have[i]) && ID_LIKE.test(want[i])) swaps.push([have[i], want[i]]);
      else { ok = false; break; }
    }
    if (!ok || !swaps.length) continue;
    best = { k, swaps };
    if (have.some((x) => x.startsWith('00000000-'))) break; // prefer the clean template
  }
  if (!best) return null;
  const res = await cache.match(best.k);
  if (!res) return null;
  let html = await res.text();
  for (const [from, to] of best.swaps) html = html.split(from).join(to);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-rb-template': '1' } });
}

/** The desk asks for today's date; offline tomorrow, yesterday's copy of the same screen beats nothing. */
async function newestSamePath(cache, key) {
  const path = key.split('?')[0];
  let best = null;
  let bestAt = 0;
  for (const k of await cache.keys()) {
    if (k.url.split('?')[0] !== path) continue;
    const r = await cache.match(k);
    const at = Date.parse((r && r.headers.get('x-rb-saved-at')) || '') || 0;
    if (r && at >= bestAt) { best = r; bestAt = at; }
  }
  return best;
}

/** Which API reads each screen makes — so the worker can refresh them without opening the screen. */
let apimap = null;
let apimapDirty = false;
async function remember(clientId, apiUrl) {
  if (!clientId) return;
  const client = await self.clients.get(clientId);
  if (!client) return;
  const screen = pattern(new URL(client.url).pathname);
  apimap ??= (await metaGet('apimap')) || {};
  const list = (apimap[screen] ??= []);
  const u = apiUrl.pathname + apiUrl.search;
  if (list.includes(u)) return;
  list.push(u);
  if (list.length > 40) list.shift();
  if (!apimapDirty) {
    apimapDirty = true;
    setTimeout(() => { apimapDirty = false; metaPut('apimap', apimap); }, 3000);
  }
}

let refreshing = null;
/** Re-download every API read the screens are known to make (newest first, max 400). */
function refreshData() {
  refreshing ??= (async () => {
    const map = apimap || (await metaGet('apimap')) || {};
    const scope = (await metaGet('userId')) || 'anon';
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const urls = [...new Set(Object.values(map).flat())]
      // a dated read is refreshed for today, not the day it was first seen
      .map((u) => u.replace(/([?&](?:date|day)=)\d{4}-\d{2}-\d{2}/, `$1${today}`))
      .slice(-400);
    const cache = await caches.open(API);
    let n = 0;
    await pool(urls, 4, async (u) => {
      try {
        const res = await fetch(u, { credentials: 'include', headers: { 'x-reberon-client': 'admin' } });
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          await cache.put(`${self.location.origin}/__rb/${scope}${u}`, new Response(await res.blob(), { headers: { 'content-type': 'application/json', 'x-rb-saved-at': new Date().toISOString() } }));
          n += 1;
        }
      } catch {}
    });
    await metaPut('dataRefreshedAt', Date.now());
    broadcast({ type: 'data-refreshed', count: n, total: urls.length });
    return n;
  })().finally(() => (refreshing = null));
  return refreshing;
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

let precaching = null;
/**
 * Save every screen of the app: its HTML and every code file it references.
 * Detail routes are saved once with a placeholder id and used as templates.
 */
function precacheAll(routes) {
  precaching ??= (async () => {
    const pages = await caches.open(PAGES);
    const statics = await caches.open(STATIC);
    const assets = new Set();
    let done = 0;
    let saved = 0;
    let signedOut = false;
    broadcast({ type: 'precache-start', total: routes.length });
    await pool(routes, 4, async (r) => {
      try {
        const res = await fetch(r, { credentials: 'include', headers: { accept: 'text/html' } });
        if (res.redirected || new URL(res.url).pathname.startsWith('/login')) signedOut = true;
        else if (res.ok) {
          const html = await res.clone().text();
          await pages.put(pageKey(new URL(r, self.location.origin).toString()), res);
          for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) assets.add(m[0]);
          saved += 1;
        }
      } catch {}
      done += 1;
      broadcast({ type: 'precache-progress', done, total: routes.length, phase: 'screens' });
    });
    const missing = [];
    for (const a of assets) if (!(await statics.match(a))) missing.push(a);
    let got = 0;
    await pool(missing, 6, async (a) => {
      try {
        const res = await fetch(a);
        if (res.ok) await statics.put(a, res);
      } catch {}
      got += 1;
      if (got % 10 === 0 || got === missing.length) broadcast({ type: 'precache-progress', done: got, total: missing.length, phase: 'code' });
    });
    await metaPut('precachedAt', Date.now());
    await metaPut('precachedVersion', VERSION);
    broadcast({ type: 'precache-done', saved, total: routes.length, assets: assets.size, signedOut });
    return { saved, signedOut };
  })().finally(() => (precaching = null));
  return precaching;
}

/* ───────── IndexedDB (shared schema with lib/offline/idb.ts) ───────── */

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('rb-offline', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => (out = v));
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}
const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
async function metaGet(key) {
  try {
    const row = await tx('meta', 'readonly', (s) => req2p(s.get(key)));
    return row ? row.value : null;
  } catch {
    return null;
  }
}
const allOutbox = () => tx('outbox', 'readonly', (s) => req2p(s.getAll()));
const putOutbox = (item) => tx('outbox', 'readwrite', (s) => req2p(s.put(item)));
const deleteOutbox = (id) => tx('outbox', 'readwrite', (s) => req2p(s.delete(id)));

/** Take an item for sending; another tab or the worker may already hold it. */
async function claim(id) {
  return tx('outbox', 'readwrite', async (s) => {
    const it = await req2p(s.get(id));
    if (!it || it.status === 'failed') return null;
    if (it.status === 'syncing' && Date.now() - (it.claimedAt || 0) < 60_000) return null;
    it.status = 'syncing';
    it.claimedAt = Date.now();
    await req2p(s.put(it));
    return it;
  });
}

/* ───────── outbox replay ───────── */

const channel = new BroadcastChannel('rb-outbox');
function broadcast(msg) {
  try { channel.postMessage(msg); } catch {}
}

let replaying = null;
function replay() {
  replaying ??= (async () => {
    const me = await metaGet('userId');
    const items = ((await allOutbox()) || []).filter((i) => i.status !== 'failed' && (!i.userId || !me || i.userId === me)).sort((a, b) => a.createdAt - b.createdAt);
    if (!items.length) return { done: 0, failed: 0, left: 0 };
    broadcast({ type: 'sync-start', total: items.length });
    let done = 0;
    let failed = 0;
    let stopped = false;
    for (const raw of items) {
      const it = await claim(raw.id);
      if (!it) continue;
      let res;
      try {
        res = await send(it);
        if (res.status === 401) {
          const r = await fetch('/v1/admin/auth/refresh', { method: 'POST', headers: { 'x-reberon-client': 'admin' }, credentials: 'include' });
          if (!r.ok) {
            await putOutbox({ ...it, status: 'pending', error: 'Sign in again to finish syncing' });
            broadcast({ type: 'auth-required' });
            stopped = true;
            break;
          }
          res = await send(it);
        }
      } catch {
        await putOutbox({ ...it, status: 'pending', attempts: (it.attempts || 0) + 1 });
        stopped = true; // still offline
        break;
      }
      if (res.ok) {
        await deleteOutbox(it.id);
        done += 1;
        broadcast({ type: 'item-synced', id: it.id, label: it.label });
      } else {
        const body = await res.json().catch(() => ({}));
        const msg = body.detail || body.message || `Server said ${res.status}`;
        if (res.status >= 500 || res.status === 429 || res.status === 408) {
          await putOutbox({ ...it, status: 'pending', attempts: (it.attempts || 0) + 1, error: msg });
          stopped = true;
          break;
        }
        await putOutbox({ ...it, status: 'failed', attempts: (it.attempts || 0) + 1, error: msg, failedAt: Date.now() });
        failed += 1;
        broadcast({ type: 'item-failed', id: it.id, label: it.label, error: msg });
      }
    }
    const left = ((await allOutbox()) || []).filter((i) => i.status !== 'failed').length;
    broadcast({ type: 'sync-done', done, failed, left, stopped });
    if (done) await metaPut('lastSyncAt', Date.now());
    return { done, failed, left };
  })().finally(() => (replaying = null));
  return replaying;
}
const metaPut = (key, value) => tx('meta', 'readwrite', (s) => req2p(s.put({ key, value }))).catch(() => undefined);

function send(it) {
  const headers = { 'x-reberon-client': 'admin', 'idempotency-key': it.id, 'x-offline-queued-at': new Date(it.createdAt).toISOString() };
  let body;
  if (it.form) {
    const fd = new FormData();
    for (const [k, v, name] of it.form) name ? fd.append(k, v, name) : fd.append(k, v);
    body = fd;
  } else if (it.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(it.body);
  }
  return fetch(`/v1/admin${it.path}`, { method: it.method, headers, body, credentials: 'include' });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'rb-outbox') event.waitUntil(replay());
});

/* Installed app, Chrome: refresh the essentials in the background so the morning opens fresh. */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'rb-refresh') return;
  event.waitUntil(
    (async () => {
      await replay().catch(() => undefined);
      await refreshData();
    })(),
  );
});

/* ───────── messages from pages ───────── */

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const reply = (data) => event.source && event.source.postMessage(data);
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'SYNC_NOW') event.waitUntil(replay());
  if (msg.type === 'PRECACHE_ALL' && Array.isArray(msg.routes)) {
    event.waitUntil(metaPut('routes', msg.routes).then(() => precacheAll(msg.routes)).then(() => (msg.withData ? refreshData() : undefined)));
  }
  if (msg.type === 'REFRESH_DATA') event.waitUntil(refreshData());
  if (msg.type === 'CLEAR_USER_DATA') {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(PAGES)]).then(() => reply({ type: 'cleared' })));
  }
  if (msg.type === 'PRECACHE_PAGES' && Array.isArray(msg.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PAGES);
        let n = 0;
        for (const u of msg.urls) {
          try {
            const res = await fetch(u, { credentials: 'include', headers: { accept: 'text/html' } });
            if (res.ok && !res.redirected) await cache.put(pageKey(new URL(u, self.location.origin).toString()), res);
          } catch {}
          n += 1;
          broadcast({ type: 'precache-progress', done: n, total: msg.urls.length });
        }
      })(),
    );
  }
});

/* ───────── Web Push ───────── */

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { title: 'The House', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.some((c) => c.visibilityState === 'visible' && c.focused);
      windows.forEach((c) => c.postMessage({ type: 'push', payload: p }));
      if (navigator.setAppBadge) {
        const n = ((await metaGet('badge')) || 0) + 1;
        await metaPut('badge', n);
        navigator.setAppBadge(n).catch(() => undefined);
      }
      // Someone is looking at the app: the in-app pop-up and chime already cover it.
      if (visible && p.urgency !== 'CRITICAL') return;
      await self.registration.showNotification(p.title || 'The House', {
        body: p.body || '',
        icon: '/pwa/notify-192.png',
        badge: '/pwa/badge-96.png',
        tag: p.tag,
        renotify: !!p.tag,
        requireInteraction: p.urgency === 'CRITICAL',
        vibrate: p.urgency === 'CRITICAL' ? [200, 80, 200, 80, 400] : [120, 60, 120],
        timestamp: p.ts ? Date.parse(p.ts) : Date.now(),
        data: { url: p.url || '/' },
        actions: [{ action: 'open', title: 'Open' }, { action: 'dismiss', title: 'Dismiss' }],
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      await metaPut('badge', 0);
      if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => undefined);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const mine = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (mine) {
        await mine.focus();
        if ('navigate' in mine) return mine.navigate(target).catch(() => mine.postMessage({ type: 'navigate', url: target }));
        return mine.postMessage({ type: 'navigate', url: target });
      }
      return self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const key = await fetch('/v1/admin/push/public-key', { credentials: 'include' }).then((r) => r.json()).catch(() => null);
      if (!key || !key.publicKey) return;
      const pad = '='.repeat((4 - (key.publicKey.length % 4)) % 4);
      const raw = atob((key.publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await fetch('/v1/admin/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-reberon-client': 'admin' }, body: JSON.stringify(sub.toJSON()) });
    })(),
  );
});
