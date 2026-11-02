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
type BadgeTone = 'red' | 'amber' | 'green' | 'neutral';
type KpiAccent = 'emerald' | 'sky' | 'amber' | 'indigo' | 'orange' | 'teal' | 'violet' | 'rose';

interface QuickAction {
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  badgeCount?: number;
  badgeTone?: BadgeTone;
}

const TONE_PILL_CLASSES: Record<BadgeTone, string> = {
  red: 'border-rose-500/35 bg-rose-500/12 text-danger font-bold',
  amber: 'border-amber-500/35 bg-amber-500/12 text-warning font-semibold',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-success font-semibold',
  neutral: 'border-line bg-surface-2 text-fg-muted font-medium',
};

const TONE_DOT_CLASSES: Record<BadgeTone, string> = {
  red: 'bg-rose-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  neutral: 'bg-fg-subtle',
};

const KPI_ACCENT_STYLES: Record<
  KpiAccent,
  { border: string; iconBg: string; iconText: string }
> = {
  emerald: {
    border: 'border-l-4 border-l-emerald-500',
    iconBg: 'bg-emerald-500/12',
    iconText: 'text-emerald-600 dark:text-emerald-400',
  },
  sky: {
    border: 'border-l-4 border-l-sky-500',
    iconBg: 'bg-sky-500/12',
    iconText: 'text-sky-600 dark:text-sky-400',
  },
  amber: {
    border: 'border-l-4 border-l-amber-500',
    iconBg: 'bg-amber-500/12',
    iconText: 'text-amber-600 dark:text-amber-400',
  },
  indigo: {
    border: 'border-l-4 border-l-indigo-500',
    iconBg: 'bg-indigo-500/12',
    iconText: 'text-indigo-600 dark:text-indigo-400',
  },
  orange: {
    border: 'border-l-4 border-l-orange-500',
    iconBg: 'bg-orange-500/12',
    iconText: 'text-orange-600 dark:text-orange-400',
  },
  teal: {
    border: 'border-l-4 border-l-teal-500',
    iconBg: 'bg-teal-500/12',
    iconText: 'text-teal-600 dark:text-teal-400',
  },
  violet: {
    border: 'border-l-4 border-l-violet-500',
    iconBg: 'bg-violet-500/12',
    iconText: 'text-violet-600 dark:text-violet-400',
  },
  rose: {
    border: 'border-l-4 border-l-rose-500',
    iconBg: 'bg-rose-500/12',
    iconText: 'text-rose-600 dark:text-rose-400',
  },
};

function StatusBadgePill({
  count,
  tone,
  label,
}: {
  count?: number;
  tone: BadgeTone;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] tabular',
        TONE_PILL_CLASSES[tone],
      )}
    >
      <span className={cn('size-1.5 rounded-full shrink-0', TONE_DOT_CLASSES[tone])} />
      {count !== undefined && <span className="font-bold">{count}</span>}
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
  accent = 'emerald',
  badge,
}: {
  label: string;
  value: string | number;
  sub: string;
  href: string;
  icon: LucideIcon;
  accent?: KpiAccent;
  badge?: { text: string; tone: BadgeTone };
}) {
  const accentStyle = KPI_ACCENT_STYLES[accent];

  return (
    <Link
      href={href}
      className={cn(
        'card group relative flex flex-col justify-between p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md',
        accentStyle.border,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105',
              accentStyle.iconBg,
              accentStyle.iconText,
            )}
          >
            <Icon className="size-4" strokeWidth={2} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {label}
          </span>
        </div>
        {badge && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] tabular',
              TONE_PILL_CLASSES[badge.tone],
            )}
          >
            <span className={cn('size-1.5 rounded-full shrink-0', TONE_DOT_CLASSES[badge.tone])} />
            {badge.text}
          </span>
        )}
      </div>
      <div className="mt-3.5 flex items-baseline justify-between gap-2">
        <p className="display text-2xl font-extrabold tracking-tight text-fg sm:text-[28px] leading-none tabular">
          {value}
        </p>
        <ArrowRight className="size-4 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-fg group-hover:opacity-100" />
      </div>
      <p className="mt-2 truncate text-[12px] font-medium text-fg-muted">{sub}</p>
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
  const canClub = can('healthclub:operate');
  const canInv = can('inventory:manage');
  const canReq = can('requisitions:request');
  const canReports = can('reports:read');
  const canHr = can('hr:manage');

  // Default lens tailored to user's role
  const defaultLens: DashboardLens =
    me.role === 'HOUSEKEEPING' && !canDesk
      ? 'HOUSEKEEPING'
      : canPos && !canDesk
        ? 'OPERATIONS'
        : 'ALL';
  const [lens, setLens] = useState<DashboardLens>(defaultLens);
  const [deskTab, setDeskTab] = useState<'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES'>('ARRIVALS');
  const [fabOpen, setFabOpen] = useState(false);

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
    enabled: canHr,
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
    HR: 'Human Resources & Payroll',
    ACCOUNTANT: 'Finance & Accounts',
    DESK: 'Front Desk & Guest Services',
    KITCHEN: 'Kitchen & Culinary Operations',
    BAR: 'Bar & Beverage Operations',
    GYM: 'Health Club & Spa Operations',
    HOUSEKEEPING: 'Housekeeping & Room Readiness',
  };

  // Build role-aware priority quick actions with strict urgency-tiered badges (red / amber / green / neutral)
  const criticalActions: QuickAction[] = [
    ...(canDesk
      ? [
          {
            label: 'Front Desk & Check-In',
            sub:
              (pulse?.desk.lateArrivals ?? 0) > 0
                ? `${pulse?.desk.lateArrivals} overdue · ${pulse?.desk.arrivalsToday ?? 0} arriving today`
                : 'Check-in, assign rooms & departures',
            href: '/desk',
            icon: ConciergeBell,
            badgeCount:
              (pulse?.desk.lateArrivals ?? 0) ||
              (pulse?.desk.arrivalsToday ?? 0) + (pulse?.desk.departuresToday ?? 0) ||
              (pulse?.desk.inHouse ?? 0),
            badgeTone: (
              (pulse?.desk.lateArrivals ?? 0) > 0
                ? 'red'
                : (pulse?.desk.arrivalsToday ?? 0) + (pulse?.desk.departuresToday ?? 0) > 0
                  ? 'amber'
                  : 'green'
            ) as BadgeTone,
          },
        ]
      : []),
    ...(can('bookings:write')
      ? [
          {
            label: '+ New Booking / Walk-In',
            sub: 'Instant reservation or 48h hold',
            href: '/reservations/new?walkin=1',
            icon: UserRoundPlus,
          },
        ]
      : []),
    ...(canBookings
      ? [
          {
            label: 'Reservations & Holds',
            sub: 'Bookings, holds & guest folios',
            href: '/reservations?sort=latest',
            icon: BookOpenText,
            badgeCount: (pulse?.reservations.heldCount ?? 0) || (pulse?.reservations.confirmedCount ?? 0),
            badgeTone: ((pulse?.reservations.heldCount ?? 0) > 0 ? 'amber' : 'neutral') as BadgeTone,
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
            badgeTone: ((pulse?.rooms.vacantClean ?? 0) > 0 ? 'green' : 'red') as BadgeTone,
          },
          {
            label: 'Housekeeping Queue',
            sub: 'Floor cleaning & room inspection',
            href: '/housekeeping',
            icon: SprayCan,
            badgeCount:
              (pulse?.rooms.vacantDirty ?? 0) +
              (pulse?.rooms.hkTodoCount ?? 0) +
              (pulse?.rooms.hkDoneToInspect ?? 0) ||
              (pulse?.rooms.vacantClean ?? 0),
            badgeTone: (
              (pulse?.rooms.vacantDirty ?? 0) +
                (pulse?.rooms.hkTodoCount ?? 0) +
                (pulse?.rooms.hkDoneToInspect ?? 0) >
              0
                ? 'amber'
                : 'green'
            ) as BadgeTone,
          },
        ]
      : []),
    ...(canPos
      ? [
          {
            label: 'Add POS Charge',
            sub: 'Kitchen, Bar & Room Folio Tabs',
            href: '/pos',
            icon: UtensilsCrossed,
            badgeCount: (pulse?.operations.posOpenOrders ?? 0) || (pulse?.operations.posCompletedToday ?? 0),
            badgeTone: ((pulse?.operations.posOpenOrders ?? 0) > 0 ? 'amber' : 'green') as BadgeTone,
          },
        ]
      : []),
    ...(can('receipts:read')
      ? [
          {
            label: 'Receipts & Billing',
            sub: 'Issue A4 & 80mm thermal receipts',
            href: '/receipts',
            icon: ReceiptText,
            badgeCount: pulse?.finance.receiptsIssuedToday ?? 0,
            badgeTone: 'neutral' as BadgeTone,
          },
        ]
      : []),
    ...(canInv
      ? [
          {
            label: 'Inventory & Stock',
            sub: 'Pantry, ingredients & stock levels',
            href: '/inventory',
            icon: Boxes,
            badgeCount: pulse?.operations.lowStockCount ?? 0,
            badgeTone: ((pulse?.operations.lowStockCount ?? 0) > 0 ? 'red' : 'green') as BadgeTone,
          },
        ]
      : []),
    ...(canReq
      ? [
          {
            label: 'Store Requisitions',
            sub: 'Department supply requests',
            href: '/requisitions',
            icon: ClipboardCheck,
            badgeCount: pulse?.operations.pendingRequisitions ?? 0,
            badgeTone: (
              (pulse?.operations.urgentRequisitions ?? 0) > 0
                ? 'red'
                : (pulse?.operations.pendingRequisitions ?? 0) > 0
                  ? 'amber'
                  : 'green'
            ) as BadgeTone,
          },
        ]
      : []),
    ...(canHr
      ? [
          {
            label: 'Staff & HR',
            sub: 'Rosters, leave & payroll',
            href: '/hr',
            icon: Users,
            badgeCount: (pulse?.hr.pendingLeaves ?? 0) || (pulse?.hr.activeStaff ?? 0),
            badgeTone: ((pulse?.hr.pendingLeaves ?? 0) > 0 ? 'amber' : 'neutral') as BadgeTone,
          },
        ]
      : []),
  ].slice(0, 8);

  // Available lenses for the current user with urgency-tiered badges
  const lenses: { id: DashboardLens; label: string; icon: LucideIcon; badge?: number; tone?: BadgeTone }[] = [
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
              (pulse?.desk.lateArrivals ?? 0) +
                (pulse?.desk.arrivalsToday ?? 0) +
                (pulse?.desk.departuresToday ?? 0) ||
              (pulse?.desk.inHouse ?? 0) ||
              undefined,
            tone:
              (pulse?.desk.lateArrivals ?? 0) > 0
                ? ('red' as const)
                : (pulse?.desk.arrivalsToday ?? 0) + (pulse?.desk.departuresToday ?? 0) > 0
                  ? ('amber' as const)
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
              (pulse?.rooms.vacantClean ?? 1) === 0 && (pulse?.rooms.totalActive ?? 0) > 0
                ? ('red' as const)
                : (pulse?.rooms.vacantDirty ?? 0) +
                      (pulse?.rooms.hkTodoCount ?? 0) +
                      (pulse?.rooms.hkDoneToInspect ?? 0) >
                    0
                  ? ('amber' as const)
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
            tone:
              (pulse?.operations.lowStockCount ?? 0) + (pulse?.operations.urgentRequisitions ?? 0) > 0
                ? ('red' as const)
                : ('amber' as const),
          },
        ]
      : []),
    ...(canInbox || canWaitlist || canHr
      ? [
          {
            id: 'HR_COMMS' as const,
            label: canHr ? 'HR, Inbox & Demand' : 'Inbox & Demand',
            icon: Inbox,
            badge:
              (pulse?.inbox.newCount ?? 0) +
                (pulse?.waitlist.newCount ?? 0) +
                (canHr ? pulse?.hr.pendingLeaves ?? 0 : 0) ||
              undefined,
            tone: 'amber' as const,
          },
        ]
      : []),
  ];

  // Action items strictly tiered by operational urgency:
  // RED = immediate overdue/errors/shortages; AMBER = pending staff tasks
  const actionAlerts: { label: string; count: number; href: string; tone: BadgeTone }[] = [];
  if (pulse) {
    // 1. Immediate Critical / Overdue (RED)
    if (canDesk && pulse.desk.lateArrivals > 0) {
      actionAlerts.push({ label: 'Overdue Arrivals', count: pulse.desk.lateArrivals, href: '/desk', tone: 'red' });
    }
    if (canReq && pulse.operations.urgentRequisitions > 0) {
      actionAlerts.push({
        label: 'Urgent Requisitions',
        count: pulse.operations.urgentRequisitions,
        href: '/requisitions',
        tone: 'red',
      });
    }
    if (canInv && pulse.operations.lowStockCount > 0) {
      actionAlerts.push({ label: 'Low Stock SKUs', count: pulse.operations.lowStockCount, href: '/inventory', tone: 'red' });
    }
    if (can('guests:read') && pulse.feedback.openIssues > 0) {
      actionAlerts.push({ label: 'Open Guest Issues', count: pulse.feedback.openIssues, href: '/feedback', tone: 'red' });
    }

    // 2. Pending Operational Tasks (AMBER)
    if (canDesk && pulse.desk.arrivalsToday > 0) {
      actionAlerts.push({ label: 'Arrivals Today', count: pulse.desk.arrivalsToday, href: '/desk', tone: 'amber' });
    }
    if (canDesk && pulse.desk.pendingGuestRequests > 0) {
      actionAlerts.push({ label: 'Guest Stay Requests', count: pulse.desk.pendingGuestRequests, href: '/reservations', tone: 'amber' });
    }
    if (canBookings && pulse.reservations.heldCount > 0) {
      actionAlerts.push({ label: 'Held Bookings (Unpaid)', count: pulse.reservations.heldCount, href: '/reservations', tone: 'amber' });
    }
    if (canRooms && (pulse.rooms.vacantDirty > 0 || pulse.rooms.hkTodoCount > 0)) {
      actionAlerts.push({
        label: 'Dirty Rooms / Tasks',
        count: pulse.rooms.vacantDirty + pulse.rooms.hkTodoCount,
        href: '/housekeeping',
        tone: 'amber',
      });
    }
    if (canRooms && pulse.rooms.hkDoneToInspect > 0) {
      actionAlerts.push({
        label: 'Awaiting Inspection',
        count: pulse.rooms.hkDoneToInspect,
        href: '/housekeeping',
        tone: 'amber',
      });
    }
    if (canPos && pulse.operations.posOpenOrders > 0) {
      actionAlerts.push({ label: 'Active Kitchen/Bar Tabs', count: pulse.operations.posOpenOrders, href: '/pos', tone: 'amber' });
    }
    if (canReq && pulse.operations.pendingRequisitions - pulse.operations.urgentRequisitions > 0) {
      actionAlerts.push({
        label: 'Pending Requisitions',
        count: pulse.operations.pendingRequisitions - pulse.operations.urgentRequisitions,
        href: '/requisitions',
        tone: 'amber',
      });
    }
    if (canHr && pulse.hr.pendingLeaves > 0) {
      actionAlerts.push({ label: 'Pending Leave Requests', count: pulse.hr.pendingLeaves, href: '/hr?tab=LEAVE', tone: 'amber' });
    }
    if (canInbox && pulse.inbox.newCount > 0) {
      actionAlerts.push({ label: 'Unread Enquiries', count: pulse.inbox.newCount, href: '/inbox?status=NEW', tone: 'amber' });
    }
    if (canWaitlist && pulse.waitlist.newCount > 0) {
      actionAlerts.push({ label: 'Uncontacted Waitlist', count: pulse.waitlist.newCount, href: '/waitlist?status=NEW', tone: 'amber' });
    }
    if (canContent && pulse.cms.unpublishedPages > 0) {
      actionAlerts.push({ label: 'Unpublished Drafts', count: pulse.cms.unpublishedPages, href: '/website/publishing', tone: 'neutral' });
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
    <>
      <div className="fade-in space-y-5 pb-16">
        <PageHeader
        title={`Overview · ${me.name.split(' ')[0]}`}
        description={`${todayFormatted} · ${me.customRoleName || me.jobTitle || roleBadgeLabel[me.role] || me.role} · Kapchorwa HQ (1,900m)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetchPulse()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-fg-muted transition hover:border-line-strong hover:text-fg"
              title="Refresh live hotel pulse"
            >
              <RefreshCw className={cn('size-3.5', pulseFetching && 'animate-spin')} />
              <span className="hidden sm:inline">Live Sync</span>
            </button>
            {canDesk && (pulse?.desk.lateArrivals ?? 0) > 0 && (
              <Link
                href="/desk"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/12 px-3 text-xs font-bold text-danger transition hover:bg-rose-500/20"
              >
                <AlertTriangle className="size-3.5" />
                <span>Resolve {pulse?.desk.lateArrivals} Overdue</span>
              </Link>
            )}
            {canDesk && (
              <Button size="sm" variant="secondary" href="/desk" icon={<ConciergeBell className="size-3.5" />}>
                Check-In / Desk
              </Button>
            )}
            {canPos && (
              <Button size="sm" variant="secondary" href="/pos" icon={<UtensilsCrossed className="size-3.5" />}>
                Add POS Charge
              </Button>
            )}
            {canRooms && !canDesk && (
              <Button size="sm" variant="secondary" href="/housekeeping" icon={<SprayCan className="size-3.5" />}>
                Housekeeping
              </Button>
            )}
            {canReq && !canDesk && !canBookings && (
              <Button size="sm" variant="secondary" href="/requisitions" icon={<ClipboardCheck className="size-3.5" />}>
                Requisitions
              </Button>
            )}
            {can('bookings:write') && (
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>
                + New Booking
              </Button>
            )}
          </div>
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
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
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
                          : l.tone === 'amber'
                            ? active
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-amber-500/20 text-warning'
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
          <div className="hidden items-center gap-3 pr-2.5 text-[11px] font-medium text-fg-subtle xl:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500" /> Immediate / Overdue
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" /> Pending Tasks
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> Ready / Active
            </span>
          </div>
        </div>
      )}

      {/* Priority Action Center Strip (Strict Urgency Tiers: Red Immediate, Amber Pending, Green Ready) */}
      {pulse && (
        <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
            <Sparkles className="size-3.5 text-fg-muted" />
            House Pulse:
          </span>
          {actionAlerts.length > 0 ? (
            actionAlerts.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition hover:opacity-90 tabular',
                  TONE_PILL_CLASSES[a.tone],
                )}
              >
                <span className={cn('size-1.5 rounded-full shrink-0', TONE_DOT_CLASSES[a.tone])} />
                <span className="font-extrabold">{a.count}</span>
                <span>{a.label}</span>
              </Link>
            ))
          ) : (
            <StatusBadgePill tone="green" label="Zero urgent queues — all departments clear" />
          )}
          {canRooms && pulse.rooms.vacantClean > 0 && (
            <Link
              href="/rack"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition hover:opacity-90 tabular',
                TONE_PILL_CLASSES.green,
              )}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-bold">{pulse.rooms.vacantClean}</span>
              <span>Clean Rooms Ready</span>
            </Link>
          )}
          {canDesk && pulse.desk.inHouse > 0 && (
            <Link
              href="/desk"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition hover:opacity-90 tabular',
                TONE_PILL_CLASSES.neutral,
              )}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-bold text-fg">{pulse.desk.inHouse}</span>
              <span>In-House ({pulse.desk.guestsInHouse} Guests)</span>
            </Link>
          )}
        </div>
      )}

      {/* Priority Quick Actions Bar (Touch-Accessible) */}
      {criticalActions.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {criticalActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition-all hover:border-line-strong hover:bg-surface-2/60 hover:shadow-xs"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg transition-colors group-hover:bg-fg group-hover:text-bg">
                <a.icon className="size-4" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold leading-tight text-fg">
                    {a.label}
                  </span>
                  {a.badgeCount !== undefined && a.badgeCount > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] tabular',
                        TONE_PILL_CLASSES[a.badgeTone ?? 'neutral'],
                      )}
                    >
                      <span className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES[a.badgeTone ?? 'neutral'])} />
                      {a.badgeCount}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-fg-muted">
                  {a.sub}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            </Link>
          ))}
        </div>
      )}

      {/* High-Contrast Operational KPI Matrix */}
      {pulseLoading || !pulse ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canRooms && (
            <KpiCard
              label="Room Readiness"
              icon={BedDouble}
              accent="emerald"
              value={`${pulse.rooms.vacantClean} / ${pulse.rooms.totalActive} Clean`}
              sub={`${pulse.rooms.occupied} occupied · ${pulse.rooms.vacantDirty} dirty · ${occupancyPct}% occ`}
              href="/rack"
              badge={
                pulse.rooms.vacantClean === 0 && pulse.rooms.totalActive > 0
                  ? { text: '0 clean ready', tone: 'red' }
                  : pulse.rooms.vacantDirty > 0
                    ? { text: `${pulse.rooms.vacantDirty} to clean`, tone: 'amber' }
                    : { text: `${pulse.rooms.vacantClean} ready`, tone: 'green' }
              }
            />
          )}

          {(canDesk || canBookings) && (
            <KpiCard
              label="Front Desk Today"
              icon={ConciergeBell}
              accent="sky"
              value={`${pulse.desk.inHouse} In-House`}
              sub={`${pulse.desk.arrivalsToday} arriving · ${pulse.desk.departuresToday} departing · ${pulse.desk.guestsInHouse} guests`}
              href="/desk"
              badge={
                pulse.desk.lateArrivals > 0
                  ? { text: `${pulse.desk.lateArrivals} overdue`, tone: 'red' }
                  : pulse.desk.arrivalsToday > 0
                    ? { text: `${pulse.desk.arrivalsToday} arriving`, tone: 'amber' }
                    : { text: `${pulse.desk.inHouse} active`, tone: 'green' }
              }
            />
          )}

          {(canReports || can('receipts:read')) && (
            <KpiCard
              label="Cleared Today"
              icon={Wallet}
              accent="amber"
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
              accent="indigo"
              value={`${pulse.reservations.confirmedCount} Confirmed`}
              sub={`${pulse.reservations.heldCount} held awaiting payment · ${pulse.reservations.upcoming7d} in next 7d`}
              href="/reservations"
              badge={
                pulse.reservations.heldCount > 0
                  ? { text: `${pulse.reservations.heldCount} held`, tone: 'amber' }
                  : { text: `${pulse.reservations.confirmedCount} confirmed`, tone: 'neutral' }
              }
            />
          )}

          {canPos && (
            <KpiCard
              label={canClub ? 'POS & Health Club' : 'Kitchen & Bar POS'}
              icon={UtensilsCrossed}
              accent="orange"
              value={money(pulse.operations.posRevenueTodayUgxMinor, 'UGX')}
              sub={
                canClub
                  ? `${pulse.operations.posCompletedToday} settled · ${pulse.operations.healthClubInsideNow} in Gym/Spa`
                  : `${pulse.operations.posCompletedToday} settled · ${pulse.operations.posOpenOrders} active tabs`
              }
              href="/pos"
              badge={
                pulse.operations.posOpenOrders > 0
                  ? { text: `${pulse.operations.posOpenOrders} open tabs`, tone: 'amber' }
                  : { text: `${pulse.operations.posCompletedToday} settled`, tone: 'green' }
              }
            />
          )}

          {canInv && (
            <KpiCard
              label="Kitchen & Store Inventory"
              icon={Boxes}
              accent="teal"
              value={`${pulse.operations.totalInventoryItems} Total Items`}
              sub={`${pulse.operations.lowStockCount} low-stock SKUs · ${pulse.operations.pendingRequisitions} requisitions pending`}
              href="/inventory"
              badge={
                pulse.operations.lowStockCount > 0
                  ? { text: `${pulse.operations.lowStockCount} low stock`, tone: 'red' }
                  : pulse.operations.pendingRequisitions > 0
                    ? { text: `${pulse.operations.pendingRequisitions} reqs`, tone: 'amber' }
                    : { text: 'Stock OK', tone: 'green' }
              }
            />
          )}

          {canReq && !canInv && (
            <KpiCard
              label="Supply & Requisitions"
              icon={ClipboardCheck}
              accent="teal"
              value={`${pulse.operations.pendingRequisitions} Pending`}
              sub={`${pulse.operations.lowStockCount} low-stock SKUs · ${pulse.operations.totalInventoryItems} total items`}
              href="/requisitions"
              badge={
                pulse.operations.lowStockCount + pulse.operations.urgentRequisitions > 0
                  ? {
                      text: `${pulse.operations.lowStockCount + pulse.operations.urgentRequisitions} urgent`,
                      tone: 'red',
                    }
                  : pulse.operations.pendingRequisitions > 0
                    ? { text: `${pulse.operations.pendingRequisitions} pending`, tone: 'amber' }
                    : { text: 'Stock OK', tone: 'green' }
              }
            />
          )}

          {(canInbox || canWaitlist) && (
            <KpiCard
              label="Inbox & Waitlist"
              icon={Inbox}
              accent="violet"
              value={`${pulse.inbox.openCount} Open Threads`}
              sub={`${pulse.inbox.newCount} unread inbox · ${pulse.waitlist.newCount} uncontacted waitlist`}
              href="/inbox"
              badge={
                pulse.inbox.newCount + pulse.waitlist.newCount > 0
                  ? { text: `${pulse.inbox.newCount + pulse.waitlist.newCount} awaiting reply`, tone: 'amber' }
                  : { text: 'All triaged', tone: 'green' }
              }
            />
          )}

          {canHr && (
            <KpiCard
              label="Staff & Rosters"
              icon={Users}
              accent="rose"
              value={`${pulse.hr.activeStaff} Active Staff`}
              sub={`${pulse.hr.shiftsToday} shifts today · ${pulse.hr.departmentsCount} departments · ${money(hrOverview?.totalMonthlyPayrollMinor || '0', 'UGX')} payroll`}
              href="/hr"
              badge={
                pulse.hr.pendingLeaves > 0
                  ? { text: `${pulse.hr.pendingLeaves} leave req`, tone: 'amber' }
                  : { text: `${pulse.hr.activeStaff} active`, tone: 'neutral' }
              }
            />
          )}
        </div>
      )}

      {/* UNIFIED ROOMS, HOUSEKEEPING & FRONT DESK COCKPIT (Grouped Side-by-Side with Subtle Visual Boundaries) */}
      {((showDesk && canDesk) || (showHk && canRooms)) && (
        <div className="rounded-2xl border border-line-strong/80 bg-surface-2/25 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-fg">
                Live Front-of-House & Room Readiness Cockpit
              </h2>
              <span className="hidden text-xs text-fg-muted sm:inline">
                — Check-ins, physical Room Rack readiness, and floor housekeeping grouped side-by-side
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canDesk && (
                <Link
                  href="/desk"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-fg transition hover:border-line-strong"
                >
                  <ConciergeBell className="size-3.5" /> Front Desk
                </Link>
              )}
              {canRooms && (
                <>
                  <Link
                    href="/rack"
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-fg transition hover:border-line-strong"
                  >
                    <LayoutGrid className="size-3.5" /> Room Rack
                  </Link>
                  <Link
                    href="/housekeeping"
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-fg transition hover:border-line-strong"
                  >
                    <SprayCan className="size-3.5" /> Housekeeping
                  </Link>
                </>
              )}
            </div>
          </div>

          <div
            className={cn(
              'grid gap-4',
              showDesk && canDesk && showHk && canRooms
                ? 'xl:grid-cols-[1.25fr_0.9fr_1fr]'
                : showHk && canRooms
                  ? 'xl:grid-cols-2'
                  : 'grid-cols-1',
            )}
          >
            {/* Column 1: Front Desk Live Movement (Touch-Friendly Cards) */}
            {showDesk && canDesk && (
              <Section
                title="1. Front Desk Live Movement"
                description="Tap any guest card to check in, assign a room, or settle balance"
                actions={
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
                          'min-h-[32px] rounded-md px-2.5 py-1 transition',
                          deskTab === tItem.id ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {tItem.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {!deskBoard ? (
                  <div className="space-y-2.5">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {deskBoard.lateArrivals.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-500/12 p-3 text-xs">
                        <span className="flex items-center gap-2 font-bold text-danger">
                          <AlertTriangle className="size-4 shrink-0" />
                          {deskBoard.lateArrivals.length} overdue arrival(s) from prior date awaiting check-in or no-show
                        </span>
                        <Link
                          href="/desk"
                          className="inline-flex min-h-[36px] items-center rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white shadow-2xs hover:bg-rose-500"
                        >
                          Resolve Now →
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
                          <div className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-fg-muted">
                            No stays in {deskTab.toLowerCase().replace('_', '-')} queue right now.
                          </div>
                        );
                      }

                      return (
                        <div className="grid gap-2.5">
                          {list.slice(0, 5).map((stay) => {
                            const assignedRooms = stay.rooms
                              .flatMap((r) => r.assigned.map((a) => a.number))
                              .join(', ');
                            const balance = BigInt(stay.balanceMinor || '0');
                            return (
                              <div
                                key={stay.id}
                                className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-surface-2/35 p-3.5 transition hover:border-line-strong sm:flex-row sm:items-center"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={`/reservations/${stay.id}`}
                                      className="text-[13.5px] font-bold text-fg hover:underline"
                                    >
                                      {stay.guest.name}
                                    </Link>
                                    {stay.isVip && (
                                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">
                                        VIP
                                      </span>
                                    )}
                                    <span className="font-mono text-[11px] font-semibold text-fg-subtle">{stay.code}</span>
                                    <Status value={stay.status} />
                                  </div>
                                  <p className="mt-1 text-xs text-fg-muted">
                                    <span className="font-medium text-fg">
                                      {stay.rooms.map((r) => `${r.quantity}× ${r.roomTypeName}`).join(', ')}
                                    </span>{' '}
                                    ·{' '}
                                    {assignedRooms ? (
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-success">
                                        Rm {assignedRooms}
                                      </span>
                                    ) : (
                                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">
                                        Unassigned Room
                                      </span>
                                    )}{' '}
                                    · {stay.nights}n ({dateShort(stay.arrival)} → {dateShort(stay.departure)})
                                  </p>
                                </div>
                                <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2 sm:border-t-0 sm:pt-0">
                                  {balance > 0n ? (
                                    <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold text-warning tabular">
                                      Due {money(balance.toString(), stay.currency)}
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-success">
                                      Paid
                                    </span>
                                  )}
                                  <Link
                                    href={deskTab === 'ARRIVALS' ? '/desk' : `/reservations/${stay.id}`}
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-bold text-fg shadow-2xs transition hover:bg-fg hover:text-bg"
                                  >
                                    {deskTab === 'ARRIVALS' ? 'Check In →' : 'Manage →'}
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </Section>
            )}

            {/* Column 2: Room Readiness & Rack Summary */}
            {showHk && canRooms && pulse && (
              <Section
                title="2. Room Readiness & Rack"
                description="Physical inventory status across all active rooms"
                actions={
                  <Link href="/rack" className="flex items-center gap-1 text-xs font-bold text-fg-muted hover:text-fg">
                    Open Rack <ArrowRight className="size-3" />
                  </Link>
                }
              >
                <div className="space-y-4">
                  <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                          Ready to Check In
                        </span>
                        <p className="display mt-0.5 text-3xl font-extrabold text-fg tabular">
                          {pulse.rooms.vacantClean}{' '}
                          <span className="text-base font-semibold text-fg-muted">
                            / {pulse.rooms.totalActive} Clean
                          </span>
                        </p>
                      </div>
                      <span className="rounded-lg bg-surface px-2.5 py-1 font-mono text-xs font-extrabold text-fg tabular border border-line">
                        {occupancyPct}% Occ
                      </span>
                    </div>

                    <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-surface">
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
                            className="bg-amber-500 transition-all"
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
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Link
                      href="/rack"
                      className="flex min-h-[68px] flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3 transition hover:bg-emerald-500/15"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-success">
                        <span className="size-2 rounded-full bg-emerald-500" /> Vacant Clean
                      </span>
                      <span className="display text-2xl font-extrabold text-fg tabular">
                        {pulse.rooms.vacantClean}
                      </span>
                    </Link>

                    <Link
                      href="/rack"
                      className="flex min-h-[68px] flex-col justify-between rounded-xl border border-sky-500/30 bg-sky-500/8 p-3 transition hover:bg-sky-500/15"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-400">
                        <span className="size-2 rounded-full bg-sky-500" /> Occupied
                      </span>
                      <span className="display text-2xl font-extrabold text-fg tabular">
                        {pulse.rooms.occupied}
                      </span>
                    </Link>

                    <Link
                      href="/housekeeping"
                      className="flex min-h-[68px] flex-col justify-between rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 transition hover:bg-amber-500/18"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-warning">
                        <span className="size-2 rounded-full bg-amber-500" /> Vacant Dirty
                      </span>
                      <span className="display text-2xl font-extrabold text-fg tabular">
                        {pulse.rooms.vacantDirty}
                      </span>
                    </Link>

                    <Link
                      href="/housekeeping"
                      className="flex min-h-[68px] flex-col justify-between rounded-xl border border-line bg-surface-2/60 p-3 transition hover:bg-surface-2"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-fg-muted">
                        <span className="size-2 rounded-full bg-amber-400" /> Active HK Tasks
                      </span>
                      <span className="display text-2xl font-extrabold text-fg tabular">
                        {pulse.rooms.hkTodoCount + pulse.rooms.hkDoneToInspect}
                      </span>
                    </Link>
                  </div>
                </div>
              </Section>
            )}

            {/* Column 3: Today's Housekeeping Floor Queue (Large Touch Targets for Tablet/Mobile) */}
            {showHk && canRooms && pulse && (
              <Section
                title="3. Housekeeping Queue"
                description={`${pulse.rooms.hkInspectedToday} rooms inspected today · Tap card to update room status`}
                actions={
                  <Link href="/housekeeping" className="flex items-center gap-1 text-xs font-bold text-fg-muted hover:text-fg">
                    Full Board <ArrowRight className="size-3" />
                  </Link>
                }
              >
                {hkBoard && hkBoard.tasks.filter((tItem) => tItem.status !== 'INSPECTED' && tItem.status !== 'SKIPPED').length > 0 ? (
                  <div className="grid gap-2.5">
                    {hkBoard.tasks
                      .filter((tItem) => tItem.status !== 'INSPECTED' && tItem.status !== 'SKIPPED')
                      .slice(0, 5)
                      .map((task) => (
                        <Link
                          key={task.id}
                          href="/housekeeping"
                          className="flex min-h-[60px] items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 p-3 transition hover:border-line-strong hover:bg-surface-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg border border-line-strong bg-surface px-2 py-0.5 font-mono text-xs font-extrabold text-fg">
                                Rm {task.room.number}
                              </span>
                              <span className="truncate text-xs font-bold text-fg">
                                {task.room.roomTypeName}
                              </span>
                              {task.arrivalToday && (
                                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                  Arrival Today
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-fg-muted">
                              {task.kind} · {task.assignee?.name ? `Assigned: ${task.assignee.name}` : 'Unassigned cleaner'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Status value={task.status} />
                            <span className="inline-flex min-h-[36px] items-center rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg">
                              {task.status === 'DONE' ? 'Inspect →' : 'Clean →'}
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-8 text-center">
                    <CheckCircle2 className="size-6 text-success" />
                    <p className="text-xs font-bold text-success">
                      All scheduled room cleaning & inspection tasks are complete!
                    </p>
                    <Link
                      href="/housekeeping"
                      className="mt-1 inline-flex min-h-[36px] items-center rounded-lg border border-emerald-500/30 bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2"
                    >
                      Open Housekeeping Board →
                    </Link>
                  </div>
                )}
              </Section>
            )}
          </div>
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
                                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-surface" />
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
                                {w.status === 'NEW' && <span className="size-2 rounded-full bg-amber-500" />}
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

      {/* VIEWPORT-FIXED FLOATING ACTION BUTTON (FAB) MENU — Outside .fade-in so position:fixed never breaks */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
        {fabOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
              onClick={() => setFabOpen(false)}
            />
            <div className="relative z-40 mb-3 w-72 rounded-2xl border border-line-strong bg-surface p-2 shadow-[var(--shadow-lift)]">
              <div className="mb-1.5 flex items-center justify-between border-b border-line px-2.5 pb-2 pt-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">
                  Quick Action Center
                </span>
                <span className="text-[10.5px] text-fg-subtle">Instant Workflows</span>
              </div>

              <div className="grid gap-1">
                {can('bookings:write') && (
                  <Link
                    href="/reservations/new?walkin=1"
                    onClick={() => setFabOpen(false)}
                    className="flex min-h-[44px] items-center justify-between rounded-xl bg-fg px-3 py-2 text-xs font-bold text-bg transition hover:opacity-90"
                  >
                    <span className="flex items-center gap-2">
                      <Plus className="size-4" strokeWidth={2.5} />
                      <span>+ New Walk-In / Booking</span>
                    </span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}

                {canDesk && (pulse?.desk.lateArrivals ?? 0) > 0 && (
                  <Link
                    href="/desk"
                    onClick={() => setFabOpen(false)}
                    className="flex min-h-[44px] items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs font-bold text-danger transition hover:bg-rose-500/20"
                  >
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="size-4" />
                      <span>Resolve Overdue Arrivals</span>
                    </span>
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white tabular">
                      {pulse?.desk.lateArrivals}
                    </span>
                  </Link>
                )}

                {canDesk && (
                  <Link
                    href="/desk"
                    onClick={() => setFabOpen(false)}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2.5">
                      <ConciergeBell className="size-4 text-sky-500" />
                      <span>Check-In & Front Desk</span>
                    </span>
                    {(pulse?.desk.arrivalsToday ?? 0) > 0 ? (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-warning tabular">
                        {pulse?.desk.arrivalsToday} due
                      </span>
                    ) : (
                      <ArrowRight className="size-3.5 text-fg-subtle" />
                    )}
                  </Link>
                )}

                {canPos && (
                  <Link
                    href="/pos"
                    onClick={() => setFabOpen(false)}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2.5">
                      <UtensilsCrossed className="size-4 text-orange-500" />
                      <span>Add POS Charge</span>
                    </span>
                    {(pulse?.operations.posOpenOrders ?? 0) > 0 ? (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-warning tabular">
                        {pulse?.operations.posOpenOrders} open
                      </span>
                    ) : (
                      <ArrowRight className="size-3.5 text-fg-subtle" />
                    )}
                  </Link>
                )}

                {canRooms && (
                  <>
                    <Link
                      href="/rack"
                      onClick={() => setFabOpen(false)}
                      className="flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-2.5">
                        <LayoutGrid className="size-4 text-emerald-500" />
                        <span>Room Rack Status</span>
                      </span>
                      {pulse && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-success tabular">
                          {pulse.rooms.vacantClean} clean
                        </span>
                      )}
                    </Link>

                    <Link
                      href="/housekeeping"
                      onClick={() => setFabOpen(false)}
                      className="flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-2.5">
                        <SprayCan className="size-4 text-amber-500" />
                        <span>Housekeeping Queue</span>
                      </span>
                      {(pulse?.rooms.vacantDirty ?? 0) + (pulse?.rooms.hkTodoCount ?? 0) > 0 ? (
                        <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-warning tabular">
                          {(pulse?.rooms.vacantDirty ?? 0) + (pulse?.rooms.hkTodoCount ?? 0)} dirty
                        </span>
                      ) : (
                        <ArrowRight className="size-3.5 text-fg-subtle" />
                      )}
                    </Link>
                  </>
                )}

                {can('users:manage') && (
                  <Link
                    href="/settings/users?view=roles"
                    onClick={() => setFabOpen(false)}
                    className="flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4 text-violet-500" />
                      <span>Roles & Staff Access</span>
                    </span>
                    <ArrowRight className="size-3.5 text-fg-subtle" />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setFabOpen((v) => !v)}
          aria-expanded={fabOpen}
          className={cn(
            'relative z-40 inline-flex h-12 items-center gap-2 rounded-full px-4 text-xs font-extrabold shadow-[var(--shadow-lift)] transition-all active:scale-95',
            fabOpen
              ? 'bg-surface text-fg border border-line-strong'
              : 'bg-fg text-bg hover:opacity-95',
          )}
        >
          <Plus
            className={cn('size-4 transition-transform duration-200', fabOpen && 'rotate-45')}
            strokeWidth={2.5}
          />
          <span>{fabOpen ? 'Close Actions' : 'Quick Actions'}</span>
          {!fabOpen && (pulse?.desk.lateArrivals ?? 0) > 0 && (
            <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-rose-500 text-[10px] font-extrabold text-white tabular">
              {pulse?.desk.lateArrivals}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
