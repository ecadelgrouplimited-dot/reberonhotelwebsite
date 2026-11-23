'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, EyeOff, ExternalLink, Home, LayoutGrid, PinOff, Search } from 'lucide-react';
import { useMeQuery } from '@/lib/providers';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/cn';
import { computeBadges, useAdminPulse } from '@/components/shell/badges';
import { AppBadge, AppGlyph } from './app-icon';
import { useContextMenu } from './context-menu';
import { shellAction, mod } from './actions';

/**
 * Only the page builder (a full-height editor with its own bottom bar) tucks the dock
 * away — behind a visible handle. Everywhere else, including the POS, it stays put.
 */
const AUTOHIDE = [/^\/website\/pages\/[^/]+$/];

export function useDockVisible() {
  const pathname = usePathname();
  const { dock, ready } = usePrefs();
  return { show: ready && dock, autohide: AUTOHIDE.some((r) => r.test(pathname)) };
}

export function Dock() {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const menu = useContextMenu();
  const prefs = usePrefs();
  const { data: me } = useMeQuery();
  const { data: pulse } = useAdminPulse(!!me);
  const badges = useMemo(() => computeBadges(pulse), [pulse]);
  const { show, autohide } = useDockVisible();
  const [peek, setPeek] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  if (!show) return <DockSpace px={0} />;

  const current = pathname + (search.get('tab') ? `?tab=${search.get('tab')}` : search.get('view') ? `?view=${search.get('view')}` : '');
  const activeHref = prefs.pinned.find((a) => a.href === current)?.href ?? prefs.pinned.find((a) => !a.href.includes('?') && a.href !== '/' && (pathname === a.href || pathname.startsWith(`${a.href}/`)))?.href;
  const hidden = autohide && !peek;

  const drop = (e: React.DragEvent, beforeHref: string | null) => {
    e.preventDefault();
    setOver(false);
    const href = e.dataTransfer.getData('text/rb-app') || dragging;
    setDragging(null);
    if (!href) return;
    const list = prefs.pinned.map((a) => a.href).filter((h) => h !== href);
    const at = beforeHref ? list.indexOf(beforeHref) : list.length;
    list.splice(at < 0 ? list.length : at, 0, href);
    if (!prefs.apps.some((a) => a.href === href)) return;
    prefs.reorderPins(list.slice(0, 14));
  };

  return (
    <>
      <DockSpace px={autohide ? 0 : 104} />
      {autohide && (
        <>
          <div aria-hidden className="fixed inset-x-0 bottom-0 z-40 h-3" onMouseEnter={() => setPeek(true)} />
          {!peek && (
            <button
              type="button"
              onClick={() => setPeek(true)}
              onMouseEnter={() => setPeek(true)}
              className="no-print fixed bottom-1.5 left-1/2 z-40 h-1.5 w-28 -translate-x-1/2 rounded-full bg-fg/25 transition hover:h-2 hover:bg-fg/45"
              aria-label="Show the dock"
              title="Show the dock"
            />
          )}
        </>
      )}
      <nav
        data-dock
        aria-label="Dock"
        onMouseLeave={() => autohide && setPeek(false)}
        onFocus={() => autohide && setPeek(true)}
        onBlur={(e) => autohide && !e.currentTarget.contains(e.relatedTarget as Node) && setPeek(false)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/rb-app')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => drop(e, null)}
        className={cn(
          'no-print fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-end gap-1 rounded-[1.35rem] border border-white/40 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] p-1.5 shadow-[0_18px_50px_-12px_rgb(15_23_42/0.45)] backdrop-blur-2xl transition-all duration-300 dark:border-white/10',
          hidden && 'translate-y-[calc(100%+1rem)] opacity-0',
          over && 'ring-2 ring-[var(--accent)]',
        )}
      >
        <DockButton label="Home" hint="G H" active={pathname === '/'} onClick={() => router.push('/')}>
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--sidebar)] text-white shadow-inner sm:size-12">
            <LayoutGrid className="size-5" />
          </span>
        </DockButton>
        <span aria-hidden className="mx-0.5 mb-2 h-8 w-px self-center bg-line" />
        <div className="scrollbar-none flex items-end gap-1 overflow-x-auto">
          {prefs.pinned.map((app, i) => (
            <div
              key={app.href}
              draggable
              onDragStart={(e) => {
                setDragging(app.href);
                e.dataTransfer.setData('text/rb-app', app.href);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                drop(e, app.href);
              }}
              className={cn(dragging === app.href && 'opacity-40')}
            >
              <DockButton
                label={`${app.fullName}${badges[app.badge!]?.count ? ` — ${badges[app.badge!]!.tooltip}` : ''}`}
                hint={i < 9 ? `Alt ${i + 1}` : undefined}
                active={activeHref === app.href}
                href={app.href}
                onMenu={(e) =>
                  menu.open(
                    e,
                    [
                      { label: 'Open', icon: ExternalLink, onSelect: () => router.push(app.href) },
                      { label: 'Open in a new tab', icon: ExternalLink, onSelect: () => window.open(app.href, '_blank', 'noopener') },
                      { kind: 'separator' },
                      { label: 'Move left', icon: ArrowLeft, disabled: i === 0, onSelect: () => prefs.movePin(app.href, -1) },
                      { label: 'Move right', icon: ArrowRight, disabled: i === prefs.pinned.length - 1, onSelect: () => prefs.movePin(app.href, 1) },
                      { label: 'Unpin from the dock', icon: PinOff, onSelect: () => prefs.unpin(app.href) },
                      { kind: 'separator' },
                      { label: 'Hide the dock', icon: EyeOff, onSelect: () => prefs.set({ dock: false }) },
                    ],
                    app.fullName,
                  )
                }
              >
                <span className="relative">
                  <AppGlyph app={app} size={44} className="sm:!size-12" />
                  <AppBadge badge={app.badge ? badges[app.badge] : undefined} className="!-right-1 !-top-1" />
                </span>
              </DockButton>
            </div>
          ))}
        </div>
        <span aria-hidden className="mx-0.5 mb-2 h-8 w-px self-center bg-line" />
        <DockButton label="Search or jump to…" hint={`${mod()} K`} onClick={() => shellAction('palette')}>
          <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-fg-muted sm:size-12">
            <Search className="size-5" />
          </span>
        </DockButton>
      </nav>
    </>
  );
}

function DockButton({ label, hint, active, href, onClick, onMenu, children }: { label: string; hint?: string; active?: boolean; href?: string; onClick?: () => void; onMenu?: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  const cls = 'group relative flex flex-col items-center rounded-2xl p-0.5 outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-[var(--focus)] motion-safe:hover:-translate-y-1.5 motion-safe:hover:scale-110 active:scale-95';
  const body = (
    <>
      {children}
      <span className={cn('mt-0.5 size-1 rounded-full', active ? 'bg-fg/70' : 'bg-transparent')} />
      <span role="tooltip" className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--sidebar)] px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-lg group-hover:block group-focus-visible:block">
        {label.split(' — ')[0]}
        {hint && <span className="ml-2 opacity-60">{hint}</span>}
      </span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined} onContextMenu={onMenu} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} onContextMenu={onMenu} className={cls}>
      {body}
    </button>
  );
}

/** Full-height panels (e.g. the POS bill) subtract this so the dock never covers them. */
function DockSpace({ px }: { px: number }) {
  useEffect(() => {
    document.documentElement.style.setProperty('--dock-space', `${px}px`);
    return () => {
      document.documentElement.style.setProperty('--dock-space', '0px');
    };
  }, [px]);
  return null;
}
