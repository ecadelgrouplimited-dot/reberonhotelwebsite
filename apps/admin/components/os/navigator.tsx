'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, CornerDownLeft, History, Keyboard, LayoutGrid, PanelLeft, Search, Settings2, Sparkles, UserRound, BookOpenText, MessagesSquare, FileText, X, type LucideIcon } from 'lucide-react';
import { NAV } from '@/components/shell/nav';
import { computeBadges, useAdminPulse, type BadgeInfo } from '@/components/shell/badges';
import { useMeQuery } from '@/lib/providers';
import { usePrefs } from '@/lib/prefs';
import { useRecents, type RecentItem } from '@/lib/recents';
import { previousStep, suggest, USAGE_EVENT, type Suggestion, type TrailStep } from '@/lib/usage';
import { cn } from '@/lib/cn';
import { APP_BY_HREF, type HouseApp } from './apps';
import { AppGlyph } from './app-icon';
import { shellAction, mod } from './actions';

/**
 * The Navigator — the sidebar, reimagined for the desktop. Opened from the dock (or `\`),
 * it floats over the screen: search, “Back to …”, suggestions learned from how this
 * person works, what needs attention, recent records, and every app by area.
 * It closes by itself once you go somewhere, so the screen stays clean.
 */
export function Navigator() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener('rb:navigator', toggle);
    return () => window.removeEventListener('rb:navigator', toggle);
  }, []);
  // Going somewhere closes it.
  useEffect(() => setOpen(false), [pathname, search]);

  if (!open) return null;
  return <Panel onClose={() => setOpen(false)} />;
}

const KIND_ICON: Record<RecentItem['kind'], LucideIcon> = { app: LayoutGrid, booking: BookOpenText, guest: UserRound, conversation: MessagesSquare, page: FileText };
const TONE_DOT: Record<BadgeInfo['tone'], string> = { red: 'bg-danger', amber: 'bg-warning', green: 'bg-success', neutral: 'bg-fg-subtle' };
const BADGE_PILL: Record<BadgeInfo['tone'], string> = {
  red: 'bg-danger text-white',
  amber: 'bg-warning text-white',
  green: 'bg-success text-white',
  neutral: 'bg-surface-2 text-fg-muted',
};

/** The app a path belongs to: exact match first, then the longest matching prefix. */
export function appForPath(path: string): HouseApp | undefined {
  const exact = APP_BY_HREF.get(path);
  if (exact) return exact;
  const bare = path.split('?')[0]!;
  let best: HouseApp | undefined;
  for (const app of APP_BY_HREF.values()) {
    if (app.href.includes('?')) continue;
    if ((bare === app.href || bare.startsWith(`${app.href}/`)) && (!best || app.href.length > best.href.length)) best = app;
  }
  return best;
}

function stepLabel(step: TrailStep, recents: RecentItem[]) {
  if (step.path === '/') return { label: 'Home', detail: 'Your launcher' };
  const rec = recents.find((r) => r.href === step.path);
  const app = appForPath(step.path);
  if (rec && rec.kind !== 'app') return { label: rec.label, detail: rec.detail ?? app?.fullName ?? '' };
  if (app) return { label: app.fullName, detail: app.href === step.path.split('?')[0] || app.href === step.path ? app.group : `In ${app.fullName}` };
  return { label: step.path, detail: '' };
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const matches = (q: string, hay: string) => {
  const qs = words(q);
  const hs = words(hay);
  return qs.length > 0 && qs.every((w) => hs.some((h) => h.startsWith(w)));
};

function Panel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const prefs = usePrefs();
  const { data: me } = useMeQuery();
  const { data: pulse } = useAdminPulse(!!me);
  const badges = useMemo(() => computeBadges(pulse), [pulse]);
  const recents = useRecents();
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const here = pathname + (search.get('tab') ? `?tab=${search.get('tab')}` : search.get('view') ? `?view=${search.get('view')}` : '');
  const current = appForPath(here);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(current ? [current.groupId] : []));

  useEffect(() => {
    input.current?.focus();
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(USAGE_EVENT, bump);
    return () => window.removeEventListener(USAGE_EVENT, bump);
  }, []);

  const apps = prefs.apps;
  const badgeOf = useCallback((app: HouseApp) => (app.badge ? badges[app.badge] : undefined), [badges]);

  const back = useMemo(() => previousStep(), [tick, here]); // eslint-disable-line react-hooks/exhaustive-deps
  const backInfo = back ? stepLabel(back, recents) : null;

  const suggestions: (Suggestion & { app: HouseApp })[] = useMemo(() => {
    const urgent = Object.fromEntries(apps.map((a) => [a.href, badgeOf(a)]).filter(([, b]) => b)) as Record<string, BadgeInfo>;
    return suggest({ allowed: apps.map((a) => a.href), exclude: current ? [current.href] : [], urgent, fallback: prefs.pinned.map((a) => a.href), limit: 9 })
      .map((s) => ({ ...s, app: APP_BY_HREF.get(s.href)! }))
      .filter((s) => s.app);
  }, [apps, badgeOf, current, prefs.pinned, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const attention = useMemo(
    () =>
      apps
        .map((a) => ({ app: a, b: badgeOf(a) }))
        .filter((x): x is { app: HouseApp; b: BadgeInfo } => !!x.b && x.b.count > 0 && x.b.tone !== 'neutral' && !x.app.href.includes('?'))
        .sort((a, b) => (a.b.tone === 'red' ? 0 : 1) - (b.b.tone === 'red' ? 0 : 1) || b.b.count - a.b.count)
        .slice(0, 5),
    [apps, badgeOf],
  );

  // Suggestions are habits; what is merely waiting is listed under Needs attention.
  const shown = useMemo(() => {
    const waiting = new Set(attention.map((a) => a.app.href));
    return suggestions.filter((s) => s.learned || !waiting.has(s.href)).slice(0, 6);
  }, [suggestions, attention]);

  const records = useMemo(() => recents.filter((r) => r.kind !== 'app' && r.href !== here).slice(0, 5), [recents, here]);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({ ...g, apps: apps.filter((a) => a.groupId === g.id) })).filter((g) => g.apps.length > 0),
    [apps],
  );

  const term = q.trim();
  const found = useMemo(() => {
    if (!term) return null;
    return {
      apps: apps.filter((a) => matches(term, `${a.name} ${a.fullName} ${a.group}`)).slice(0, 12),
      records: recents.filter((r) => r.kind !== 'app' && matches(term, `${r.label} ${r.detail ?? ''}`)).slice(0, 6),
    };
  }, [term, apps, recents]);

  const go = (href: string) => {
    if (href === here) return onClose();
    router.push(href);
  };
  const goBack = () => {
    if (!back) return;
    if (window.history.length > 1) router.back();
    else router.push(back.path);
  };
  const searchEverything = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('rb:palette', { detail: { q: term } }));
  };

  // Arrow keys move through every item, Escape closes, typing goes to the search box.
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Screen shortcuts stay quiet while the Navigator is open (Ctrl/⌘ combos and `\` still work).
    if (!e.metaKey && !e.ctrlKey && e.key !== '\\') e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (q) setQ('');
      else onClose();
      return;
    }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (at < 0 ? 0 : Math.min(items.length - 1, at + 1)) : at <= 0 ? -1 : at - 1;
      if (next < 0) input.current?.focus();
      else items[next]?.focus();
      return;
    }
    if (e.key === 'Enter' && document.activeElement === input.current) {
      e.preventDefault();
      if (term && found && found.apps.length + found.records.length === 0) searchEverything();
      else items[0]?.click();
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement !== input.current) {
      input.current?.focus();
    }
  };

  const toggleGroup = (id: string) =>
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="no-print fixed inset-0 z-[60]" onKeyDown={onKeyDown}>
      <div aria-hidden className="absolute inset-0 bg-[rgb(10_12_30/0.14)] motion-safe:animate-[rb-fade_160ms_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Navigator"
        className="absolute bottom-[calc(var(--dock-space,0px)+0.75rem)] left-3 top-3 flex w-[min(23.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.35rem] border border-white/40 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] shadow-[0_24px_70px_-16px_rgb(15_23_42/0.55)] backdrop-blur-2xl motion-safe:animate-[rb-nav-in_200ms_cubic-bezier(.2,.8,.2,1)] dark:border-white/10"
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to… an app, a booking, a guest"
            aria-label="Find an app or a recent record"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        {/* Back */}
        {backInfo && !term && (
          <button
            type="button"
            data-nav-item
            onClick={goBack}
            className="mx-2.5 mt-2.5 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left outline-none transition hover:border-line-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--sidebar)] text-white">
              <ArrowLeft className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">Back to {backInfo.label}</span>
              <span className="block truncate text-[11.5px] text-fg-muted">
                {backInfo.detail ? `${backInfo.detail} · ` : ''}
                {ago(back!.at)}
              </span>
            </span>
            <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-fg-subtle sm:block">Alt ←</kbd>
          </button>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
          {found ? (
            <>
              {found.apps.length > 0 && (
                <Section title="Apps">
                  {found.apps.map((a) => (
                    <AppRow key={a.href} app={a} badge={badgeOf(a)} active={current?.href === a.href} onGo={go} detail={a.group} />
                  ))}
                </Section>
              )}
              {found.records.length > 0 && (
                <Section title="Recently opened">
                  {found.records.map((r) => (
                    <RecordRow key={r.href} item={r} onGo={go} />
                  ))}
                </Section>
              )}
              <button
                type="button"
                data-nav-item
                onClick={searchEverything}
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                  <Search className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  Search every booking, guest and room for <span className="font-semibold">“{term}”</span>
                </span>
                <CornerDownLeft className="size-3.5 text-fg-subtle" />
              </button>
            </>
          ) : (
            <>
              {shown.length > 0 && (
                <Section title="Suggested for you" icon={Sparkles}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {shown.map((s) => {
                      const b = badgeOf(s.app);
                      return (
                        <Link
                          key={s.href}
                          href={s.href}
                          data-nav-item
                          title={s.reason}
                          onClick={(e) => {
                            if (s.href === here) {
                              e.preventDefault();
                              onClose();
                            }
                          }}
                          className="group relative flex flex-col items-center gap-1.5 rounded-xl px-1 pb-2 pt-2.5 text-center outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                        >
                          <span className="relative">
                            <AppGlyph app={s.app} size={40} />
                            {b && b.count > 0 && (
                              <span className={cn('absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold tabular ring-2 ring-[var(--surface)]', BADGE_PILL[b.tone])}>{b.count > 99 ? '99+' : b.count}</span>
                            )}
                          </span>
                          <span className="w-full truncate text-[12px] font-semibold leading-tight">{s.app.name}</span>
                          <span className="line-clamp-2 w-full text-[10.5px] leading-snug text-fg-muted">{s.reason}</span>
                        </Link>
                      );
                    })}
                  </div>
                </Section>
              )}

              {attention.length > 0 && (
                <Section title="Needs attention">
                  {attention.map(({ app, b }) => (
                    <Link
                      key={app.href}
                      href={app.href}
                      data-nav-item
                      className="flex items-center gap-3 rounded-xl px-2.5 py-2 outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[b.tone])} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{b.tooltip}</span>
                        <span className="block truncate text-[11px] text-fg-subtle">{app.fullName}</span>
                      </span>
                      <span className={cn('rounded-full px-1.5 text-[10.5px] font-bold tabular', BADGE_PILL[b.tone])}>{b.count}</span>
                    </Link>
                  ))}
                </Section>
              )}

              {records.length > 0 && (
                <Section title="Jump back in" icon={History}>
                  {records.map((r) => (
                    <RecordRow key={r.href} item={r} onGo={go} />
                  ))}
                </Section>
              )}

              <Section title="All apps" icon={LayoutGrid}>
                {groups.map((g) => {
                  const isOpen = openGroups.has(g.id);
                  const count = g.apps.reduce((n, a) => n + (badgeOf(a)?.tone !== 'neutral' ? (badgeOf(a)?.count ?? 0) : 0), 0);
                  const holdsHere = current?.groupId === g.id;
                  return (
                    <div key={g.id}>
                      <button
                        type="button"
                        data-nav-item
                        aria-expanded={isOpen}
                        onClick={() => toggleGroup(g.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                      >
                        <g.icon className={cn('size-4 shrink-0', holdsHere ? 'text-accent' : 'text-fg-muted')} />
                        <span className={cn('flex-1 truncate text-[13px] font-semibold', holdsHere && 'text-accent')}>{g.label}</span>
                        {!isOpen && count > 0 && <span className="rounded-full bg-warning px-1.5 text-[10.5px] font-bold tabular text-white">{count}</span>}
                        <span className="text-[11px] text-fg-subtle">{g.apps.length}</span>
                        <ChevronDown className={cn('size-3.5 text-fg-subtle transition-transform', isOpen && 'rotate-180')} />
                      </button>
                      {isOpen && (
                        <div className="mb-1 ml-3 border-l border-line pl-1.5">
                          {g.apps.map((a) => (
                            <AppRow key={a.href} app={a} badge={badgeOf(a)} active={current?.href === a.href} onGo={go} compact />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 border-t border-line px-2.5 py-2 text-[11.5px]">
          <FooterButton icon={PanelLeft} label="Full sidebar" hint={`${mod()} B`} onClick={() => { onClose(); shellAction('sidebar'); }} />
          <FooterButton icon={Settings2} label="Customise" onClick={() => go('/?customise=1')} />
          <FooterButton icon={Keyboard} label="Keys" hint="?" onClick={() => { onClose(); shellAction('shortcuts'); }} />
          <span className="ml-auto pr-1 text-fg-subtle">
            <kbd className="rounded border border-line px-1 font-sans">\</kbd> opens this
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <p className="mb-1 flex items-center gap-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
        {Icon && <Icon className="size-3" />}
        {title}
      </p>
      {children}
    </section>
  );
}

function AppRow({ app, badge, active, onGo, detail, compact }: { app: HouseApp; badge?: BadgeInfo; active?: boolean; onGo: (href: string) => void; detail?: string; compact?: boolean }) {
  return (
    <Link
      href={app.href}
      data-nav-item
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (active) {
          e.preventDefault();
          onGo(app.href);
        }
      }}
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-2 outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
        compact ? 'py-1.5' : 'py-2',
        active && 'bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]',
      )}
    >
      <AppGlyph app={app} size={compact ? 24 : 30} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px]', active ? 'font-semibold text-accent' : 'font-medium')}>{app.fullName}</span>
        {detail && <span className="block truncate text-[11px] text-fg-subtle">{detail}</span>}
      </span>
      {active && <span className="text-[10.5px] font-semibold text-accent">Here</span>}
      {badge && badge.count > 0 && <span className={cn('rounded-full px-1.5 text-[10.5px] font-bold tabular', BADGE_PILL[badge.tone])}>{badge.count > 99 ? '99+' : badge.count}</span>}
    </Link>
  );
}

function RecordRow({ item, onGo }: { item: RecentItem; onGo: (href: string) => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Link
      href={item.href}
      data-nav-item
      onClick={(e) => {
        e.preventDefault();
        onGo(item.href);
      }}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{item.label}</span>
        <span className="block truncate text-[11px] text-fg-subtle">{item.detail}</span>
      </span>
      <span className="shrink-0 text-[10.5px] text-fg-subtle">{ago(item.at)}</span>
    </Link>
  );
}

function FooterButton({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--focus)]" title={hint ? `${label} (${hint})` : label}>
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
