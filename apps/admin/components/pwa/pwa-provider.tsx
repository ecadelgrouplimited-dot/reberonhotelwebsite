'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MeDTO } from '@reberon/contracts';
import { get, post } from '@/lib/api';
import { metaGet, metaSet, idbClear, type OutboxItem } from '@/lib/offline/idb';
import { discard as discardItem, listOutbox, onOutbox, retry as retryItem, syncNow } from '@/lib/offline/outbox';
import { applyOps } from '@/lib/offline/optimistic';
import { NAV } from '@/components/shell/nav';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type WarmState = { running: boolean; done: number; total: number; step: string; lastAt: number | null };

interface PwaState {
  online: boolean;
  syncing: boolean;
  items: OutboxItem[];
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  savedCopyAt: string | null;
  swReady: boolean;
  updateReady: boolean;
  installable: boolean;
  installed: boolean;
  isIos: boolean;
  push: { supported: boolean; permission: NotificationPermission | 'unsupported'; subscribed: boolean };
  storage: { usage: number; quota: number; persisted: boolean } | null;
  warm: WarmState;
  /** When the worker last refreshed every screen's data in the background. */
  dataAt: number | null;
  centerOpen: boolean;
  setCenterOpen: (v: boolean) => void;
  sync: () => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  applyUpdate: () => void;
  install: () => Promise<void>;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
  testPush: () => Promise<void>;
  requestPersist: () => Promise<void>;
  downloadForOffline: (opts?: { includeBookings?: boolean; quiet?: boolean }) => Promise<void>;
  clearOfflineData: () => Promise<void>;
}

const Ctx = createContext<PwaState | null>(null);
export const usePwa = () => useContext(Ctx);

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
const APP_ROUTES: string[] = JSON.parse(process.env.NEXT_PUBLIC_APP_ROUTES ?? '["/"]');
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000000';
const inFrame = () => typeof window !== 'undefined' && window.self !== window.top;
const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function PwaProvider({ me, children }: { me: MeDTO | undefined; children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [savedCopyAt, setSavedCopyAt] = useState<string | null>(null);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [push, setPush] = useState<PwaState['push']>({ supported: false, permission: 'unsupported', subscribed: false });
  const [storage, setStorage] = useState<PwaState['storage']>(null);
  const [warm, setWarm] = useState<WarmState>({ running: false, done: 0, total: 0, step: '', lastAt: null });
  const [centerOpen, setCenterOpen] = useState(false);
  const [dataAt, setDataAt] = useState<number | null>(null);
  const warmRun = useRef(false);
  const embedded = inFrame();

  const refreshItems = useCallback(async () => {
    try {
      setItems(await listOutbox());
      setLastSyncAt(await metaGet<number>('lastSyncAt'));
    } catch {
      /* private mode without IndexedDB */
    }
  }, []);

  /* ── service worker ── */
  useEffect(() => {
    if (embedded || !('serviceWorker' in navigator)) return;
    const allowDev = process.env.NODE_ENV === 'production' || localStorage.getItem('rb-sw-dev') === '1';
    if (!allowDev) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(VERSION)}`, { scope: '/', updateViaCache: 'none' })
      .then((r) => {
        if (!alive) return;
        setReg(r);
        const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && setUpdateReady(true));
        if (r.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        r.addEventListener('updatefound', () => watch(r.installing));
        // Check for a new release every 30 minutes while open.
        timer = setInterval(() => r.update().catch(() => undefined), 30 * 60_000);
      })
      .catch((e) => console.warn('service worker', e));
    let reloading = false;
    const onCtl = () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') router.push(new URL(e.data.url).pathname);
      if (e.data?.type === 'push') {
        qc.invalidateQueries({ queryKey: ['live-console'] });
        qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    // Only reload for an update the person accepted.
    const accepted = () => sessionStorage.getItem('rb-sw-accept') === '1';
    const ctlHandler = () => accepted() && onCtl();
    navigator.serviceWorker.addEventListener('controllerchange', ctlHandler);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      navigator.serviceWorker.removeEventListener('message', onMsg);
      navigator.serviceWorker.removeEventListener('controllerchange', ctlHandler);
    };
  }, [embedded, qc, router]);

  /* ── connectivity: the browser's flag plus a real heartbeat ── */
  useEffect(() => {
    if (embedded) return;
    let stop = false;
    const ping = async () => {
      try {
        const r = await fetch(`/v1/health?t=${Date.now()}`, { cache: 'no-store' });
        if (!stop) setOnline(r.ok || r.status < 500);
      } catch {
        if (!stop) setOnline(false);
      }
    };
    const on = () => {
      setOnline(true);
      void ping();
    };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void ping();
    const t = setInterval(() => (document.visibilityState === 'visible' ? ping() : undefined), 20_000);
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [embedded]);

  /* ── outbox ── */
  useEffect(() => {
    if (embedded) return;
    void refreshItems();
    const handle = (msg: { type: string; [k: string]: unknown }) => {
      if (msg.type === 'sync-start') setSyncing(true);
      if (msg.type === 'sync-done') {
        setSyncing(false);
        const done = Number(msg.done ?? 0);
        if (done > 0) {
          toast.success(`Synced ${done} change${done === 1 ? '' : 's'} made offline`);
          void qc.invalidateQueries();
        }
      }
      if (msg.type === 'item-failed') {
        toast.error(`“${String(msg.label)}” could not be saved: ${String(msg.error ?? 'the server refused it')}`, { action: { label: 'Review', onClick: () => setCenterOpen(true) }, duration: 12_000 });
      }
      if (msg.type === 'auth-required') toast.warning('Sign in again to finish syncing your offline changes.', { action: { label: 'Sign in', onClick: () => (location.href = '/login?expired=1') } });
      void refreshItems();
    };
    const off = onOutbox(handle);
    const local = (e: Event) => handle((e as CustomEvent).detail);
    window.addEventListener('rb:outbox', local);
    const saved = (e: Event) => setSavedCopyAt((e as CustomEvent<string | null>).detail);
    // Show an offline edit everywhere on screen at once.
    const queuedHere = (e: Event) => {
      const item = (e as CustomEvent<OutboxItem>).detail;
      qc.setQueriesData({}, (old: unknown) => (old === undefined ? old : applyOps(old, [item])));
    };
    window.addEventListener('rb:offline-queued', queuedHere);
    window.addEventListener('rb:saved-copy', saved);
    return () => {
      off();
      window.removeEventListener('rb:outbox', local);
      window.removeEventListener('rb:saved-copy', saved);
      window.removeEventListener('rb:offline-queued', queuedHere);
    };
  }, [embedded, qc, refreshItems]);

  // Back online → replay, then refresh what's on screen.
  const pending = items.filter((i) => i.status !== 'failed').length;
  useEffect(() => {
    if (embedded || !online) return;
    if (pending > 0) void syncNow();
    void qc.invalidateQueries({ refetchType: 'active' });
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── who is signed in on this device ── */
  useEffect(() => {
    if (embedded || !me) return;
    (async () => {
      const prev = await metaGet<{ id: string }>('me').catch(() => null);
      if (prev && prev.id !== me.id) {
        // Another person used this device: their saved screens are not for this person.
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_DATA' });
      }
      await metaSet('me', { id: me.id, name: me.name }).catch(() => undefined);
      await metaSet('userId', me.id).catch(() => undefined);
      setWarm((w) => ({ ...w, lastAt: w.lastAt }));
      const lastAt = await metaGet<number>(`warm:${me.id}`).catch(() => null);
      setWarm((w) => ({ ...w, lastAt }));
      setDataAt(await metaGet<number>('dataRefreshedAt').catch(() => null));
    })();
  }, [embedded, me]);

  /* ── install ── */
  useEffect(() => {
    if (embedded) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBip(null);
      toast.success('The House is installed. Open it from your home screen or dock — it works offline.');
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [embedded]);

  /* ── push & storage state ── */
  const readPush = useCallback(async () => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) return setPush({ supported: false, permission: 'unsupported', subscribed: false });
    const r = await navigator.serviceWorker.getRegistration();
    const sub = await r?.pushManager.getSubscription();
    setPush({ supported, permission: Notification.permission, subscribed: !!sub });
  }, []);
  const readStorage = useCallback(async () => {
    if (!navigator.storage?.estimate) return;
    const e = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted });
  }, []);
  useEffect(() => {
    if (embedded) return;
    void readPush();
    void readStorage();
  }, [embedded, reg, readPush, readStorage]);

  // Clear the dock / home-screen badge whenever the app is looked at.
  useEffect(() => {
    if (embedded) return;
    const clear = () => {
      if (document.visibilityState !== 'visible') return;
      (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => undefined);
      void metaSet('badge', 0).catch(() => undefined);
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, [embedded]);

  /* ── actions ── */
  const enablePush = useCallback(async () => {
    try {
      const r = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Notifications are blocked for this site. Allow them in the browser’s site settings.');
        await readPush();
        return false;
      }
      const { publicKey } = await get<{ publicKey: string }>('/push/public-key');
      const sub = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      await post('/push/subscribe', sub.toJSON());
      // Installed Chrome apps can also refresh data in the background.
      const ps = (r as ServiceWorkerRegistration & { periodicSync?: { register: (t: string, o: { minInterval: number }) => Promise<void> } }).periodicSync;
      await ps?.register('rb-refresh', { minInterval: 30 * 60_000 }).catch(() => undefined);
      await readPush();
      toast.success('Notifications are on for this device');
      return true;
    } catch (e) {
      toast.error(`Could not turn on notifications: ${(e as Error).message}`);
      await readPush();
      return false;
    }
  }, [readPush]);

  const disablePush = useCallback(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    const sub = await r?.pushManager.getSubscription();
    if (sub) {
      await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
    await readPush();
    toast.success('Notifications are off for this device');
  }, [readPush]);

  const testPush = useCallback(async () => {
    const r = await post<{ sent: number; failed: number }>('/push/test');
    if (r.sent) toast.success('Test notification sent — it should appear in a moment');
    else toast.error('No device received it. Turn notifications off and on again.');
  }, []);

  const requestPersist = useCallback(async () => {
    const ok = await navigator.storage?.persist?.();
    toast[ok ? 'success' : 'info'](ok ? 'This device will keep the offline copy even when space is low' : 'The browser decides — installing the app usually allows it');
    await readStorage();
  }, [readStorage]);

  const applyUpdate = useCallback(() => {
    sessionStorage.setItem('rb-sw-accept', '1');
    if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  }, [reg]);

  const install = useCallback(async () => {
    if (!bip) return;
    await bip.prompt();
    const choice = await bip.userChoice;
    if (choice.outcome === 'accepted') setBip(null);
  }, [bip]);

  /** Ask the worker to save every screen's page and code (fast, no rendering). */
  const precacheScreens = useCallback((withData: boolean) => {
    const ctl = navigator.serviceWorker?.controller;
    if (!ctl) return false;
    ctl.postMessage({ type: 'PRECACHE_ALL', routes: APP_ROUTES, withData });
    return true;
  }, []);

  /**
   * Load every screen this person can use once in hidden frames (two at a time,
   * each until its network goes quiet) so the data behind it is saved too.
   */
  const warmData = useCallback(async (onStep: (done: number, total: number, step: string) => void) => {
    if (!me) return 0;
    const routes = APP_ROUTES.filter((r) => !r.includes(TEMPLATE_ID)).filter((r) => {
      const item = NAV.flatMap((g) => g.items).find((i) => i.href.split('?')[0] === r);
      return !item?.perm || me.permissions.includes(item.perm);
    });
    let done = 0;
    const one = (frame: HTMLIFrameElement, href: string) =>
      new Promise<void>((resolve) => {
        const hard = setTimeout(resolve, 20_000);
        frame.onload = () => {
          // Wait until the screen has stopped asking for data for ~1.2 s.
          let last = -1;
          let still = 0;
          const tick = setInterval(() => {
            let n = 0;
            try {
              n = frame.contentWindow?.performance.getEntriesByType('resource').length ?? 0;
            } catch {
              n = last;
            }
            still = n === last ? still + 1 : 0;
            last = n;
            if (still >= 3) {
              clearInterval(tick);
              clearTimeout(hard);
              resolve();
            }
          }, 400);
        };
        frame.src = href;
      });
    const frames = [0, 1].map(() => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed;width:1280px;height:800px;left:-99999px;top:0;opacity:0;pointer-events:none;border:0';
      document.body.appendChild(f);
      return f;
    });
    const queue = [...routes];
    try {
      await Promise.all(
        frames.map(async (f) => {
          while (queue.length) {
            const href = queue.shift()!;
            onStep(done, routes.length, href === '/' ? 'Today' : href);
            await one(f, href);
            done += 1;
            onStep(done, routes.length, href);
          }
        }),
      );
    } finally {
      frames.forEach((f) => f.remove());
    }
    return routes.length;
  }, [me]);

  /** Everything: every screen's page and code, the data behind each, and the next bookings. */
  const downloadForOffline = useCallback(
    async (opts?: { includeBookings?: boolean; quiet?: boolean }) => {
      if (warmRun.current || !me) return;
      if (!navigator.serviceWorker?.controller) {
        if (!opts?.quiet) toast.info('Offline mode is getting ready — reload the page once, then try again.');
        return;
      }
      warmRun.current = true;
      try {
        setWarm((w) => ({ ...w, running: true, done: 0, total: APP_ROUTES.length, step: 'Saving every screen' }));
        precacheScreens(false);
        const screens = await warmData((done, total, step) => setWarm((w) => ({ ...w, running: true, done, total, step })));
        let bookings: string[] = [];
        if (opts?.includeBookings !== false && me.permissions.includes('bookings:read')) {
          setWarm((w) => ({ ...w, step: 'Saving bookings' }));
          try {
            const [up, inHouse] = await Promise.all([
              get<{ data: { id: string }[] }>('/reservations?status=upcoming&sort=arrival_asc'),
              get<{ data: { id: string }[] }>('/reservations?status=IN_HOUSE'),
            ]);
            bookings = [...new Set([...inHouse.data.map((r) => r.id), ...up.data.slice(0, 60).map((r) => r.id)])];
            setWarm((w) => ({ ...w, done: 0, total: bookings.length }));
            let n = 0;
            for (const id of bookings) {
              await Promise.all([get(`/reservations/${id}`).catch(() => undefined), get(`/desk/reservations/${id}/rooms`).catch(() => undefined)]);
              n += 1;
              setWarm((w) => ({ ...w, done: n }));
            }
          } catch {
            /* screens are saved; bookings will follow next time */
          }
        }
        const at = Date.now();
        await metaSet(`warm:${me.id}`, at);
        setWarm({ running: false, done: 0, total: 0, step: '', lastAt: at });
        if (!opts?.quiet) toast.success(`Every screen is saved for offline use (${screens} screens${bookings.length ? `, ${bookings.length} bookings` : ''})`);
        await readStorage();
      } finally {
        warmRun.current = false;
        setWarm((w) => ({ ...w, running: false }));
      }
    },
    [me, precacheScreens, warmData, readStorage],
  );

  // Worker progress (saving pages and code).
  useEffect(() => {
    if (embedded) return;
    return onOutbox((msg) => {
      if (msg.type === 'precache-done' && msg.signedOut) console.warn('offline: some screens need a signed-in session to save');
      if (msg.type === 'data-refreshed') setDataAt(Date.now());
    });
  }, [embedded]);

  // Automatic: on sign-in and on every new version, save every screen; the first time, the data too.
  useEffect(() => {
    if (embedded || !me || !online || !reg) return;
    if (localStorage.getItem('rb-auto-offline') === '0') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let cancelled = false;
    const t = setTimeout(async () => {
      // A brand-new install takes control a moment later (clients.claim) — wait for it.
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
          setTimeout(done, 15_000);
        });
      }
      if (cancelled || !navigator.serviceWorker.controller) return;
      const key = `precached:${VERSION}:${me.id}`;
      if (!(await metaGet<number>(key).catch(() => null))) {
        precacheScreens(true);
        await metaSet(key, Date.now()).catch(() => undefined);
      }
      const lastAt = await metaGet<number>(`warm:${me.id}`).catch(() => null);
      if (!cancelled && !conn?.saveData && (!lastAt || Date.now() - lastAt > 12 * 3600_000)) void downloadForOffline({ quiet: true });
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [embedded, me, online, reg]); // eslint-disable-line react-hooks/exhaustive-deps

  // While online: keep every known screen's data fresh in the background (every 15 minutes, and on reconnect).
  useEffect(() => {
    if (embedded || !online || !reg) return;
    const refresh = () => document.visibilityState === 'visible' && navigator.serviceWorker.controller?.postMessage({ type: 'REFRESH_DATA' });
    const first = setTimeout(refresh, 20_000);
    const t = setInterval(refresh, 15 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [embedded, online, reg]);

  const clearOfflineData = useCallback(async () => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_DATA' });
    await idbClear('outbox').catch(() => undefined);
    await refreshItems();
    await readStorage();
  }, [refreshItems, readStorage]);

  const value = useMemo<PwaState>(
    () => ({
      online,
      syncing,
      items,
      pending,
      failed: items.filter((i) => i.status === 'failed').length,
      lastSyncAt,
      savedCopyAt,
      swReady: !!reg,
      updateReady,
      installable: !!bip,
      installed,
      isIos: typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent),
      push,
      storage,
      warm,
      dataAt,
      centerOpen,
      setCenterOpen,
      sync: () => void syncNow(),
      retry: (id) => void retryItem(id),
      discard: (id) => void discardItem(id),
      applyUpdate,
      install,
      enablePush,
      disablePush,
      testPush,
      requestPersist,
      downloadForOffline,
      clearOfflineData,
    }),
    [online, syncing, items, pending, lastSyncAt, savedCopyAt, reg, updateReady, bip, installed, push, storage, warm, dataAt, centerOpen, applyUpdate, install, enablePush, disablePush, testPush, requestPersist, downloadForOffline, clearOfflineData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
