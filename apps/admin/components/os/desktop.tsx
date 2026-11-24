'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Copy, ExternalLink, Home, Keyboard, LayoutGrid, Moon, PanelLeft, Pin, PinOff, Plus, Printer, RefreshCw, Search, UserRoundPlus, Compass, Lock } from 'lucide-react';
import { useMeQuery } from '@/lib/providers';
import { addRecent } from '@/lib/recents';
import { recordAppUse, stepTrail } from '@/lib/usage';
import { usePrefs } from '@/lib/prefs';
import { printScreen } from '@/lib/print';
import { Dialog } from '@/components/ui/dialog';
import { APP_BY_HREF } from './apps';
import { useContextMenu, type MenuItem } from './context-menu';
import { currentScreen, RESERVED_KEYS } from './screen-actions';
import { mod, shellAction, toggleTheme } from './actions';
import { lockShortcut } from './lock-screen';
import { lockState } from '@/lib/api';

/** `g` then a letter jumps to an app (only apps the person may open). */
export const GO_KEYS: { key: string; href: string; label: string }[] = [
  { key: 'h', href: '/', label: 'Home' },
  { key: 't', href: '/today', label: 'Today board' },
  { key: 'd', href: '/desk', label: 'Front Desk' },
  { key: 'b', href: '/reservations', label: 'Bookings' },
  { key: 'r', href: '/rack', label: 'Room Rack' },
  { key: 'c', href: '/housekeeping', label: 'Housekeeping (cleaning)' },
  { key: 'g', href: '/guests', label: 'Guests' },
  { key: 'i', href: '/inbox', label: 'Inbox' },
  { key: 'p', href: '/pos', label: 'POS' },
  { key: 'e', href: '/receipts', label: 'Receipts' },
  { key: 'o', href: '/brief', label: 'Owner Brief' },
  { key: 'f', href: '/reports', label: 'Financial reports' },
  { key: 'w', href: '/website/pages', label: 'Website pages' },
  { key: 'm', href: '/media', label: 'Media' },
  { key: 's', href: '/settings', label: 'Settings' },
];

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[data-native-menu]'));

/**
 * Right-click and keyboard for the whole House:
 *  - right-click a link: open, open in a new tab, copy link, pin to the dock;
 *  - right-click empty space: the House menu (search, walk-in, refresh, theme…);
 *  - `g` + letter to jump, Alt+1…9 for docked apps, `/` to search, `?` for help,
 *    Menu key / Shift+F10 to right-click the focused thing.
 */
export function DesktopHandlers() {
  const router = useRouter();
  const qc = useQueryClient();
  const menu = useContextMenu();
  const prefs = usePrefs();
  const { data: me } = useMeQuery();
  const can = (p: string) => !!me?.permissions.includes(p);
  const latest = useRef({ prefs, me });
  latest.current = { prefs, me };
  const [help, setHelp] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  // Every app opened goes into this device's recents (records add themselves on their pages).
  useEffect(() => {
    const tab = search.get('tab') ?? search.get('view');
    const app = APP_BY_HREF.get(tab ? `${pathname}?${search.get('tab') ? 'tab' : 'view'}=${tab}` : pathname) ?? APP_BY_HREF.get(pathname);
    if (app) {
      addRecent({ href: app.href, label: app.fullName, detail: app.group, kind: 'app' });
      recordAppUse(app.href);
    }
    // The trail behind “Back to …” in the Navigator and the dock.
    stepTrail(pathname + (search.toString() ? `?${search.toString()}` : ''));
  }, [pathname, search]);

  useEffect(() => {
    const open = () => setHelp(true);
    window.addEventListener('rb:shortcuts', open);
    return () => window.removeEventListener('rb:shortcuts', open);
  }, []);

  // Right-click
  useEffect(() => {
    const houseItems = (): MenuItem[] => [
      { label: 'Home', icon: Home, hint: 'G H', onSelect: () => router.push('/') },
      { label: 'Search or jump to…', icon: Search, hint: `${mod()} K`, onSelect: () => shellAction('palette') },
      { label: 'Navigator', icon: Compass, hint: '\\', onSelect: () => shellAction('navigator') },
      ...(can('bookings:write')
        ? ([
            { kind: 'separator' },
            { label: 'Walk-in', icon: UserRoundPlus, onSelect: () => router.push('/reservations/new?walkin=1') },
            { label: 'New booking', icon: Plus, onSelect: () => router.push('/reservations/new') },
          ] as MenuItem[])
        : []),
      { kind: 'separator' },
      { label: 'Back', icon: ArrowLeft, onSelect: () => router.back() },
      {
        label: 'Refresh this screen',
        icon: RefreshCw,
        hint: 'R',
        onSelect: () => {
          qc.invalidateQueries();
          toast.success('Up to date', { id: 'rb-refresh', duration: 1200 });
        },
      },
      { label: 'Print this screen', icon: Printer, hint: `${mod()} P`, onSelect: () => void printScreen() },
      { kind: 'separator' },
      { label: 'Light / dark', icon: Moon, onSelect: toggleTheme },
      { label: 'Show / hide sidebar', icon: PanelLeft, hint: `${mod()} B`, onSelect: () => shellAction('sidebar') },
      { label: 'Customise Home', icon: LayoutGrid, onSelect: () => router.push('/?customise=1') },
      { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', onSelect: () => shellAction('shortcuts') },
      { kind: 'separator' },
      { label: 'Lock screen', icon: Lock, hint: lockShortcut(), onSelect: () => shellAction('lock') },
    ];

    /** When the screen has its own actions, the House keeps to a short tail. */
    const compactHouse = (): MenuItem[] => [
      { label: 'Search or jump to…', icon: Search, hint: `${mod()} K`, onSelect: () => shellAction('palette') },
      { label: 'Home', icon: Home, hint: 'G H', onSelect: () => router.push('/') },
      {
        label: 'Refresh',
        icon: RefreshCw,
        hint: 'R',
        onSelect: () => {
          qc.invalidateQueries();
          toast.success('Up to date', { id: 'rb-refresh', duration: 1200 });
        },
      },
      { label: 'Print this screen', icon: Printer, hint: `${mod()} P`, onSelect: () => void printScreen() },
      { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', onSelect: () => shellAction('shortcuts') },
      { label: 'Lock screen', icon: Lock, hint: lockShortcut(), onSelect: () => shellAction('lock') },
    ];

    const onMenu = (e: MouseEvent) => {
      if (e.shiftKey || e.defaultPrevented || isTyping(e.target)) return;
      const target = e.target as Element | null;
      if (!target?.closest('main, [data-shell-chrome], [data-dock]')) return;
      const sel = window.getSelection()?.toString().trim();
      const a = target.closest('a[href]') as HTMLAnchorElement | null;
      const url = a ? new URL(a.href, location.href) : null;
      if (url && url.origin === location.origin && !url.pathname.startsWith('/v1/')) {
        const href = url.pathname + url.search;
        const app = APP_BY_HREF.get(href);
        const p = latest.current.prefs;
        menu.open(
          e,
          [
            { label: 'Open', icon: ExternalLink, onSelect: () => router.push(href) },
            { label: 'Open in a new tab', icon: ExternalLink, onSelect: () => window.open(href, '_blank', 'noopener') },
            { label: 'Copy link', icon: Copy, onSelect: () => void navigator.clipboard.writeText(url.href).then(() => toast.success('Link copied')) },
            ...(app && p.apps.some((x) => x.href === href)
              ? ([p.isPinned(href) ? { label: 'Unpin from the dock', icon: PinOff, onSelect: () => p.unpin(href) } : { label: 'Pin to the dock', icon: Pin, onSelect: () => p.pin(href) }] as MenuItem[])
              : []),
            { kind: 'separator' },
            ...(currentScreen() ? compactHouse() : houseItems()),
          ],
          app?.fullName ?? (a?.textContent?.trim().slice(0, 40) || 'Link'),
        );
        return;
      }
      if (url) return; // outside links keep the browser's menu
      const screen = currentScreen();
      menu.open(
        e,
        [
          ...(sel
            ? ([
                { label: 'Copy', icon: Copy, hint: `${mod()} C`, onSelect: () => void navigator.clipboard.writeText(sel) },
                { kind: 'separator' },
              ] as MenuItem[])
            : []),
          ...(screen ? [...screen.items, { kind: 'separator' } as MenuItem, ...compactHouse()] : houseItems()),
        ],
        screen?.title ?? 'The House',
      );
    };
    document.addEventListener('contextmenu', onMenu);
    return () => document.removeEventListener('contextmenu', onMenu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, router, qc, me]);

  // Keyboard
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    let goMode = false;
    const onKey = (e: KeyboardEvent) => {
      if (lockState.locked) return;
      // Menu key / Shift+F10: right-click whatever has focus.
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        const el = (document.activeElement as HTMLElement | null) ?? document.body;
        if (isTyping(el)) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(24, r.width / 2), clientY: r.top + Math.min(r.height, 32) }));
        return;
      }
      if (e.metaKey || e.ctrlKey || isTyping(e.target)) return;
      const { prefs: p, me: who } = latest.current;
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const app = p.pinned[Number(e.key) - 1];
        if (app) {
          e.preventDefault();
          router.push(app.href);
        }
        return;
      }
      if (e.altKey) return;
      if (goMode) {
        goMode = false;
        if (pending) clearTimeout(pending);
        const g = GO_KEYS.find((x) => x.key === e.key.toLowerCase());
        const allowed = g && (g.href === '/' || p.apps.some((a) => a.href === g.href));
        if (g && allowed) {
          e.preventDefault();
          router.push(g.href);
        }
        return;
      }
      // A screen's own single-key shortcuts.
      if (!e.shiftKey && e.key.length === 1 && !RESERVED_KEYS.has(e.key.toLowerCase()) && !document.querySelector('dialog[open]')) {
        const hit = currentScreen()?.items.find((it) => (it.kind ?? 'item') === 'item' && (it as { key?: string }).key === e.key.toLowerCase() && !(it as { disabled?: boolean }).disabled);
        if (hit) {
          e.preventDefault();
          (hit as { onSelect: () => void }).onSelect();
          return;
        }
      }
      if (e.key === 'g') {
        goMode = true;
        pending = setTimeout(() => (goMode = false), 1200);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === '/') {
        e.preventDefault();
        shellAction('palette');
      } else if (e.key === '\\') {
        e.preventDefault();
        shellAction('navigator');
      } else if (e.key === 'r' && who) {
        qc.invalidateQueries();
        toast.success('Up to date', { id: 'rb-refresh', duration: 1200 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (pending) clearTimeout(pending);
    };
  }, [router, qc]);

  return <ShortcutsDialog open={help} onClose={() => setHelp(false)} />;
}

function Keys({ k }: { k: string }) {
  return (
    <span className="flex gap-1">
      {k.split(' ').map((x, i) => (
        <kbd key={i} className="min-w-6 rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center font-sans text-[11.5px] font-semibold">{x}</kbd>
      ))}
    </span>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const m = mod();
  const general: [string, string][] = [
    [`${m} K`, 'Search anything, jump anywhere'],
    ['/', 'Search (same as above)'],
    ['?', 'This list'],
    ['R', 'Refresh the screen'],
    [`${m} P`, 'Print this screen (clean A4)'],
    ['\\', 'Navigator: back, suggestions and every app'],
    [`${m} B`, 'Show or hide the sidebar'],
    [lockShortcut(), 'Lock the screen (the next person uses their PIN)'],
    ['Alt 1…9', 'Open the app in that dock position'],
    ['Shift F10', 'Right-click the focused item (or the Menu key)'],
    ['Esc', 'Close a menu or dialog'],
  ];
  const go = GO_KEYS.filter((g) => g.href === '/' || prefs.apps.some((a) => a.href === g.href));
  const screen = open ? currentScreen() : null;
  const screenKeys = (screen?.items ?? []).filter((it) => (it.kind ?? 'item') === 'item' && (it as { key?: string }).key) as { label: string; key: string }[];
  return (
    <Dialog open={open} onClose={onClose} size="xl" title="Keyboard shortcuts" description="Everything works with a mouse too — right-click anywhere for a menu, and Shift + right-click for the browser's own.">
      <div className={screenKeys.length ? 'grid gap-6 sm:grid-cols-3' : 'grid gap-6 sm:grid-cols-2'}>
        {screenKeys.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent">On this screen · {screen!.title}</p>
            <ul className="grid gap-2 text-[13px]">
              {screenKeys.map((it) => (
                <li key={it.key} className="flex items-center justify-between gap-3">
                  <span>{it.label}</span>
                  <Keys k={it.key.toUpperCase()} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Everywhere</p>
          <ul className="grid gap-2 text-[13px]">
            {general.map(([k, d]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span>{d}</span>
                <Keys k={k} />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Go to — press G, then</p>
          <ul className="grid gap-2 text-[13px]">
            {go.map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3">
                <span>{g.label}</span>
                <Keys k={`G ${g.key.toUpperCase()}`} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
