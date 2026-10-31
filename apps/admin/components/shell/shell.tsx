'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  Menu,
  Moon,
  Search,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import type { AdminPulseDTO } from '@reberon/contracts';
import { get, post, WEB_URL } from '@/lib/api';
import { MeProvider, useMeQuery } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { ConfirmProvider } from '@/components/ui/confirm';
import { Kbd, Skeleton } from '@/components/ui/bits';
import { NAV, type NavBadgeKey } from './nav';
import { CommandPalette } from './command-palette';
import { WebsiteHealth } from './website-health';

export interface BadgeInfo {
  count: number;
  tone: 'red' | 'green';
  tooltip: string;
}

export function useAdminPulse(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-pulse'],
    queryFn: () => get<AdminPulseDTO>('/pulse'),
    enabled,
    refetchInterval: 25_000,
  });
}

function computeBadges(pulse?: AdminPulseDTO): Partial<Record<NavBadgeKey, BadgeInfo>> {
  if (!pulse) return {};
  const map: Partial<Record<NavBadgeKey, BadgeInfo>> = {};

  // 1. Command & Comms
  if (pulse.inbox.newCount > 0) {
    map.inbox = {
      count: pulse.inbox.newCount,
      tone: 'red',
      tooltip: `${pulse.inbox.newCount} new unread enquiries (${pulse.inbox.openCount} open total)`,
    };
  } else if (pulse.inbox.openCount > 0) {
    map.inbox = {
      count: pulse.inbox.openCount,
      tone: 'green',
      tooltip: `${pulse.inbox.openCount} active threads · all new enquiries triaged`,
    };
  }

  if (pulse.waitlist.newCount > 0) {
    map.waitlist = {
      count: pulse.waitlist.newCount,
      tone: 'red',
      tooltip: `${pulse.waitlist.newCount} uncontacted first-stay signups (${pulse.waitlist.totalActive} active)`,
    };
  } else if (pulse.waitlist.totalActive > 0) {
    map.waitlist = {
      count: pulse.waitlist.totalActive,
      tone: 'green',
      tooltip: `${pulse.waitlist.totalActive} waitlist signups contacted`,
    };
  }

  if (pulse.cms.failedOutboundMessages24h > 0) {
    map.messages = {
      count: pulse.cms.failedOutboundMessages24h,
      tone: 'red',
      tooltip: `${pulse.cms.failedOutboundMessages24h} failed outbound messages in the last 24h`,
    };
  }

  // 2. Front Desk & Stays
  const deskActionCount =
    pulse.desk.arrivalsToday +
    pulse.desk.lateArrivals +
    pulse.desk.departuresToday +
    pulse.desk.pendingGuestRequests;
  if (deskActionCount > 0) {
    map.desk = {
      count: deskActionCount,
      tone: 'red',
      tooltip: `${pulse.desk.arrivalsToday} arrivals, ${pulse.desk.departuresToday} departures, ${pulse.desk.lateArrivals} late, ${pulse.desk.pendingGuestRequests} guest requests`,
    };
  } else if (pulse.desk.inHouse > 0) {
    map.desk = {
      count: pulse.desk.inHouse,
      tone: 'green',
      tooltip: `${pulse.desk.inHouse} stays (${pulse.desk.guestsInHouse} guests) currently in-house`,
    };
  }

  if (pulse.reservations.heldCount > 0) {
    map.reservations = {
      count: pulse.reservations.heldCount,
      tone: 'red',
      tooltip: `${pulse.reservations.heldCount} held booking(s) awaiting payment · ${pulse.reservations.confirmedCount} confirmed`,
    };
  } else if (pulse.reservations.confirmedCount > 0) {
    map.reservations = {
      count: pulse.reservations.confirmedCount,
      tone: 'green',
      tooltip: `${pulse.reservations.confirmedCount} confirmed reservation(s)`,
    };
  }

  if (pulse.rooms.totalActive > 0) {
    if (pulse.rooms.vacantClean === 0) {
      map.rack = {
        count: pulse.rooms.occupied,
        tone: 'red',
        tooltip: `0 vacant clean rooms ready · ${pulse.rooms.occupied} occupied`,
      };
    } else {
      map.rack = {
        count: pulse.rooms.vacantClean,
        tone: 'green',
        tooltip: `${pulse.rooms.vacantClean} room(s) vacant clean & ready to sell`,
      };
    }
  }

  const hkAttention = pulse.rooms.vacantDirty + pulse.rooms.hkTodoCount + pulse.rooms.hkDoneToInspect;
  if (hkAttention > 0) {
    map.housekeeping = {
      count: hkAttention,
      tone: 'red',
      tooltip: `${pulse.rooms.vacantDirty} dirty room(s), ${pulse.rooms.hkTodoCount} task(s) to clean, ${pulse.rooms.hkDoneToInspect} awaiting inspection`,
    };
  } else if (pulse.rooms.vacantClean > 0) {
    map.housekeeping = {
      count: pulse.rooms.vacantClean,
      tone: 'green',
      tooltip: `All rooms clean (${pulse.rooms.vacantClean} ready)`,
    };
  }

  if (pulse.feedback.openIssues > 0) {
    map.feedback = {
      count: pulse.feedback.openIssues,
      tone: 'red',
      tooltip: `${pulse.feedback.openIssues} unresolved guest feedback issue(s)`,
    };
  } else if (pulse.feedback.goodCount > 0) {
    map.feedback = {
      count: pulse.feedback.goodCount,
      tone: 'green',
      tooltip: `${pulse.feedback.goodCount} positive guest reviews · 0 open issues`,
    };
  }

  // 3. Revenue & Billing
  if (pulse.desk.lateArrivals > 0) {
    map.brief = {
      count: pulse.desk.lateArrivals,
      tone: 'red',
      tooltip: `${pulse.desk.lateArrivals} overdue arrival(s) needing follow-up`,
    };
  } else if (pulse.finance.clearedTodayCount > 0) {
    map.brief = {
      count: pulse.finance.clearedTodayCount,
      tone: 'green',
      tooltip: `${pulse.finance.clearedTodayCount} payment(s) cleared today`,
    };
  }

  if (pulse.finance.receiptsIssuedToday > 0) {
    map.receipts = {
      count: pulse.finance.receiptsIssuedToday,
      tone: 'green',
      tooltip: `${pulse.finance.receiptsIssuedToday} official document(s) issued today`,
    };
  }

  if (pulse.finance.pendingQuotations > 0) {
    map.quotations = {
      count: pulse.finance.pendingQuotations,
      tone: 'red',
      tooltip: `${pulse.finance.pendingQuotations} draft/sent quotation(s) awaiting client confirmation`,
    };
  } else if (pulse.finance.acceptedQuotations > 0) {
    map.quotations = {
      count: pulse.finance.acceptedQuotations,
      tone: 'green',
      tooltip: `${pulse.finance.acceptedQuotations} accepted/converted event quotation(s)`,
    };
  }

  // 4. Operations & POS
  if (pulse.operations.posOpenOrders > 0) {
    map.pos = {
      count: pulse.operations.posOpenOrders,
      tone: 'red',
      tooltip: `${pulse.operations.posOpenOrders} active kitchen/bar order(s) in preparation`,
    };
  } else if (pulse.operations.posCompletedToday > 0) {
    map.pos = {
      count: pulse.operations.posCompletedToday,
      tone: 'green',
      tooltip: `${pulse.operations.posCompletedToday} POS order(s) settled today`,
    };
  }

  if (pulse.operations.healthClubInsideNow > 0) {
    map.healthclub = {
      count: pulse.operations.healthClubInsideNow,
      tone: 'green',
      tooltip: `${pulse.operations.healthClubInsideNow} guest(s) currently checked into Health Club & Spa`,
    };
  } else if (pulse.operations.healthClubActiveMembers > 0) {
    map.healthclub = {
      count: pulse.operations.healthClubActiveMembers,
      tone: 'green',
      tooltip: `${pulse.operations.healthClubActiveMembers} active Health Club membership(s)`,
    };
  }

  if (pulse.operations.lowStockCount > 0) {
    map.inventory = {
      count: pulse.operations.lowStockCount,
      tone: 'red',
      tooltip: `${pulse.operations.lowStockCount} inventory item(s) at or below reorder par level`,
    };
  } else if (pulse.operations.totalInventoryItems > 0) {
    map.inventory = {
      count: pulse.operations.totalInventoryItems,
      tone: 'green',
      tooltip: `${pulse.operations.totalInventoryItems} tracked SKUs · all above par level`,
    };
  }

  if (pulse.operations.pendingRequisitions > 0) {
    map.requisitions = {
      count: pulse.operations.pendingRequisitions,
      tone: 'red',
      tooltip: `${pulse.operations.pendingRequisitions} requisition(s) awaiting approval (${pulse.operations.urgentRequisitions} urgent)`,
    };
  } else if (pulse.operations.pinnedAnnouncements > 0) {
    map.requisitions = {
      count: pulse.operations.pinnedAnnouncements,
      tone: 'green',
      tooltip: `${pulse.operations.pinnedAnnouncements} pinned staff announcement(s)`,
    };
  }

  // 5. Human Resources
  if (pulse.hr.activeStaff > 0) {
    map.staff = {
      count: pulse.hr.activeStaff,
      tone: 'green',
      tooltip: `${pulse.hr.activeStaff} active staff member(s)`,
    };
  }
  if (pulse.hr.departmentsCount > 0) {
    map.departments = {
      count: pulse.hr.departmentsCount,
      tone: 'green',
      tooltip: `${pulse.hr.departmentsCount} active hotel cost centers`,
    };
  }
  if (pulse.hr.shiftsToday > 0) {
    map.shifts = {
      count: pulse.hr.shiftsToday,
      tone: 'green',
      tooltip: `${pulse.hr.shiftsToday} shift(s) scheduled today`,
    };
  }
  if (pulse.hr.pendingLeaves > 0) {
    map.leave = {
      count: pulse.hr.pendingLeaves,
      tone: 'red',
      tooltip: `${pulse.hr.pendingLeaves} leave request(s) pending review`,
    };
  }
  if (pulse.hr.draftPayrolls > 0) {
    map.payroll = {
      count: pulse.hr.draftPayrolls,
      tone: 'red',
      tooltip: `${pulse.hr.draftPayrolls} draft payroll record(s) awaiting disbursement`,
    };
  }

  // 6. Website CMS
  if (pulse.cms.unpublishedPages > 0) {
    map.publishing = {
      count: pulse.cms.unpublishedPages,
      tone: 'red',
      tooltip: `${pulse.cms.unpublishedPages} page(s) have unpublished draft changes`,
    };
  } else if (pulse.cms.publishedPages > 0) {
    map.publishing = {
      count: pulse.cms.publishedPages,
      tone: 'green',
      tooltip: `All ${pulse.cms.publishedPages} pages published & live`,
    };
  }

  return map;
}

function NavBadge({ badge, compact = false }: { badge?: BadgeInfo; compact?: boolean }) {
  if (!badge || badge.count <= 0) return null;
  const isRed = badge.tone === 'red';
  return (
    <span
      title={badge.tooltip}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full font-bold tabular leading-none transition-all',
        compact ? 'h-4 min-w-4 px-1 text-[9.5px]' : 'h-4.5 min-w-[1.25rem] px-1.5 text-[10px]',
        isRed
          ? 'bg-rose-500 text-white shadow-[0_1px_6px_rgba(244,63,94,0.45)] ring-1 ring-rose-400/50'
          : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40',
      )}
    >
      {isRed && !compact && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
      {badge.count}
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  const { data: me } = useMeQuery();
  const { data: pulse } = useAdminPulse(!!me);
  const badges = useMemo(() => computeBadges(pulse), [pulse]);
  const can = (p: string) => !!me?.permissions.includes(p);

  const isItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href.includes('?')) {
      const [basePath, qs] = href.split('?');
      const params = new URLSearchParams(qs);
      return pathname === basePath && currentTab === params.get('tab');
    }
    if (href === '/hr') {
      return pathname === '/hr' && !currentTab;
    }
    if (href === '/inventory') {
      return pathname === '/inventory';
    }
    if (href === '/settings') {
      return pathname === '/settings';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Collapsible group state persisted in localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of NAV) {
      initial[g.id] = g.defaultOpen ?? true;
    }
    return initial;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rb-admin-sidebar-groups');
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setOpenGroups((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Automatically ensure the group containing the active route is expanded
  useEffect(() => {
    for (const g of NAV) {
      if (g.items.some((i) => isItemActive(i.href))) {
        setOpenGroups((prev) => (prev[g.id] ? prev : { ...prev, [g.id]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentTab]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('rb-admin-sidebar-groups', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const visibleGroups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.perm || can(i.perm)),
  })).filter((g) => g.items.length > 0);

  const allExpanded = visibleGroups.every((g) => openGroups[g.id]);
  const toggleAllGroups = () => {
    const nextState = !allExpanded;
    const next: Record<string, boolean> = {};
    for (const g of visibleGroups) next[g.id] = nextState;
    setOpenGroups(next);
    try {
      localStorage.setItem('rb-admin-sidebar-groups', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Total red urgent badges vs green active badges across visible items
  const totals = useMemo(() => {
    let red = 0;
    let green = 0;
    for (const g of visibleGroups) {
      for (const item of g.items) {
        const b = item.badge ? badges[item.badge] : undefined;
        if (!b) continue;
        if (b.tone === 'red') red += b.count;
        else green += b.count;
      }
    }
    return { red, green };
  }, [visibleGroups, badges]);

  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] select-none">
      {/* Brand Header */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-white/8 px-3.5">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5">
          <svg viewBox="0 0 40 24" className="h-4.5 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
            <path d="M1 22 L11 9 L16 14 L24 3 L39 22" />
            <circle cx="30" cy="6" r="2.2" fill="#e0a54b" stroke="none" />
          </svg>
          <span className="leading-none">
            <span className="block text-[14px] font-bold tracking-tight text-white">Reberon</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">The House</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleAllGroups}
          title={allExpanded ? 'Collapse sidebar sections' : 'Expand all sidebar sections'}
          className="grid size-7 place-items-center rounded-md text-[var(--sidebar-muted)] transition-colors hover:bg-white/8 hover:text-white"
        >
          {allExpanded ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
        </button>
      </div>

      {/* Live Notification Summary Strip */}
      <div className="flex items-center justify-between gap-1.5 border-b border-white/8 bg-white/[0.03] px-3 py-2 text-[10.5px]">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-[var(--sidebar-muted)] transition hover:bg-white/5 hover:text-white"
          title="Items needing staff attention across the House"
        >
          <span className={cn('size-2 rounded-full', totals.red > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400')} />
          <span className="font-semibold text-white tabular">{totals.red}</span>
          <span>action{totals.red === 1 ? '' : 's'}</span>
        </Link>
        <span className="text-white/15">•</span>
        <div
          className="flex items-center gap-1.5 px-1.5 py-0.5 text-[var(--sidebar-muted)]"
          title="Active operational counts (ready rooms, in-house stays, active staff)"
        >
          <span className="size-2 rounded-full bg-emerald-400" />
          <span className="font-semibold text-emerald-300 tabular">{totals.green}</span>
          <span>active</span>
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-2 py-2.5" aria-label="Main">
        {visibleGroups.map((g) => {
          const isOpen = !!openGroups[g.id];
          const hasActiveChild = g.items.some((i) => isItemActive(i.href));

          // Group-level badge rollup
          let groupRed = 0;
          let groupGreen = 0;
          for (const i of g.items) {
            const b = i.badge ? badges[i.badge] : undefined;
            if (!b) continue;
            if (b.tone === 'red') groupRed += b.count;
            else groupGreen += b.count;
          }

          return (
            <div
              key={g.id}
              className={cn(
                'rounded-lg transition-colors',
                isOpen ? 'bg-white/[0.02]' : 'hover:bg-white/[0.03]',
              )}
            >
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                  hasActiveChild ? 'text-white' : 'text-[var(--sidebar-muted)] hover:text-white',
                )}
              >
                <g.icon className={cn('size-3.5 shrink-0 transition-colors', hasActiveChild ? 'text-amber-400' : 'opacity-75 group-hover:opacity-100')} strokeWidth={1.8} />
                <span className="flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.11em]">
                  {g.label}
                </span>
                {groupRed > 0 && (
                  <NavBadge
                    compact
                    badge={{
                      count: groupRed,
                      tone: 'red',
                      tooltip: `${groupRed} urgent item(s) in ${g.label}`,
                    }}
                  />
                )}
                {!isOpen && groupRed === 0 && groupGreen > 0 && (
                  <NavBadge
                    compact
                    badge={{
                      count: groupGreen,
                      tone: 'green',
                      tooltip: `${groupGreen} active item(s) in ${g.label}`,
                    }}
                  />
                )}
                {isOpen ? (
                  <ChevronDown className="size-3 shrink-0 opacity-60" />
                ) : (
                  <ChevronRight className="size-3 shrink-0 opacity-60" />
                )}
              </button>

              {isOpen && (
                <ul className="mt-0.5 grid gap-0.5 pb-1 pl-2 pr-1">
                  {g.items.map((i) => {
                    const active = isItemActive(i.href);
                    const badge = i.badge ? badges[i.badge] : undefined;
                    if (i.later) {
                      return (
                        <li
                          key={i.label}
                          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--sidebar-muted)]/70"
                          title={`Arrives in Movement ${i.later}`}
                        >
                          <i.icon className="size-3.5 opacity-60" strokeWidth={1.7} />
                          <span className="flex-1 truncate">{i.label}</span>
                          <span className="rounded border border-white/10 px-1 text-[9.5px] font-semibold">{i.later}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-all',
                            active
                              ? 'bg-[var(--sidebar-active)] text-white font-semibold shadow-xs'
                              : 'text-[var(--sidebar-fg)]/85 hover:bg-white/6 hover:text-white',
                          )}
                        >
                          {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-amber-400" />}
                          <i.icon className={cn('size-3.5 shrink-0', active ? 'text-amber-300' : 'opacity-80')} strokeWidth={1.75} />
                          <span className="flex-1 truncate">{i.label}</span>
                          <NavBadge badge={badge} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Links: Sipi Concierge + Public Website */}
      <div className="grid gap-1.5 border-t border-white/8 p-2.5">
        <a
          href={`${WEB_URL}/concierge`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[12px] font-medium text-amber-200 transition hover:border-amber-400/40 hover:bg-amber-400/12 hover:text-white"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>Sipi AI Concierge</span>
          </span>
          <ExternalLink className="size-3 opacity-75" />
        </a>
        <a
          href={WEB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-[12px] text-[var(--sidebar-muted)] transition hover:border-white/20 hover:bg-white/5 hover:text-white"
        >
          <span>View public website</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<div className="h-full bg-[var(--sidebar)]" />}>
      <SidebarContent onNavigate={onNavigate} />
    </Suspense>
  );
}

function AccountMenu() {
  const { data: me } = useMeQuery();
  const { data: pulse } = useAdminPulse(!!me);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute('data-theme') === 'dark'), []);
  if (!me) return <Skeleton className="size-9 rounded-full" />;
  const initials = me.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rb-admin-theme', next);
    setDark(!dark);
  };

  const urgentTotal =
    (pulse?.inbox.newCount ?? 0) +
    (pulse?.waitlist.newCount ?? 0) +
    (pulse?.desk.arrivalsToday ?? 0) +
    (pulse?.desk.lateArrivals ?? 0) +
    (pulse?.desk.pendingGuestRequests ?? 0) +
    (pulse?.rooms.vacantDirty ?? 0) +
    (pulse?.operations.posOpenOrders ?? 0) +
    (pulse?.operations.pendingRequisitions ?? 0) +
    (pulse?.hr.pendingLeaves ?? 0);

  return (
    <div className="flex items-center gap-2">
      {pulse && (
        <div className="hidden items-center gap-1.5 md:flex">
          {urgentTotal > 0 ? (
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-[11.5px] font-semibold text-danger transition hover:bg-rose-500/15"
              title="Items requiring attention today"
            >
              <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="tabular">{urgentTotal}</span>
              <span>Action Required</span>
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11.5px] font-semibold text-success transition hover:bg-emerald-500/15"
              title="All house queues clear"
            >
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>All Clear</span>
            </Link>
          )}
          {pulse.rooms.totalActive > 0 && (
            <Link
              href="/rack"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-semibold text-fg-muted transition hover:border-line-strong hover:text-fg"
              title="Vacant clean rooms ready for check-in"
            >
              <span className={cn('size-2 rounded-full', pulse.rooms.vacantClean > 0 ? 'bg-emerald-500' : 'bg-rose-500')} />
              <span className="tabular font-bold text-fg">{pulse.rooms.vacantClean}</span>
              <span>/ {pulse.rooms.totalActive} clean</span>
            </Link>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-semibold text-fg hover:bg-surface-2"
        title={dark ? 'Switch to Light theme' : 'Switch to Dark theme'}
      >
        {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
      </button>
      <div className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-surface-2" aria-expanded={open}>
          <span className="grid size-8 place-items-center rounded-full bg-fg text-[12px] font-semibold text-bg">{initials}</span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-semibold">{me.name}</span>
            <span className="block text-[11px] capitalize text-fg-subtle">{me.role.toLowerCase()}</span>
          </span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="fade-in absolute right-0 top-12 z-50 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)]">
              <div className="border-b border-line px-3 py-2">
                <p className="truncate text-[12.5px] font-semibold text-fg">{me.name}</p>
                <p className="truncate text-[11.5px] text-fg-subtle">{me.email}</p>
                <span className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {me.role}
                </span>
              </div>
              <Link href="/account" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
                <UserRound className="size-4" /> Your account
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-surface-2"
                onClick={toggleTheme}
              >
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} {dark ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10"
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.25rem_1fr]">
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
