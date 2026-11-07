'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MeDTO } from '@reberon/contracts';
import { get, post } from '@/lib/api';
import { metaGet, metaSet, idbClear, type OutboxItem } from '@/lib/offline/idb';
import { discard as discardItem, listOutbox, onOutbox, retry as retryItem, syncNow } from '@/lib/offline/outbox';
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
    window.addEventListener('rb:saved-copy', saved);
    return () => {
      off();
      window.removeEventListener('rb:outbox', local);
      window.removeEventListener('rb:saved-copy', saved);
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

  /**
   * Open every screen this person can use once (hidden), so its code, page and
   * data are saved; then the next bookings and in-house stays.
   */
  const downloadForOffline = useCallback(
    async (opts?: { includeBookings?: boolean; quiet?: boolean }) => {
      if (warmRun.current || !me || !navigator.serviceWorker?.controller) {
        if (!navigator.serviceWorker?.controller && !opts?.quiet) toast.info('Offline mode is getting ready — reload the page once, then try again.');
        return;
      }
      warmRun.current = true;
      const routes = [...new Set(NAV.flatMap((g) => g.items).filter((i) => !i.later && (!i.perm || me.permissions.includes(i.perm))).map((i) => i.href.split('?')[0]!))];
      const extra = ['/reservations/new', '/reservations/new?walkin=1', '/account'];
      const list = [...routes, ...extra];
      let bookings: string[] = [];
      if (opts?.includeBookings && me.permissions.includes('bookings:read')) {
        try {
          const [up, inHouse] = await Promise.all([
            get<{ data: { id: string; arrival: string }[] }>('/reservations?status=upcoming&sort=arrival_asc'),
            get<{ data: { id: string }[] }>('/reservations?status=IN_HOUSE'),
          ]);
          bookings = [...inHouse.data.map((r) => r.id), ...up.data.slice(0, 40).map((r) => r.id)];
        } catch {
          /* keep going with screens only */
        }
      }
      const total = list.length + bookings.length;
      setWarm({ running: true, done: 0, total, step: 'Saving screens', lastAt: warm.lastAt });
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;width:1280px;height:800px;left:-99999px;top:0;opacity:0;pointer-events:none;border:0';
      document.body.appendChild(frame);
      let done = 0;
      try {
        for (const href of list) {
          setWarm((w) => ({ ...w, step: href === '/' ? 'Today' : href }));
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 15_000);
            frame.onload = () => setTimeout(() => { clearTimeout(t); resolve(); }, 2500);
            // Exact URL: the saved page must match what is opened later (the router state includes the query).
            frame.src = href;
          });
          done += 1;
          setWarm((w) => ({ ...w, done }));
        }
        if (bookings.length) {
          setWarm((w) => ({ ...w, step: 'Saving bookings' }));
          // One booking page through the frame loads its code; the rest are saved directly.
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 15_000);
            frame.onload = () => setTimeout(() => { clearTimeout(t); resolve(); }, 2500);
            frame.src = `/reservations/${bookings[0]}`;
          });
          navigator.serviceWorker.controller?.postMessage({ type: 'PRECACHE_PAGES', urls: bookings.map((id) => `/reservations/${id}`) });
          for (const id of bookings) {
            await get(`/reservations/${id}`).catch(() => undefined);
            done += 1;
            setWarm((w) => ({ ...w, done }));
          }
        }
        const at = Date.now();
        await metaSet(`warm:${me.id}`, at);
        setWarm({ running: false, done: total, total, step: '', lastAt: at });
        if (!opts?.quiet) toast.success(`Saved ${list.length} screens${bookings.length ? ` and ${bookings.length} bookings` : ''} for offline use`);
        await readStorage();
      } finally {
        frame.remove();
        warmRun.current = false;
        setWarm((w) => ({ ...w, running: false }));
      }
    },
    [me, readStorage, warm.lastAt],
  );

  // Keep an offline copy fresh: quietly re-save the screens twice a day.
  useEffect(() => {
    if (embedded || !me || !online || !reg) return;
    if (localStorage.getItem('rb-auto-offline') === '0') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const t = setTimeout(async () => {
      const lastAt = await metaGet<number>(`warm:${me.id}`).catch(() => null);
      if (!lastAt || Date.now() - lastAt > 12 * 3600_000) void downloadForOffline({ quiet: true });
    }, 45_000);
    return () => clearTimeout(t);
  }, [embedded, me, online, reg]); // eslint-disable-line react-hooks/exhaustive-deps

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
    [online, syncing, items, pending, lastSyncAt, savedCopyAt, reg, updateReady, bip, installed, push, storage, warm, centerOpen, applyUpdate, install, enablePush, disablePush, testPush, requestPersist, downloadForOffline, clearOfflineData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
