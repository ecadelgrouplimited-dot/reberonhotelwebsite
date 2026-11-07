'use client';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Download,
  HardDrive,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  Share,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { usePwa } from './pwa-provider';

const since = (t: number | string | null | undefined) => {
  if (!t) return 'never';
  const ms = Date.now() - (typeof t === 'number' ? t : Date.parse(t));
  if (Number.isNaN(ms)) return 'earlier';
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)} h ago`;
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const mb = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);

/** Header pill: online / offline / syncing / changes waiting. Opens the Sync Center. */
export function ConnectionPill() {
  const pwa = usePwa();
  if (!pwa) return null;
  const { online, syncing, pending, failed, setCenterOpen, updateReady } = pwa;
  const tone = !online ? 'off' : failed ? 'bad' : syncing || pending ? 'busy' : 'ok';
  return (
    <button
      type="button"
      onClick={() => setCenterOpen(true)}
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition',
        tone === 'off' && 'border-warning/40 bg-warning/10 text-warning',
        tone === 'bad' && 'border-danger/40 bg-danger/10 text-danger',
        tone === 'busy' && 'border-info/30 bg-info/10 text-info',
        tone === 'ok' && 'border-line bg-surface text-fg-muted hover:border-line-strong',
      )}
      title="Offline & sync"
      aria-label={`Connection: ${online ? 'online' : 'offline'}${pending ? `, ${pending} changes waiting to sync` : ''}`}
    >
      {tone === 'off' ? <CloudOff className="size-3.5" /> : syncing ? <Loader2 className="size-3.5 animate-spin" /> : tone === 'bad' ? <AlertTriangle className="size-3.5" /> : pending ? <CloudUpload className="size-3.5" /> : <Wifi className="size-3.5" />}
      <span className="hidden md:inline">{!online ? 'Offline' : syncing ? 'Syncing' : failed ? `${failed} not saved` : pending ? `${pending} to sync` : 'Online'}</span>
      {!online && pending > 0 && <span className="rounded-full bg-warning px-1.5 text-[10px] text-white">{pending}</span>}
      {updateReady && <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-bg bg-brand" aria-label="Update ready" />}
    </button>
  );
}

/** A calm strip under the header while offline or showing saved data. */
export function OfflineBanner() {
  const pwa = usePwa();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!pwa) return null;
  const { online, pending, savedCopyAt, setCenterOpen } = pwa;
  if (online && !savedCopyAt) return null;
  return (
    <div className={cn('no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-[12.5px] sm:px-6', online ? 'border-info/20 bg-info/5 text-info' : 'border-warning/30 bg-warning/10 text-fg')}>
      <CloudOff className={cn('size-4', online ? 'text-info' : 'text-warning')} />
      {online ? (
        <span>The connection is slow — showing what this device saved <b>{since(savedCopyAt)}</b> while it catches up.</span>
      ) : (
        <span>
          <b>You’re offline.</b> Keep working — screens show what was saved{savedCopyAt ? ` (${since(savedCopyAt)})` : ''}, and every change is kept on this device and synced automatically.
          {pending > 0 && <> <b>{pending}</b> change{pending === 1 ? '' : 's'} waiting.</>}
        </span>
      )}
      <button type="button" className="ml-auto font-semibold underline-offset-2 hover:underline" onClick={() => setCenterOpen(true)}>Details</button>
    </div>
  );
}

/** New release downloaded in the background. */
export function UpdateBar() {
  const pwa = usePwa();
  const [hidden, setHidden] = useState(false);
  if (!pwa?.updateReady || hidden) return null;
  return (
    <div className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-[13px] shadow-[var(--shadow-lift)] sm:inset-x-auto sm:right-4">
      <RefreshCw className="size-4 shrink-0 text-brand" />
      <span className="flex-1">A new version of The House is ready.{pwa.pending ? ' Your unsynced changes are kept.' : ''}</span>
      <Button size="sm" variant="primary" onClick={pwa.applyUpdate}>Update</Button>
      <button type="button" onClick={() => setHidden(true)} className="text-fg-subtle hover:text-fg" aria-label="Later"><X className="size-4" /></button>
    </div>
  );
}

/** One-time suggestion to install, with iPhone instructions where there is no prompt. */
export function InstallNudge() {
  const pwa = usePwa();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem('rb-install-dismissed') === '1');
    } catch {
      setDismissed(false);
    }
  }, []);
  if (!pwa || pwa.installed || dismissed || (!pwa.installable && !pwa.isIos)) return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem('rb-install-dismissed', '1');
    } catch {}
  };
  return (
    <div className="no-print fixed bottom-3 left-3 z-40 flex max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-[13px] shadow-[var(--shadow-lift)]">
      <img src="/pwa/maskable-192.png" alt="" className="size-10 rounded-xl" />
      <div className="flex-1">
        <p className="font-semibold">Install The House</p>
        <p className="mt-0.5 text-fg-muted">
          {pwa.isIos && !pwa.installable ? (
            <>Tap <Share className="inline size-3.5" /> Share, then <b>Add to Home Screen</b>. It opens full-screen and keeps working without internet.</>
          ) : (
            <>Opens like an app, works without internet, and alerts you even when closed.</>
          )}
        </p>
        {pwa.installable && <Button size="sm" variant="primary" className="mt-2" icon={<Download className="size-3.5" />} onClick={() => void pwa.install()}>Install</Button>}
      </div>
      <button type="button" onClick={close} className="text-fg-subtle hover:text-fg" aria-label="Not now"><X className="size-4" /></button>
    </div>
  );
}

/** Everything about offline mode in one place. */
export function SyncCenter() {
  const pwa = usePwa();
  const confirm = useConfirm();
  const [includeBookings, setIncludeBookings] = useState(true);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    try {
      setAuto(localStorage.getItem('rb-auto-offline') !== '0');
    } catch {}
  }, []);
  if (!pwa) return null;
  const p = pwa;
  const queue = p.items.filter((i) => i.status !== 'failed');
  const failed = p.items.filter((i) => i.status === 'failed');
  const pct = p.warm.total ? Math.round((p.warm.done / p.warm.total) * 100) : 0;

  return (
    <Dialog open={p.centerOpen} onClose={() => p.setCenterOpen(false)} size="lg" title="Offline & sync" description="The House keeps working without internet. Screens you’ve opened are saved on this device, and changes wait here until the connection is back.">
      <div className="grid gap-5 text-[13px]">
        {/* status */}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className={cn('rounded-xl border p-3', p.online ? 'border-success/25 bg-success/5' : 'border-warning/30 bg-warning/10')}>
            <p className="flex items-center gap-1.5 font-semibold">{p.online ? <Wifi className="size-4 text-success" /> : <CloudOff className="size-4 text-warning" />}{p.online ? 'Online' : 'Offline'}</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">{p.online ? 'Changes save straight to the hotel’s server.' : 'Working from this device. Nothing is lost.'}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="flex items-center gap-1.5 font-semibold"><CloudUpload className="size-4 text-fg-subtle" />{queue.length} waiting{failed.length ? ` · ${failed.length} need a look` : ''}</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">Last synced {since(p.lastSyncAt)}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="flex items-center gap-1.5 font-semibold"><HardDrive className="size-4 text-fg-subtle" />{p.storage ? mb(p.storage.usage) : '—'} saved</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">{p.storage?.persisted ? 'Kept even when space is low' : 'May be cleared if the device runs low'}</p>
          </div>
        </div>

        {/* queue */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Changes on this device</p>
            <Button size="sm" icon={p.syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} disabled={!p.online || p.syncing || !queue.length} onClick={p.sync}>Sync now</Button>
          </div>
          {!p.items.length ? (
            <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-fg-muted"><CheckCircle2 className="size-4 text-success" /> Everything is saved on the server.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {p.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.label}</span>
                    <span className="block text-[11.5px] text-fg-subtle">{since(i.createdAt)}{i.userName ? ` · ${i.userName}` : ''}{i.route ? ` · from ${i.route}` : ''}{i.attempts ? ` · ${i.attempts} attempt${i.attempts === 1 ? '' : 's'}` : ''}</span>
                    {i.error && <span className={cn('block text-[12px]', i.status === 'failed' ? 'text-danger' : 'text-fg-muted')}>{i.error}</span>}
                  </span>
                  {i.status === 'failed' ? <Pill tone="red">not saved</Pill> : i.status === 'syncing' ? <Pill tone="blue">sending</Pill> : <Pill tone="amber">waiting</Pill>}
                  {i.status === 'failed' && <Button size="sm" icon={<RotateCcw className="size-3" />} onClick={() => p.retry(i.id)}>Retry</Button>}
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-danger/10 hover:text-danger"
                    aria-label="Discard this change"
                    onClick={async () => {
                      if (await confirm({ title: `Discard “${i.label}”?`, body: 'It was never saved on the server and will be lost.', confirm: 'Discard', danger: true })) p.discard(i.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11.5px] text-fg-subtle">Each change carries a one-time key, so the server applies it exactly once even if it is sent twice. If a room or rate was taken while you were offline, the change shows here with the reason so you can redo it.</p>
        </section>

        {/* offline copy */}
        <section className="rounded-xl border border-line p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Offline copy</p>
              <p className="text-[12px] text-fg-muted">Last saved {since(p.warm.lastAt)} · every screen you can use, plus upcoming and in-house bookings.</p>
            </div>
            <Button size="sm" variant="primary" icon={p.warm.running ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} disabled={!p.online || p.warm.running || !p.swReady} onClick={() => void p.downloadForOffline({ includeBookings })}>
              {p.warm.running ? `Saving ${pct}%` : 'Download for offline'}
            </Button>
          </div>
          {p.warm.running && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-[11.5px] text-fg-subtle">{p.warm.step} · {p.warm.done}/{p.warm.total}</p>
            </div>
          )}
          {!p.swReady && <p className="mt-2 text-[12px] text-warning">Offline mode starts after the first full load — reload once.</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Switch label="Include bookings" hint="In-house guests and the next 40 arrivals" checked={includeBookings} onChange={setIncludeBookings} />
            <Switch
              label="Keep it fresh automatically"
              hint="Quietly re-saves twice a day while online"
              checked={auto}
              onChange={(v) => {
                setAuto(v);
                try {
                  localStorage.setItem('rb-auto-offline', v ? '1' : '0');
                } catch {}
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!p.storage?.persisted && <Button size="sm" icon={<HardDrive className="size-3.5" />} onClick={() => void p.requestPersist()}>Keep offline copy safe</Button>}
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (await confirm({ title: 'Clear the offline copy?', body: queue.length ? `${queue.length} change(s) not yet synced will be lost.` : 'Saved screens are removed from this device. They come back as you use them.', confirm: 'Clear', danger: true })) await p.clearOfflineData();
              }}
            >
              Clear offline copy
            </Button>
          </div>
        </section>

        {/* notifications */}
        <section className="rounded-xl border border-line p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 font-semibold">{p.push.subscribed ? <Bell className="size-4 text-success" /> : <BellOff className="size-4 text-fg-subtle" />}Notifications on this device</p>
              <p className="text-[12px] text-fg-muted">
                {!p.push.supported
                  ? p.isIos
                    ? 'On iPhone, install the app to the Home Screen first (iOS 16.4+), then turn this on.'
                    : 'This browser does not support push notifications.'
                  : p.push.permission === 'denied'
                    ? 'Blocked in the browser — allow notifications in the site settings.'
                    : p.push.subscribed
                      ? 'New bookings, check-outs, rooms to clean, POS bills and urgent requests — even when the app is closed. Who gets what is set in Settings → Notifications.'
                      : 'Get alerts for bookings, check-outs, rooms and the POS even when the app is closed.'}
              </p>
            </div>
            {p.push.supported && p.push.permission !== 'denied' && (
              <div className="flex gap-2">
                {p.push.subscribed && <Button size="sm" onClick={() => void p.testPush()}>Send a test</Button>}
                <Button size="sm" variant={p.push.subscribed ? 'secondary' : 'primary'} icon={p.push.subscribed ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />} onClick={() => void (p.push.subscribed ? p.disablePush() : p.enablePush())}>
                  {p.push.subscribed ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* app */}
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3.5">
          <div>
            <p className="flex items-center gap-1.5 font-semibold"><MonitorSmartphone className="size-4 text-fg-subtle" />{p.installed ? 'Installed as an app' : 'Install as an app'}</p>
            <p className="text-[12px] text-fg-muted">{p.installed ? 'Opens from the home screen or dock, full-screen, with an alert badge.' : p.isIos ? 'Safari: Share → Add to Home Screen.' : 'One tap — opens full-screen and starts without a browser.'}</p>
          </div>
          <div className="flex gap-2">
            {p.updateReady && <Button size="sm" variant="primary" icon={<RefreshCw className="size-3.5" />} onClick={p.applyUpdate}>Update now</Button>}
            {p.installable && !p.installed && <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} onClick={() => void p.install()}>Install</Button>}
          </div>
        </section>
        <p className="text-[11px] text-fg-subtle">Version {process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}</p>
      </div>
    </Dialog>
  );
}
