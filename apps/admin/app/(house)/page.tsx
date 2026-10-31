'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  BookOpenText,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ConciergeBell,
  Dumbbell,
  FileSpreadsheet,
  Inbox,
  LayoutGrid,
  ListChecks,
  Megaphone,
  MessageCircleHeart,
  Plus,
  Radio,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Sunset,
  TrendingUp,
  UserCheck,
  UserRoundPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type {
  AdminPulseDTO,
  DashboardDTO,
  DeskBoardDTO,
  HkBoardDTO,
  HrDashboardDTO,
  RequisitionDTO,
  StaffAnnouncementDTO,
} from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange, dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Section, Skeleton, Status } from '@/components/ui/bits';
import { BarList, ColumnChart } from '@/components/charts/charts';

const CHANNEL: Record<string, string> = {
  WEB_FORM: 'Website',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PHONE: 'Phone',
};

type DashboardLens = 'ALL' | 'EXECUTIVE' | 'DESK' | 'HOUSEKEEPING' | 'OPERATIONS' | 'HR_COMMS';

interface QuickAction {
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  badgeCount?: number;
  badgeTone?: 'red' | 'green';
}

function StatusBadgePill({
  count,
  tone,
  label,
}: {
  count?: number;
  tone: 'red' | 'green' | 'amber' | 'neutral';
  label: string;
}) {
  const dot = {
    red: 'bg-rose-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    neutral: 'bg-fg-subtle',
  }[tone];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-fg tabular">
      <span className={cn('size-1.5 rounded-full shrink-0', dot)} />
      {count !== undefined && <span className="font-semibold">{count}</span>}
      <span>{label}</span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  href,
  icon: Icon,
  badge,
}: {
  label: string;
  value: string | number;
  sub: string;
  href: string;
  icon: LucideIcon;
  badge?: { text: string; tone: 'red' | 'green' | 'amber' | 'neutral' };
}) {
  const dotCls = badge
    ? {
        red: 'bg-rose-500',
        green: 'bg-emerald-500',
        amber: 'bg-amber-500',
        neutral: 'bg-fg-subtle',
      }[badge.tone]
    : '';

  return (
    <Link
      href={href}
      className="card group flex flex-col justify-between p-3.5 transition-all hover:border-line-strong hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
          <Icon className="size-3.5 text-fg-muted transition-colors group-hover:text-fg" strokeWidth={1.8} />
          {label}
        </span>
        {badge && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-fg tabular">
            <span className={cn('size-1.5 rounded-full shrink-0', dotCls)} />
            {badge.text}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <p className="display text-2xl font-bold tracking-tight text-fg tabular">{value}</p>
        <ArrowRight className="size-3.5 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <p className="mt-1 truncate text-[11.5px] text-fg-muted">{sub}</p>
    </Link>
  );
}

export default function Today() {
  const me = useMe();
  const can = useCan();

  const canDashboard = can('dashboard:view');
  const canInbox = can('inbox:read');
  const canWaitlist = can('waitlist:read');
  const canContent = can('content:read');
  const canDesk = can('desk:operate');
  const canBookings = can('bookings:read');
  const canRooms = can('rooms:status');
  const canPos = can('pos:operate');
  const canInv = can('inventory:manage');
  const canReq = can('requisitions:request');
  const canReports = can('reports:read');

  // Default lens tailored to user's role
  const defaultLens: DashboardLens =
    me.role === 'HOUSEKEEPING' && !canDesk ? 'HOUSEKEEPING' : 'ALL';
  const [lens, setLens] = useState<DashboardLens>(defaultLens);
  const [deskTab, setDeskTab] = useState<'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES'>('ARRIVALS');

  // 1. Unified fast pulse (works for all authenticated roles)
  const { data: pulse, isLoading: pulseLoading, refetch: refetchPulse, isFetching: pulseFetching } = useQuery({
    queryKey: ['admin-pulse'],
    queryFn: () => get<AdminPulseDTO>('/pulse'),
    refetchInterval: 25_000,
  });

  // 2. Dashboard charts & threads (when permitted)
  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get<DashboardDTO>('/dashboard'),
    refetchInterval: 45_000,
    enabled: canDashboard && (canInbox || canWaitlist || canContent),
  });

  // 3. Front Desk live board (when permitted)
  const { data: deskBoard } = useQuery({
    queryKey: ['desk-board-today'],
    queryFn: () => get<DeskBoardDTO>('/desk'),
    refetchInterval: 30_000,
    enabled: canDesk,
  });

  // 4. Housekeeping board (when permitted)
  const { data: hkBoard } = useQuery({
    queryKey: ['hk-board-today'],
    queryFn: () => get<HkBoardDTO>('/housekeeping'),
    refetchInterval: 30_000,
    enabled: canRooms,
  });

  // 5. HR overview (when permitted)
  const { data: hrOverview } = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => get<HrDashboardDTO>('/hr/overview'),
    refetchInterval: 60_000,
    enabled: canInv,
  });

  // 6. Pending requisitions & announcements
  const { data: requisitions } = useQuery({
    queryKey: ['requisitions-dash'],
    queryFn: () => get<RequisitionDTO[]>('/requisitions'),
    refetchInterval: 45_000,
    enabled: canReq,
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => get<StaffAnnouncementDTO[]>('/announcements'),
    refetchInterval: 60_000,
    enabled: canDashboard,
  });

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  }).format(new Date());

  const roleBadgeLabel: Record<string, string> = {
    OWNER: 'Proprietor & Executive View',
    MANAGER: 'General Manager Command',
    DESK: 'Front Desk & Guest Services',
    HOUSEKEEPING: 'Housekeeping & Room Readiness',
  };

  // Build role-aware priority quick actions with live red/green badges
  const criticalActions: QuickAction[] = [
    ...(canDesk
      ? [
          {
            label: 'Front Desk',
            sub: 'Check-in, assign & departures',
            href: '/desk',
            icon: ConciergeBell,
            badgeCount:
              (pulse?.desk.arrivalsToday ?? 0) +
              (pulse?.desk.departuresToday ?? 0) +
              (pulse?.desk.lateArrivals ?? 0) ||
              (pulse?.desk.inHouse ?? 0),
            badgeTone:
              ((pulse?.desk.arrivalsToday ?? 0) +
                (pulse?.desk.departuresToday ?? 0) +
                (pulse?.desk.lateArrivals ?? 0) >
              0
                ? 'red'
                : 'green') as 'red' | 'green',
          },
        ]
      : []),
    ...(canBookings
      ? [
          {
            label: 'Reservations',
            sub: 'Bookings, holds & folios',
            href: '/reservations?sort=latest',
            icon: BookOpenText,
            badgeCount: (pulse?.reservations.heldCount ?? 0) || (pulse?.reservations.confirmedCount ?? 0),
            badgeTone: ((pulse?.reservations.heldCount ?? 0) > 0 ? 'red' : 'green') as 'red' | 'green',
          },
        ]
      : []),
    ...(can('bookings:write')
      ? [
          {
            label: 'New Walk-In / Stay',
            sub: 'Instant booking & hold',
            href: '/reservations/new?walkin=1',
            icon: UserRoundPlus,
          },
        ]
      : []),
    ...(canRooms
      ? [
          {
            label: 'Room Rack',
            sub: 'Live room status & blocks',
            href: '/rack',
            icon: LayoutGrid,
            badgeCount: pulse?.rooms.vacantClean ?? 0,
            badgeTone: ((pulse?.rooms.vacantClean ?? 0) > 0 ? 'green' : 'red') as 'red' | 'green',
          },
          {
            label: 'Housekeeping',
            sub: 'Cleaning & room inspection',
            href: '/housekeeping',
            icon: SprayCan,
            badgeCount:
              (pulse?.rooms.vacantDirty ?? 0) +
              (pulse?.rooms.hkTodoCount ?? 0) +
              (pulse?.rooms.hkDoneToInspect ?? 0) ||
              (pulse?.rooms.vacantClean ?? 0),
            badgeTone:
              ((pulse?.rooms.vacantDirty ?? 0) +
                (pulse?.rooms.hkTodoCount ?? 0) +
                (pulse?.rooms.hkDoneToInspect ?? 0) >
              0
                ? 'red'
                : 'green') as 'red' | 'green',
          },
        ]
      : []),
    ...(canPos
      ? [
          {
            label: 'POS Terminal',
            sub: 'Kitchen, Bar & Room Tabs',
            href: '/pos',
            icon: UtensilsCrossed,
            badgeCount: (pulse?.operations.posOpenOrders ?? 0) || (pulse?.operations.posCompletedToday ?? 0),
            badgeTone: ((pulse?.operations.posOpenOrders ?? 0) > 0 ? 'red' : 'green') as 'red' | 'green',
          },
        ]
      : []),
    ...(can('receipts:read')
      ? [
          {
            label: 'Receipts & Billing',
            sub: 'Issue A4 & 80mm thermal',
            href: '/receipts',
            icon: ReceiptText,
            badgeCount: pulse?.finance.receiptsIssuedToday ?? 0,
            badgeTone: 'green' as const,
          },
        ]
      : []),
    ...(canInv
      ? [
          {
            label: 'Staff & HR',
            sub: 'Rosters, leave & payroll',
            href: '/hr',
            icon: Users,
            badgeCount: (pulse?.hr.pendingLeaves ?? 0) || (pulse?.hr.activeStaff ?? 0),
            badgeTone: ((pulse?.hr.pendingLeaves ?? 0) > 0 ? 'red' : 'green') as 'red' | 'green',
          },
        ]
      : []),
  ].slice(0, 8);

  // Available lenses for the current user
  const lenses: { id: DashboardLens; label: string; icon: LucideIcon; badge?: number; tone?: 'red' | 'green' }[] = [
    ...(me.role !== 'HOUSEKEEPING' || canDesk
      ? [{ id: 'ALL' as const, label: 'All Command', icon: Radio }]
      : []),
    ...(canReports || canBookings
      ? [
          {
            id: 'EXECUTIVE' as const,
            label: 'Executive & Finance',
            icon: Sunset,
            badge: pulse?.finance.clearedTodayCount || undefined,
            tone: 'green' as const,
          },
        ]
      : []),
    ...(canDesk || canBookings
      ? [
          {
            id: 'DESK' as const,
            label: 'Front Desk & Stays',
            icon: ConciergeBell,
            badge:
              (pulse?.desk.arrivalsToday ?? 0) +
                (pulse?.desk.departuresToday ?? 0) +
                (pulse?.desk.lateArrivals ?? 0) ||
              (pulse?.desk.inHouse ?? 0) ||
              undefined,
            tone:
              (pulse?.desk.arrivalsToday ?? 0) +
                (pulse?.desk.departuresToday ?? 0) +
                (pulse?.desk.lateArrivals ?? 0) >
              0
                ? ('red' as const)
                : ('green' as const),
          },
        ]
      : []),
    ...(canRooms
      ? [
          {
            id: 'HOUSEKEEPING' as const,
            label: 'Rooms & Housekeeping',
            icon: SprayCan,
            badge:
              (pulse?.rooms.vacantDirty ?? 0) +
                (pulse?.rooms.hkTodoCount ?? 0) +
                (pulse?.rooms.hkDoneToInspect ?? 0) ||
              (pulse?.rooms.vacantClean ?? 0) ||
              undefined,
            tone:
              (pulse?.rooms.vacantDirty ?? 0) +
                (pulse?.rooms.hkTodoCount ?? 0) +
                (pulse?.rooms.hkDoneToInspect ?? 0) >
              0
                ? ('red' as const)
                : ('green' as const),
          },
        ]
      : []),
    ...(canPos || canInv || canReq
      ? [
          {
            id: 'OPERATIONS' as const,
            label: 'POS, Club & Supply',
            icon: UtensilsCrossed,
            badge:
              (pulse?.operations.posOpenOrders ?? 0) +
                (pulse?.operations.pendingRequisitions ?? 0) +
                (pulse?.operations.lowStockCount ?? 0) ||
              undefined,
            tone: 'red' as const,
          },
        ]
      : []),
    ...(canInbox || canWaitlist || canInv
      ? [
          {
            id: 'HR_COMMS' as const,
            label: 'HR, Inbox & Demand',
            icon: Inbox,
            badge:
              (pulse?.inbox.newCount ?? 0) +
                (pulse?.waitlist.newCount ?? 0) +
                (pulse?.hr.pendingLeaves ?? 0) ||
              undefined,
            tone: 'red' as const,
          },
        ]
      : []),
  ];

  // Action items requiring attention right now
  const actionAlerts: { label: string; count: number; href: string; tone: 'red' | 'green' }[] = [];
  if (pulse) {
    if (canInbox && pulse.inbox.newCount > 0) {
      actionAlerts.push({ label: 'Unread Enquiries', count: pulse.inbox.newCount, href: '/inbox?status=NEW', tone: 'red' });
    }
    if (canWaitlist && pulse.waitlist.newCount > 0) {
      actionAlerts.push({ label: 'Uncontacted Waitlist', count: pulse.waitlist.newCount, href: '/waitlist?status=NEW', tone: 'red' });
    }
    if (canDesk && pulse.desk.arrivalsToday > 0) {
      actionAlerts.push({ label: 'Arrivals Today', count: pulse.desk.arrivalsToday, href: '/desk', tone: 'red' });
    }
    if (canDesk && pulse.desk.lateArrivals > 0) {
      actionAlerts.push({ label: 'Overdue Arrivals', count: pulse.desk.lateArrivals, href: '/desk', tone: 'red' });
    }
    if (canDesk && pulse.desk.pendingGuestRequests > 0) {
      actionAlerts.push({ label: 'Guest Stay Requests', count: pulse.desk.pendingGuestRequests, href: '/reservations', tone: 'red' });
    }
    if (canBookings && pulse.reservations.heldCount > 0) {
      actionAlerts.push({ label: 'Held Bookings (Unpaid)', count: pulse.reservations.heldCount, href: '/reservations', tone: 'red' });
    }
    if (canRooms && (pulse.rooms.vacantDirty > 0 || pulse.rooms.hkTodoCount > 0)) {
      actionAlerts.push({
        label: 'Dirty Rooms / Tasks',
        count: pulse.rooms.vacantDirty + pulse.rooms.hkTodoCount,
        href: '/housekeeping',
        tone: 'red',
      });
    }
    if (canRooms && pulse.rooms.hkDoneToInspect > 0) {
      actionAlerts.push({
        label: 'Rooms Awaiting Inspection',
        count: pulse.rooms.hkDoneToInspect,
        href: '/housekeeping',
        tone: 'red',
      });
    }
    if (canPos && pulse.operations.posOpenOrders > 0) {
      actionAlerts.push({ label: 'Active Kitchen/Bar Orders', count: pulse.operations.posOpenOrders, href: '/pos', tone: 'red' });
    }
    if (canReq && pulse.operations.pendingRequisitions > 0) {
      actionAlerts.push({
        label: 'Pending Requisitions',
        count: pulse.operations.pendingRequisitions,
        href: '/requisitions',
        tone: 'red',
      });
    }
    if (canInv && pulse.operations.lowStockCount > 0) {
      actionAlerts.push({ label: 'Low Stock SKUs', count: pulse.operations.lowStockCount, href: '/inventory', tone: 'red' });
    }
    if (canInv && pulse.hr.pendingLeaves > 0) {
      actionAlerts.push({ label: 'Pending Leave Requests', count: pulse.hr.pendingLeaves, href: '/hr?tab=LEAVE', tone: 'red' });
    }
    if (can('guests:read') && pulse.feedback.openIssues > 0) {
      actionAlerts.push({ label: 'Open Feedback Issues', count: pulse.feedback.openIssues, href: '/feedback', tone: 'red' });
    }
    if (canContent && pulse.cms.unpublishedPages > 0) {
      actionAlerts.push({ label: 'Unpublished CMS Drafts', count: pulse.cms.unpublishedPages, href: '/website/publishing', tone: 'red' });
    }
  }

  const pendingReqs = (requisitions ?? []).filter(
    (r) => r.status === 'PENDING' || r.status === 'MANAGER_APPROVED',
  );
  const pinnedComms = (announcements ?? []).slice(0, 4);

  const showExecutive = lens === 'ALL' || lens === 'EXECUTIVE';
  const showDesk = lens === 'ALL' || lens === 'DESK';
  const showHk = lens === 'ALL' || lens === 'HOUSEKEEPING';
  const showOps = lens === 'ALL' || lens === 'OPERATIONS';
  const showHrComms = lens === 'ALL' || lens === 'HR_COMMS';

  const occupancyPct =
    pulse && pulse.rooms.totalActive > 0
      ? Math.round((pulse.rooms.occupied / pulse.rooms.totalActive) * 100)
      : 0;

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        title={`Overview · ${me.name.split(' ')[0]}`}
        description={`${todayFormatted} · ${roleBadgeLabel[me.role] ?? me.role} · Kapchorwa HQ (1,900m)`}
        actions={
          <>
            <button
              type="button"
              onClick={() => refetchPulse()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-fg-muted transition hover:border-line-strong hover:text-fg"
              title="Refresh live hotel pulse"
            >
              <RefreshCw className={cn('size-3.5', pulseFetching && 'animate-spin')} />
              <span className="hidden sm:inline">Live Sync</span>
            </button>
            {canBookings && (
              <Button size="sm" variant="secondary" href="/reservations?sort=latest" icon={<CalendarDays className="size-3.5" />}>
                Reservations
              </Button>
            )}
            {canDesk && (
              <Button size="sm" href="/desk" icon={<ConciergeBell className="size-3.5" />}>
                Front Desk
              </Button>
            )}
            {canPos && (
              <Button size="sm" href="/pos" icon={<UtensilsCrossed className="size-3.5" />}>
                POS
              </Button>
            )}
            {can('bookings:write') && (
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>
                New Booking
              </Button>
            )}
          </>
        }
      />

      {/* Role & Department Lens Switcher */}
      {lenses.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-1.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1">
            {lenses.map((l) => {
              const active = lens === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLens(l.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                    active
                      ? 'bg-fg text-bg shadow-xs'
                      : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <l.icon className="size-3.5" strokeWidth={1.8} />
                  <span>{l.label}</span>
                  {l.badge !== undefined && l.badge > 0 && (
                    <span
                      className={cn(
                        'ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular leading-tight',
                        l.tone === 'red'
                          ? 'bg-rose-500 text-white'
                          : active
                            ? 'bg-emerald-400/25 text-emerald-200'
                            : 'bg-emerald-500/15 text-success',
                      )}
                    >
                      {l.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="hidden items-center gap-2 pr-2 text-[11px] text-fg-subtle xl:flex">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-rose-500" /> Action Required
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" /> Healthy / Active
            </span>
          </div>
        </div>
      )}

      {/* Priority Action Center Strip (Red Urgent vs Green Healthy) */}
      {pulse && (
        <div className="card flex flex-wrap items-center gap-2 px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle mr-1">
            <Sparkles className="size-3.5 text-fg-muted" />
            House Pulse:
          </span>
          {actionAlerts.length > 0 ? (
            actionAlerts.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-fg transition hover:border-line-strong"
              >
                <span className="size-1.5 rounded-full bg-rose-500" />
                <span className="font-semibold tabular">{a.count}</span>
                <span>{a.label}</span>
              </Link>
            ))
          ) : (
            <StatusBadgePill tone="green" label="Zero urgent queues — all departments clear" />
          )}
          {canRooms && pulse.rooms.vacantClean > 0 && (
            <Link
              href="/rack"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-fg transition hover:border-line-strong"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-semibold tabular">{pulse.rooms.vacantClean}</span>
              <span>Clean Rooms Ready</span>
            </Link>
          )}
          {canDesk && pulse.desk.inHouse > 0 && (
            <Link
              href="/desk"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-fg transition hover:border-line-strong"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-semibold tabular">{pulse.desk.inHouse}</span>
              <span>In-House ({pulse.desk.guestsInHouse} Guests)</span>
            </Link>
          )}
        </div>
      )}

      {/* Priority Quick Actions Bar */}
      {criticalActions.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {criticalActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-all hover:border-line-strong hover:bg-surface-2/50"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg">
                <a.icon className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold leading-tight text-fg">
                    {a.label}
                  </span>
                  {a.badgeCount !== undefined && a.badgeCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 py-0.2 text-[10px] font-semibold text-fg tabular">
                      <span className={cn('size-1.5 rounded-full', a.badgeTone === 'red' ? 'bg-rose-500' : 'bg-emerald-500')} />
                      {a.badgeCount}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-tight text-fg-muted">
                  {a.sub}
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            </Link>
          ))}
        </div>
      )}

      {/* 8-Card Operational KPI Matrix */}
      {pulseLoading || !pulse ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {canRooms && (
            <KpiCard
              label="Room Readiness"
              icon={BedDouble}
              value={`${pulse.rooms.vacantClean} / ${pulse.rooms.totalActive} Clean`}
              sub={`${pulse.rooms.occupied} occupied · ${pulse.rooms.vacantDirty} dirty · ${occupancyPct}% occ`}
              href="/rack"
              badge={
                pulse.rooms.vacantDirty > 0
                  ? { text: `${pulse.rooms.vacantDirty} dirty`, tone: 'red' }
                  : { text: `${pulse.rooms.vacantClean} ready`, tone: 'green' }
              }
            />
          )}

          {(canDesk || canBookings) && (
            <KpiCard
              label="Front Desk Today"
              icon={ConciergeBell}
              value={`${pulse.desk.inHouse} In-House`}
              sub={`${pulse.desk.arrivalsToday} arriving · ${pulse.desk.departuresToday} departing · ${pulse.desk.guestsInHouse} guests`}
              href="/desk"
              badge={
                pulse.desk.arrivalsToday + pulse.desk.lateArrivals > 0
                  ? { text: `${pulse.desk.arrivalsToday + pulse.desk.lateArrivals} due in`, tone: 'red' }
                  : { text: `${pulse.desk.inHouse} active`, tone: 'green' }
              }
            />
          )}

          {(canReports || can('receipts:read')) && (
            <KpiCard
              label="Cleared Today"
              icon={Wallet}
              value={money(pulse.finance.clearedTodayUgxMinor, 'UGX')}
              sub={
                 BigInt(pulse.finance.clearedTodayUsdMinor) > 0n
                  ? `+ ${money(pulse.finance.clearedTodayUsdMinor, 'USD')} · ${pulse.finance.receiptsIssuedToday} receipts`
                  : `${pulse.finance.clearedTodayCount} payments · ${pulse.finance.receiptsIssuedToday} receipts today`
              }
              href="/brief"
              badge={
                pulse.finance.clearedTodayCount > 0
                  ? { text: `${pulse.finance.clearedTodayCount} paid`, tone: 'green' }
                  : { text: '0 today', tone: 'neutral' }
              }
            />
          )}

          {canBookings && (
            <KpiCard
              label="Reservations"
              icon={BookOpenText}
              value={`${pulse.reservations.confirmedCount} Confirmed`}
              sub={`${pulse.reservations.heldCount} held awaiting payment · ${pulse.reservations.upcoming7d} in next 7d`}
              href="/reservations"
              badge={
                pulse.reservations.heldCount > 0
                  ? { text: `${pulse.reservations.heldCount} held`, tone: 'red' }
                  : { text: `${pulse.reservations.confirmedCount} confirmed`, tone: 'green' }
              }
            />
          )}

          {canPos && (
            <KpiCard
              label="POS & Health Club"
              icon={UtensilsCrossed}
              value={money(pulse.operations.posRevenueTodayUgxMinor, 'UGX')}
              sub={`${pulse.operations.posCompletedToday} settled · ${pulse.operations.healthClubInsideNow} in Gym/Spa`}
              href="/pos"
              badge={
                pulse.operations.posOpenOrders > 0
                  ? { text: `${pulse.operations.posOpenOrders} open orders`, tone: 'red' }
                  : { text: `${pulse.operations.posCompletedToday} settled`, tone: 'green' }
              }
            />
          )}

          {(canReq || canInv) && (
            <KpiCard
              label="Supply & Requisitions"
              icon={ClipboardCheck}
              value={`${pulse.operations.pendingRequisitions} Pending`}
              sub={`${pulse.operations.lowStockCount} low-stock SKUs · ${pulse.operations.totalInventoryItems} total items`}
              href="/requisitions"
              badge={
                pulse.operations.pendingRequisitions + pulse.operations.lowStockCount > 0
                  ? {
                      text: `${pulse.operations.pendingRequisitions + pulse.operations.lowStockCount} alerts`,
                      tone: 'red',
                    }
                  : { text: 'Stock OK', tone: 'green' }
              }
            />
          )}

          {(canInbox || canWaitlist) && (
            <KpiCard
              label="Inbox & Waitlist"
              icon={Inbox}
              value={`${pulse.inbox.openCount} Open Threads`}
              sub={`${pulse.inbox.newCount} unread inbox · ${pulse.waitlist.newCount} uncontacted waitlist`}
              href="/inbox"
              badge={
                pulse.inbox.newCount + pulse.waitlist.newCount > 0
                  ? { text: `${pulse.inbox.newCount + pulse.waitlist.newCount} new`, tone: 'red' }
                  : { text: 'All triaged', tone: 'green' }
              }
            />
          )}

          {canInv && (
            <KpiCard
              label="Staff & Rosters"
              icon={Users}
              value={`${pulse.hr.activeStaff} Active Staff`}
              sub={`${pulse.hr.shiftsToday} shifts today · ${pulse.hr.departmentsCount} departments · ${money(hrOverview?.totalMonthlyPayrollMinor || '0', 'UGX')} payroll`}
              href="/hr"
              badge={
                pulse.hr.pendingLeaves > 0
                  ? { text: `${pulse.hr.pendingLeaves} leave req`, tone: 'red' }
                  : { text: `${pulse.hr.activeStaff} active`, tone: 'green' }
              }
            />
          )}
        </div>
      )}

      {/* LIVE FRONT DESK & HOUSEKEEPING COCKPIT ROW */}
      {((showDesk && canDesk) || (showHk && canRooms)) && (
        <div
          className={cn(
            'grid gap-4',
            showDesk && canDesk && showHk && canRooms ? 'xl:grid-cols-[1.35fr_1fr]' : 'grid-cols-1',
          )}
        >
          {/* Left: Live Front Desk Queue */}
          {showDesk && canDesk && (
            <Section
              title="Front Desk Live Movement"
              description="Today's check-ins, in-house stays, and scheduled departures"
              actions={
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-line bg-surface-2/60 p-0.5 text-[11px] font-semibold">
                    {(
                      [
                        { id: 'ARRIVALS', label: `Arrivals (${deskBoard?.counts.arrivals ?? pulse?.desk.arrivalsToday ?? 0})` },
                        { id: 'IN_HOUSE', label: `In-House (${deskBoard?.counts.inHouse ?? pulse?.desk.inHouse ?? 0})` },
                        { id: 'DEPARTURES', label: `Departures (${deskBoard?.counts.departures ?? pulse?.desk.departuresToday ?? 0})` },
                      ] as const
                    ).map((tItem) => (
                      <button
                        key={tItem.id}
                        type="button"
                        onClick={() => setDeskTab(tItem.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1 transition',
                          deskTab === tItem.id ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {tItem.label}
                      </button>
                    ))}
                  </div>
                  <Link href="/desk" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                    Desk <ArrowRight className="size-3" />
                  </Link>
                </div>
              }
            >
              {!deskBoard ? (
                <div className="space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : (
                <div className="space-y-2">
                  {deskBoard.lateArrivals.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2 font-semibold text-danger">
                        <AlertTriangle className="size-4 shrink-0" />
                        {deskBoard.lateArrivals.length} overdue arrival(s) from prior date awaiting check-in or no-show
                      </span>
                      <Link href="/desk" className="font-bold text-danger underline">
                        Resolve →
                      </Link>
                    </div>
                  )}

                  {(() => {
                    const list =
                      deskTab === 'ARRIVALS'
                        ? deskBoard.arrivals
                        : deskTab === 'IN_HOUSE'
                          ? deskBoard.inHouse
                          : deskBoard.departures;

                    if (list.length === 0) {
                      return (
                        <div className="rounded-lg border border-dashed border-line py-8 text-center text-xs text-fg-muted">
                          No stays in {deskTab.toLowerCase().replace('_', '-')} queue right now.
                        </div>
                      );
                    }

                    return (
                      <ul className="divide-y divide-line">
                        {list.slice(0, 6).map((stay) => {
                          const assignedRooms = stay.rooms
                            .flatMap((r) => r.assigned.map((a) => a.number))
                            .join(', ');
                          const balance = BigInt(stay.balanceMinor || '0');
                          return (
                            <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/reservations/${stay.id}`}
                                    className="font-semibold text-fg hover:underline"
                                  >
                                    {stay.guest.name}
                                  </Link>
                                  {stay.isVip && (
                                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                      VIP
                                    </span>
                                  )}
                                  <span className="font-mono text-[11px] text-fg-subtle">{stay.code}</span>
                                </div>
                                <p className="mt-0.5 text-[11.5px] text-fg-muted">
                                  {stay.rooms.map((r) => `${r.quantity}× ${r.roomTypeName}`).join(', ')} ·{' '}
                                  {assignedRooms ? (
                                    <span className="font-semibold text-success">Room {assignedRooms}</span>
                                  ) : (
                                    <span className="font-semibold text-warning">Unassigned</span>
                                  )}{' '}
                                  · {stay.nights}n ({dateShort(stay.arrival)} → {dateShort(stay.departure)})
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {balance > 0n ? (
                                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-danger tabular">
                                    Due {money(balance.toString(), stay.currency)}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                                    Paid
                                  </span>
                                )}
                                <Status value={stay.status} />
                                <Button size="sm" variant="secondary" href={`/reservations/${stay.id}`}>
                                  Open
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </div>
              )}
            </Section>
          )}

          {/* Right: Live Room Rack & Housekeeping Turnaround */}
          {showHk && canRooms && pulse && (
            <Section
              title="Room Rack & Housekeeping"
              description="Real-time physical room status & priority turnover queue"
              actions={
                <div className="flex items-center gap-3">
                  <Link href="/rack" className="text-xs font-semibold text-fg-muted hover:text-fg">
                    Rack
                  </Link>
                  <Link href="/housekeeping" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                    Housekeeping <ArrowRight className="size-3" />
                  </Link>
                </div>
              }
            >
              <div className="space-y-3.5">
                {/* Visual Room Status Bar */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-fg">
                      {pulse.rooms.vacantClean} of {pulse.rooms.totalActive} Rooms Ready to Sell
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-fg-muted tabular">
                      {occupancyPct}% Occupied
                    </span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                    {pulse.rooms.totalActive > 0 && (
                      <>
                        <div
                          style={{ width: `${(pulse.rooms.vacantClean / pulse.rooms.totalActive) * 100}%` }}
                          className="bg-emerald-500 transition-all"
                          title={`Vacant Clean / Inspected: ${pulse.rooms.vacantClean}`}
                        />
                        <div
                          style={{ width: `${(pulse.rooms.occupied / pulse.rooms.totalActive) * 100}%` }}
                          className="bg-sky-500 transition-all"
                          title={`Occupied: ${pulse.rooms.occupied}`}
                        />
                        <div
                          style={{ width: `${(pulse.rooms.vacantDirty / pulse.rooms.totalActive) * 100}%` }}
                          className="bg-rose-500 transition-all"
                          title={`Vacant Dirty: ${pulse.rooms.vacantDirty}`}
                        />
                        <div
                          style={{ width: `${(pulse.rooms.blocked / pulse.rooms.totalActive) * 100}%` }}
                          className="bg-slate-400 transition-all"
                          title={`Blocked / Out of Order: ${pulse.rooms.blocked}`}
                        />
                      </>
                    )}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Link
                      href="/rack"
                      className="rounded-lg border border-line bg-surface-2/50 p-2 text-center transition hover:bg-surface-2"
                    >
                      <span className="block text-lg font-bold text-fg tabular">{pulse.rooms.vacantClean}</span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-fg-muted">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> Vacant Clean
                      </span>
                    </Link>
                    <Link
                      href="/rack"
                      className="rounded-lg border border-line bg-surface-2/50 p-2 text-center transition hover:bg-surface-2"
                    >
                      <span className="block text-lg font-bold text-fg tabular">{pulse.rooms.occupied}</span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-fg-muted">
                        <span className="size-1.5 rounded-full bg-fg-subtle" /> Occupied
                      </span>
                    </Link>
                    <Link
                      href="/housekeeping"
                      className="rounded-lg border border-line bg-surface-2/50 p-2 text-center transition hover:bg-surface-2"
                    >
                      <span className="block text-lg font-bold text-fg tabular">{pulse.rooms.vacantDirty}</span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-fg-muted">
                        <span className="size-1.5 rounded-full bg-rose-500" /> Vacant Dirty
                      </span>
                    </Link>
                    <Link
                      href="/housekeeping"
                      className="rounded-lg border border-line bg-surface-2/50 p-2 text-center transition hover:bg-surface-2"
                    >
                      <span className="block text-lg font-bold text-fg tabular">
                        {pulse.rooms.hkTodoCount + pulse.rooms.hkDoneToInspect}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-fg-muted">
                        <span className="size-1.5 rounded-full bg-amber-500" /> Active Tasks
                      </span>
                    </Link>
                  </div>
                </div>

                {/* Priority Cleaning Queue */}
                <div className="border-t border-line pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                      Today&apos;s Housekeeping Queue
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      {pulse.rooms.hkInspectedToday} inspected today
                    </span>
                  </div>
                  {hkBoard && hkBoard.tasks.filter((tItem) => tItem.status !== 'INSPECTED' && tItem.status !== 'SKIPPED').length > 0 ? (
                    <ul className="divide-y divide-line">
                      {hkBoard.tasks
                        .filter((tItem) => tItem.status !== 'INSPECTED' && tItem.status !== 'SKIPPED')
                        .slice(0, 4)
                        .map((task) => (
                          <li key={task.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-bold text-fg">
                                Rm {task.room.number}
                              </span>
                              <span className="font-medium text-fg">{task.room.roomTypeName}</span>
                              {task.arrivalToday && (
                                <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                                  Arrival Today
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-fg-subtle">{task.kind}</span>
                              <Status value={task.status} />
                            </div>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs font-medium text-success">
                      <CheckCircle2 className="size-4 shrink-0" />
                      All scheduled room cleaning & inspection tasks are complete!
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* OPERATIONS, REQUISITIONS & ANNOUNCEMENTS ROW */}
      {showOps && (canReq || canInv || canDashboard) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {canReq && (
            <Section
              title="Supply Requisitions Queue"
              description="Department purchase & store requests awaiting approval or disbursement"
              actions={
                <Link href="/requisitions" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                  All Requisitions <ArrowRight className="size-3" />
                </Link>
              }
            >
              {pendingReqs.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-xs font-medium text-success">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Zero pending requisitions awaiting approval.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {pendingReqs.slice(0, 5).map((req) => (
                    <li key={req.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-fg-subtle">{req.number}</span>
                          <span className="truncate text-xs font-semibold text-fg">{req.title}</span>
                          {req.priority === 'URGENT' && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                              URGENT
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-fg-muted">
                          {req.department} · Requested by {req.requestedByName} · {ago(req.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-fg tabular">
                          {money(req.totalEstimatedMinor, req.currency)}
                        </span>
                        <Button size="sm" variant="secondary" href="/requisitions">
                          Review
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {canDashboard && (
            <Section
              title="House Comms & Recent Audit Activity"
              description="Pinned staff handover announcements & live system log"
              actions={
                <Link href="/requisitions" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                  Post Handover <ArrowRight className="size-3" />
                </Link>
              }
            >
              <div className="space-y-3">
                {pinnedComms.length > 0 && (
                  <div className="space-y-1.5">
                    {pinnedComms.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-semibold text-fg">
                            <Megaphone className="size-3.5 text-warning" />
                            {c.title}
                          </span>
                          <span className="text-[10.5px] text-fg-subtle">
                            {c.department ?? 'All House'} · {ago(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] text-fg-muted">{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {dashboardData.recentActivity.slice(0, 4).map((act) => (
                      <li key={act.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-fg">{act.summary ?? act.action}</span>
                          <span className="ml-2 text-[11px] text-fg-subtle">
                            by {act.actor?.name ?? act.actorType}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] text-fg-subtle">{ago(act.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !pinnedComms.length && (
                    <p className="py-4 text-center text-xs text-fg-muted">No recent announcements or activity logs.</p>
                  )
                )}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* GUEST DEMAND, INBOX & WAITLIST ROW */}
      {(showHrComms || showExecutive) && canDashboard && (canInbox || canWaitlist) && (
        <>
          {dashLoading || !dashboardData ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                {canInbox && (
                  <Section title="Enquiry Volume (30d)">
                    <ColumnChart data={dashboardData.enquiriesByDay} label="Enquiries" />
                  </Section>
                )}
                {canWaitlist && (
                  <Section title="Waitlist by Room Type">
                    {dashboardData.waitlistByRoomType.length ? (
                      <BarList
                        data={dashboardData.waitlistByRoomType.map((r) => ({
                          label: t(r.name),
                          value: r.count,
                        }))}
                      />
                    ) : (
                      <p className="text-xs text-fg-muted">No entries.</p>
                    )}
                  </Section>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {canInbox && (
                  <Section
                    title="Recent Inbox Threads"
                    actions={
                      <Link
                        href="/inbox"
                        className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
                      >
                        Inbox ({pulse?.inbox.newCount ?? 0} new) <ArrowRight className="size-3" />
                      </Link>
                    }
                  >
                    <ul className="-my-1.5 divide-y divide-line">
                      {dashboardData.latestConversations.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/inbox/${c.id}`}
                            className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2"
                          >
                            <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">
                              {c.contact.name
                                .split(' ')
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join('')}
                              {c.status === 'NEW' && (
                                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-surface" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-xs">
                                <span className={c.unread ? 'font-semibold text-fg' : 'font-medium text-fg'}>
                                  {c.contact.name}
                                </span>
                                <span className="text-[11px] text-fg-subtle">{CHANNEL[c.channel]}</span>
                                <span className="ml-auto text-[11px] text-fg-subtle">
                                  {ago(c.lastMessageAt)}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                                {c.preview}
                              </span>
                            </span>
                            <Status value={c.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {canWaitlist && (
                  <Section
                    title="Latest Waitlist Signups"
                    actions={
                      <Link
                        href="/waitlist"
                        className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
                      >
                        Waitlist ({pulse?.waitlist.newCount ?? 0} new) <ArrowRight className="size-3" />
                      </Link>
                    }
                  >
                    <ul className="-my-1.5 divide-y divide-line">
                      {dashboardData.latestWaitlist.map((w) => (
                        <li key={w.id}>
                          <Link
                            href={`/waitlist?open=${w.id}`}
                            className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs hover:bg-surface-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 font-medium text-fg">
                                {w.status === 'NEW' && <span className="size-2 rounded-full bg-rose-500" />}
                                {w.contact.name}
                              </span>
                              <span className="block text-[11px] text-fg-muted">
                                {w.roomType ? t(w.roomType.name) : 'Any room'} ·{' '}
                                {dateRange(w.preferredFrom, w.preferredTo)}
                              </span>
                            </span>
                            <span className="text-[11px] text-fg-subtle">{ago(w.createdAt)}</span>
                            <Status value={w.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
