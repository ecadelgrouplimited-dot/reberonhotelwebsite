'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BedDouble, Contact, History, Inbox as InboxIcon, Trash2, ChevronRight, Check, Eye, EyeOff, ExternalLink, Keyboard, LayoutGrid, Pin, PinOff, Plus, RotateCcw, Search, ShoppingBag, UserRoundPlus, X } from 'lucide-react';
import { useCan, useMe } from '@/lib/providers';
import { usePrefs } from '@/lib/prefs';
import { useNow } from '@/lib/use-now';
import { forgetRecent, useRecents } from '@/lib/recents';
import { cn } from '@/lib/cn';
import { Switch } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { computeBadges, useAdminPulse, type BadgeInfo } from '@/components/shell/badges';
import { NAV } from '@/components/shell/nav';
import { AppGlyph, AppTile } from '@/components/os/app-icon';
import { useContextMenu, type MenuItem } from '@/components/os/context-menu';
import { mod, shellAction } from '@/components/os/actions';
import { DayBrief } from '@/components/os/day-brief';
import type { HouseApp } from '@/components/os/apps';

const kampala = (d: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', ...o }).format(d);
const TONE_RANK: Record<BadgeInfo['tone'], number> = { red: 0, amber: 1, green: 2, neutral: 3 };

/**
 * Home: a calm desktop. The clock, one search box, the few things that need you,
 * and your apps. Everything else is one click, one key or one right-click away.
 */
export default function HomeScreen() {
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const menu = useContextMenu();
  const prefs = usePrefs();
  const now = useNow(20_000);
  const { data: pulse } = useAdminPulse(true);
  const badges = useMemo(() => computeBadges(pulse), [pulse]);
  const [customise, setCustomise] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const recents = useRecents().filter((r) => r.kind !== 'app').slice(0, 6);
  const wantsCustomise = useSearchParams().get('customise');
  useEffect(() => {
    if (wantsCustomise) setCustomise(true);
  }, [wantsCustomise]);

  const hour = Number(kampala(now, { hour: 'numeric', hour12: false }));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const size = prefs.largeIcons ? 72 : 60;
  const badgeOf = (a: HouseApp) => (a.badge ? badges[a.badge] : undefined);

  // Things waiting, as quiet notifications (most urgent first, at most four).
  const needs = prefs.apps
    .map((a) => ({ app: a, b: badgeOf(a) }))
    .filter((x): x is { app: HouseApp; b: BadgeInfo } => !!x.b && x.b.count > 0 && (x.b.tone === 'red' || x.b.tone === 'amber'))
    .sort((a, b) => TONE_RANK[a.b.tone] - TONE_RANK[b.b.tone] || b.b.count - a.b.count);
  const [allNeeds, setAllNeeds] = useState(false);

  const groups = NAV.map((g) => ({
    id: g.id,
    label: g.label,
    apps: prefs.apps.filter((a) => a.groupId === g.id && (showHidden || customise || !prefs.hidden.has(a.href))),
  })).filter((g) => g.apps.length);

  const tileMenu = (e: React.MouseEvent, a: HouseApp) =>
    menu.open(
      e,
      [
        { label: 'Open', icon: ExternalLink, onSelect: () => router.push(a.href) },
        { label: 'Open in a new tab', icon: ExternalLink, onSelect: () => window.open(a.href, '_blank', 'noopener') },
        { kind: 'separator' },
        prefs.isPinned(a.href) ? { label: 'Unpin from the dock', icon: PinOff, onSelect: () => prefs.unpin(a.href) } : { label: 'Pin to the dock', icon: Pin, onSelect: () => prefs.pin(a.href) },
        prefs.hidden.has(a.href)
          ? { label: 'Show on Home', icon: Eye, onSelect: () => prefs.set({ hidden: [...prefs.hidden].filter((h) => h !== a.href) }) }
          : { label: 'Hide from Home', icon: EyeOff, onSelect: () => prefs.hide(a.href) },
        { kind: 'separator' },
        { label: 'Customise Home', icon: LayoutGrid, onSelect: () => setCustomise(true) },
      ] as MenuItem[],
      a.fullName,
    );

  const quick = [
    can('bookings:write') && { label: 'Walk-in', icon: UserRoundPlus, href: '/reservations/new?walkin=1', primary: true },
    can('bookings:write') && { label: 'New booking', icon: Plus, href: '/reservations/new' },
    can('pos:operate') && { label: 'New sale', icon: ShoppingBag, href: '/pos' },
  ].filter(Boolean) as { label: string; icon: typeof Plus; href: string; primary?: boolean }[];

  return (
    <div className="fade-in mx-auto max-w-5xl pb-28 pt-2 sm:pt-6">
      {/* Clock, greeting, search */}
      <header data-page-header className="text-center">
        <p className="font-display text-[3.4rem] font-semibold leading-none tracking-tight tabular sm:text-[4.2rem]">{kampala(now, { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        <p className="mt-2 text-[14px] text-fg-muted">
          {kampala(now, { weekday: 'long', day: 'numeric', month: 'long' })} · {greeting}, {me.name.split(' ')[0]}
        </p>
        <h1 className="sr-only">Home</h1>
      </header>

      <button
        type="button"
        onClick={() => shellAction('palette')}
        className="mx-auto mt-6 flex h-14 w-full max-w-2xl items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-left text-[15px] text-fg-subtle shadow-[var(--shadow-soft)] transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <Search className="size-5 text-fg-muted" />
        <span className="flex-1">What do you need? A guest, a booking, a screen…</span>
        <kbd className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-sans text-[12px] font-semibold text-fg-muted">{mod()} K</kbd>
      </button>

      {quick.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {quick.map((q) => (
            <a
              key={q.href}
              href={q.href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                router.push(q.href);
              }}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                q.primary ? 'bg-accent text-accent-fg hover:bg-accent-hover' : 'border border-line bg-surface hover:border-line-strong',
              )}
            >
              <q.icon className="size-4" /> {q.label}
            </a>
          ))}
        </div>
      )}

      <DayBrief pulse={pulse} />

      {/* Needs you — quiet notifications */}
      <section aria-label="Needs you" className="mx-auto mt-8 max-w-2xl">
        {needs.length === 0 ? (
          <p className="flex items-center justify-center gap-2 text-[13px] text-fg-muted">
            <Check className="size-4 text-success" /> All caught up — nothing is waiting on you.
          </p>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {(allNeeds ? needs : needs.slice(0, 4)).map(({ app, b }) => (
              <li key={app.href}>
                <a
                  href={app.href}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    router.push(app.href);
                  }}
                  onContextMenu={(e) => tileMenu(e, app)}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-3 py-2.5 backdrop-blur transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  <AppGlyph app={app} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{app.name}</span>
                    <span className="block truncate text-[12px] text-fg-muted">{b.tooltip}</span>
                  </span>
                  <span className={cn('grid h-6 min-w-6 place-items-center rounded-full px-2 text-[11.5px] font-bold tabular text-white', b.tone === 'red' ? 'bg-rose-500' : 'bg-amber-500')}>{b.count}</span>
                  <ChevronRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                </a>
              </li>
            ))}
            {needs.length > 4 && (
              <li className="text-center">
                <button type="button" onClick={() => setAllNeeds((v) => !v)} className="text-[12.5px] font-semibold text-fg-muted hover:text-fg">
                  {allNeeds ? 'Show fewer' : `${needs.length - 4} more`}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Jump back in — records opened recently on this device */}
      {recents.length > 0 && !customise && (
        <section aria-label="Jump back in" className="mx-auto mt-8 max-w-3xl">
          <h2 className="mb-2 flex items-center gap-1.5 px-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            <History className="size-3.5" /> Jump back in
          </h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {recents.map((r) => {
              const Icon = r.kind === 'booking' ? BedDouble : r.kind === 'guest' ? Contact : InboxIcon;
              return (
                <li key={r.href} className="min-w-0">
                  <a
                    href={r.href}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      router.push(r.href);
                    }}
                    onContextMenu={(e) =>
                      menu.open(e, [
                        { label: 'Open', icon: ExternalLink, onSelect: () => router.push(r.href) },
                        { label: 'Open in a new tab', icon: ExternalLink, onSelect: () => window.open(r.href, '_blank', 'noopener') },
                        { kind: 'separator' },
                        { label: 'Forget', icon: Trash2, onSelect: () => forgetRecent(r.href) },
                      ], r.label)
                    }
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/80 px-3 py-2 transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted"><Icon className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{r.label}</span>
                      {r.detail && <span className="block truncate text-[11.5px] text-fg-muted">{r.detail}</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Customise bar */}
      {customise && (
        <div className="sticky top-16 z-20 mx-auto mt-8 flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-accent/40 bg-surface px-4 py-3 shadow-[var(--shadow-soft)]">
          <p className="text-[13px] font-semibold">Customise Home</p>
          <p className="text-[12px] text-fg-muted">Tap the pin to put an app in the dock, the eye to hide it. Drag icons onto the dock.</p>
          <span className="ml-auto flex flex-wrap items-center gap-4">
            <Switch label="Large icons" checked={prefs.largeIcons} onChange={(v) => prefs.set({ largeIcons: v })} />
            <Switch label="Dock" checked={prefs.dock} onChange={(v) => prefs.set({ dock: v })} />
            <button type="button" onClick={prefs.resetLayout} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg-muted hover:text-fg">
              <RotateCcw className="size-3.5" /> Reset
            </button>
            <button type="button" onClick={() => { setCustomise(false); router.replace('/'); }} className="rounded-full bg-fg px-4 py-1.5 text-[12.5px] font-semibold text-bg">
              Done
            </button>
          </span>
        </div>
      )}

      {/* Pinned */}
      {prefs.pinned.length > 0 && (
        <AppGrid title="Pinned" apps={prefs.pinned} size={size} badgeOf={badgeOf} onOpen={(a) => router.push(a.href)} onMenu={tileMenu} customise={customise} prefs={prefs} />
      )}

      {/* All apps: folders on the calm view, every app while customising */}
      {customise ? (
        groups.map((g) => (
          <AppGrid key={g.id} title={g.label} apps={g.apps} size={size} badgeOf={badgeOf} onOpen={(a) => router.push(a.href)} onMenu={tileMenu} customise={customise} prefs={prefs} />
        ))
      ) : (
        <section className="mt-9" aria-label="All apps">
          <h2 className="mb-2 px-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">All apps</h2>
          <ul className={cn('grid gap-1', size > 64 ? 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(6rem,1fr))]')}>
            {groups.map((g) => {
              const waiting = g.apps.reduce((n, a) => n + ((badgeOf(a)?.tone === 'red' || badgeOf(a)?.tone === 'amber') ? badgeOf(a)!.count : 0), 0);
              const urgent = g.apps.some((a) => badgeOf(a)?.tone === 'red');
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setFolder(g.id)}
                    onContextMenu={(e) =>
                      menu.open(e, [
                        { label: `Open ${g.label}`, icon: LayoutGrid, onSelect: () => setFolder(g.id) },
                        { label: 'Customise Home', icon: LayoutGrid, onSelect: () => setCustomise(true) },
                      ], g.label)
                    }
                    aria-label={`${g.label}: ${g.apps.length} apps${waiting ? `, ${waiting} waiting` : ''}`}
                    className="group flex w-full flex-col items-center gap-2 rounded-2xl p-2 outline-none transition hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  >
                    <span className="relative grid grid-cols-2 gap-1 rounded-[27%] bg-surface-2/90 p-1.5 shadow-inner ring-1 ring-line transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5" style={{ width: size, height: size }}>
                      {g.apps.slice(0, 4).map((a) => (
                        <AppGlyph key={a.href} app={a} size={(size - 16) / 2} className="!shadow-none" />
                      ))}
                      {waiting > 0 && (
                        <span className={cn('absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tabular text-white shadow ring-2 ring-[var(--bg)]', urgent ? 'bg-rose-500' : 'bg-amber-500')}>{waiting}</span>
                      )}
                    </span>
                    <span className="line-clamp-2 max-w-full text-center text-[12.5px] font-medium leading-tight">{g.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Dialog open={!!folder} onClose={() => setFolder(null)} size="lg" title={groups.find((g) => g.id === folder)?.label} description="Right-click an app to pin it to the dock or hide it. Drag it onto the dock to pin.">
        {folder && (
          <div className="-mt-4">
            <AppGrid title="" apps={groups.find((g) => g.id === folder)?.apps ?? []} size={size} badgeOf={badgeOf} onOpen={(a) => { setFolder(null); router.push(a.href); }} onMenu={tileMenu} customise={false} prefs={prefs} />
          </div>
        )}
      </Dialog>

      <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-fg-subtle">
        {prefs.hidden.size > 0 && !customise && (
          <button type="button" onClick={() => setShowHidden((v) => !v)} className="font-semibold hover:text-fg">
            {showHidden ? 'Hide hidden apps' : `Show ${prefs.hidden.size} hidden app${prefs.hidden.size > 1 ? 's' : ''}`}
          </button>
        )}
        <span>Right-click anything for options</span>
        <button type="button" onClick={() => shellAction('shortcuts')} className="inline-flex items-center gap-1 hover:text-fg">
          <Keyboard className="size-3.5" /> Shortcuts <kbd className="font-sans">?</kbd>
        </button>
        {!customise && (
          <button type="button" onClick={() => setCustomise(true)} className="inline-flex items-center gap-1 hover:text-fg">
            <LayoutGrid className="size-3.5" /> Customise
          </button>
        )}
      </footer>
    </div>
  );
}

function AppGrid({ title, apps, size, badgeOf, onOpen, onMenu, customise, prefs }: {
  title: string; apps: HouseApp[]; size: number; badgeOf: (a: HouseApp) => BadgeInfo | undefined;
  onOpen: (a: HouseApp) => void; onMenu: (e: React.MouseEvent, a: HouseApp) => void; customise: boolean; prefs: ReturnType<typeof usePrefs>;
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const grid = useRef<HTMLUListElement>(null);
  const [focus, setFocus] = useState(0);
  const cols = () => (grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').length : 1);
  const move = (i: number) => {
    const j = Math.max(0, Math.min(apps.length - 1, i));
    setFocus(j);
    refs.current[j]?.focus();
  };
  return (
    <section className={cn(title && 'mt-9')} aria-label={title || 'Apps'}>
      {title && <h2 className="mb-2 px-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</h2>}
      <ul ref={grid} className={cn('grid gap-1', size > 64 ? 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(6rem,1fr))]')}>
        {apps.map((a, i) => {
          const hidden = prefs.hidden.has(a.href);
          return (
            <li key={a.href} className={cn('relative', hidden && 'opacity-45')}>
              <AppTile
                ref={(el) => {
                  refs.current[i] = el;
                }}
                app={a}
                badge={badgeOf(a)}
                size={size}
                tabIndex={i === focus ? 0 : -1}
                onOpen={() => onOpen(a)}
                onMenu={(e) => onMenu(e, a)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/rb-app', a.href);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                onKeyDown={(e) => {
                  const c = cols();
                  if (e.key === 'ArrowRight') move(i + 1);
                  else if (e.key === 'ArrowLeft') move(i - 1);
                  else if (e.key === 'ArrowDown') move(i + c);
                  else if (e.key === 'ArrowUp') move(i - c);
                  else if (e.key === 'Home') move(0);
                  else if (e.key === 'End') move(apps.length - 1);
                  else return;
                  e.preventDefault();
                }}
              />
              {customise && (
                <span className="absolute right-1 top-1 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => (prefs.isPinned(a.href) ? prefs.unpin(a.href) : prefs.pin(a.href))}
                    className={cn('grid size-7 place-items-center rounded-full shadow ring-1 ring-line', prefs.isPinned(a.href) ? 'bg-accent text-accent-fg' : 'bg-surface text-fg-muted')}
                    aria-label={prefs.isPinned(a.href) ? `Unpin ${a.name}` : `Pin ${a.name} to the dock`}
                    title={prefs.isPinned(a.href) ? 'Unpin from the dock' : 'Pin to the dock'}
                  >
                    {prefs.isPinned(a.href) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => (hidden ? prefs.set({ hidden: [...prefs.hidden].filter((h) => h !== a.href) }) : prefs.hide(a.href))}
                    className="grid size-7 place-items-center rounded-full bg-surface text-fg-muted shadow ring-1 ring-line"
                    aria-label={hidden ? `Show ${a.name} on Home` : `Hide ${a.name} from Home`}
                    title={hidden ? 'Show on Home' : 'Hide from Home'}
                  >
                    {hidden ? <Eye className="size-3.5" /> : <X className="size-3.5" />}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
