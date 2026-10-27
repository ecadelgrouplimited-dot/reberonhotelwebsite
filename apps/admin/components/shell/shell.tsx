'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LogOut, Menu, Moon, Search, Sun, UserRound, X } from 'lucide-react';
import { get, post, WEB_URL } from '@/lib/api';
import { MeProvider, useMeQuery } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { ConfirmProvider } from '@/components/ui/confirm';
import { Kbd, Skeleton } from '@/components/ui/bits';
import { NAV } from './nav';
import { CommandPalette } from './command-palette';
import { WebsiteHealth } from './website-health';

function useBadges(enabled: boolean, canContent: boolean) {
  const inbox = useQuery({ queryKey: ['badge', 'inbox'], queryFn: () => get<{ counts: Record<string, number> }>('/conversations?limit=1'), enabled, refetchInterval: 60_000 });
  const wl = useQuery({ queryKey: ['badge', 'waitlist'], queryFn: () => get<{ counts: Record<string, number> }>('/waitlist?status=NEW'), enabled, refetchInterval: 120_000 });
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => get<{ hasUnpublishedChanges: boolean; status: string }[]>('/pages'), enabled: canContent, refetchInterval: 120_000 });
  return { inbox: inbox.data?.counts.NEW ?? 0, waitlist: wl.data?.counts.NEW ?? 0, publishing: pages.data?.filter((p) => p.hasUnpublishedChanges && p.status !== 'SCHEDULED').length ?? 0 };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMeQuery();
  const badges = useBadges(!!me?.permissions.includes('inbox:read'), !!me?.permissions.includes('content:read'));
  const can = (p: string) => !!me?.permissions.includes(p);
  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
      <Link href="/" onClick={onNavigate} className="flex h-13 shrink-0 items-center gap-2.5 border-b border-white/5 px-4">
        <svg viewBox="0 0 40 24" className="h-4.5 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
          <path d="M1 22 L11 9 L16 14 L24 3 L39 22" />
          <circle cx="30" cy="6" r="2.2" fill="#e0a54b" stroke="none" />
        </svg>
        <span className="leading-none">
          <span className="block text-[14px] font-bold tracking-tight text-mist-50">Reberon</span>
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">The House</span>
        </span>
      </Link>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Main">
        {NAV.map((g, gi) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={gi} className="mt-3.5 first:mt-2">
              {g.label && <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sidebar-muted)]">{g.label}</p>}
              <ul className="grid gap-0.5">
                {items.map((i) => {
                  const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href) && (i.href !== '/settings' || pathname === '/settings');
                  const count = i.badge ? badges[i.badge] : 0;
                  if (i.later) {
                    return (
                      <li key={i.label} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-[var(--sidebar-muted)]/70" title={`Arrives in Movement ${i.later}`}>
                        <i.icon className="size-3.5 opacity-60" strokeWidth={1.7} />
                        <span className="flex-1">{i.label}</span>
                        <span className="rounded border border-white/10 px-1 text-[9.5px] font-semibold">{i.later}</span>
                      </li>
                    );
                  }
                  return (
                    <li key={i.label}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn('relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors', active ? 'bg-[var(--sidebar-active)] text-white font-semibold' : 'hover:bg-white/5 hover:text-white')}
                      >
                        {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
                        <i.icon className="size-3.5" strokeWidth={1.7} />
                        <span className="flex-1 truncate">{i.label}</span>
                        {count > 0 && <span className="min-w-4.5 rounded bg-accent px-1 text-center text-[10.5px] font-semibold tabular text-white">{count}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <a href={WEB_URL} target="_blank" rel="noopener noreferrer" className="mx-3 mb-4 flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-[12.5px] text-[var(--sidebar-muted)] hover:text-white">
        View the website <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

function AccountMenu() {
  const { data: me } = useMeQuery();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute('data-theme') === 'dark'), []);
  if (!me) return <Skeleton className="size-9 rounded-full" />;
  const initials = me.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-surface-2" aria-expanded={open}>
        <span className="grid size-8 place-items-center rounded-full bg-moss-700 text-[12px] font-semibold text-mist-50">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold">{me.name}</span>
          <span className="block text-[11px] capitalize text-fg-subtle">{me.role.toLowerCase()}</span>
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fade-in absolute right-0 top-12 z-50 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]">
            <p className="truncate px-3 py-2 text-[12px] text-fg-subtle">{me.email}</p>
            <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2">
              <UserRound className="size-4" /> Your account
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2"
              onClick={() => {
                const next = dark ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('rb-admin-theme', next);
                setDark(!dark);
              }}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} {dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-danger hover:bg-danger/5"
              onClick={async () => {
                await post('/auth/logout').catch(() => undefined);
                qc.clear();
                router.replace('/login');
              }}
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, isError } = useMeQuery();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isError) router.replace('/login?expired=1');
  }, [isError, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="fade-in absolute inset-y-0 left-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute -right-12 top-3 grid size-10 place-items-center rounded-full bg-white/90 text-basalt-950" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-13 items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 backdrop-blur-lg sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-4" />
          </button>
          <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[12.5px] text-fg-subtle hover:border-line-strong">
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Jump to page or search…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </header>
        {me && (
          <MeProvider me={me}>
            <WebsiteHealth />
          </MeProvider>
        )}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
          {me ? (
            <MeProvider me={me}>
              <ConfirmProvider>{children}</ConfirmProvider>
            </MeProvider>
          ) : (
            <div className="grid gap-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
          )}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
