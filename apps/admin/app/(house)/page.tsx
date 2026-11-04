'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  BedDouble,
  BookOpenText,
  BrushCleaning,
  Building2,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ConciergeBell,
  CreditCard,
  DoorOpen,
  Dumbbell,
  FileSpreadsheet,
  Inbox,
  LayoutGrid,
  LogIn,
  LogOut,
  Megaphone,
  Play,
  Plus,
  Radio,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Sunset,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type {
  AdminPulseDTO,
  DashboardDTO,
  DeskBoardDTO,
  DeskStayDTO,
  HkBoardDTO,
  HkStatus,
  HkTaskDTO,
  HrDashboardDTO,
  RequisitionDTO,
  StaffAnnouncementDTO,
} from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, get, patch } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange, dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton, Status } from '@/components/ui/bits';
import { BarList, ColumnChart } from '@/components/charts/charts';
import { LiveOperationsConsole, type DashboardLens } from '@/components/house/live-console';
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  FolioChargeDialog,
  type StayRef,
} from '@/components/house/desk-dialogs';

const CHANNEL: Record<string, string> = {
  WEB_FORM: 'Website',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PHONE: 'Phone',
};

type BadgeTone = 'red' | 'amber' | 'green' | 'neutral';
type KpiAccent = 'emerald' | 'sky' | 'amber' | 'indigo' | 'orange' | 'teal' | 'violet' | 'rose';

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
        'card group relative flex flex-col justify-center px-3.5 py-3 transition-all duration-200 hover:border-line-strong hover:bg-surface-2/50 hover:shadow-md',
        accentStyle.border,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105',
              accentStyle.iconBg,
              accentStyle.iconText,
            )}
          >
            <Icon className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-fg-muted">
              {label}
            </span>
            <p className="truncate font-display text-[16px] font-extrabold leading-tight text-fg tabular">
              {value}
            </p>
          </div>
        </div>

        {badge && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular',
              TONE_PILL_CLASSES[badge.tone],
            )}
          >
            <span className={cn('size-1.5 rounded-full shrink-0', TONE_DOT_CLASSES[badge.tone])} />
            {badge.text}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line/60 pt-1.5 text-[11px] text-fg-muted">
        <span className="truncate font-medium">{sub}</span>
        <ArrowRight className="size-3 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>
    </Link>
  );
}

interface QuickActionItem {
  key: string;
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
  iconColor?: string;
  badge?: { text: string | number; tone: BadgeTone };
}

export default function Today() {
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();

  // Only the Owner gets executive analytics & financial stat strips on the main workspace.
  // All other staff (Front Desk, Housekeeping, POS, Club, Accountant, HR, Manager) get a pure, clutter-free work surface.
  const isOwner = me.role === 'OWNER';

  const canDashboard = can('dashboard:view');
  const canInbox = can('inbox:read');
  const canWaitlist = can('waitlist:read');
  const canContent = can('content:read');
  const canDesk = can('desk:operate');
  const canBookings = can('bookings:read');
  const canRooms = can('rooms:status');
  const canInspect = can('rooms:inspect');
  const canPos = can('pos:operate');
  const canClub = can('healthclub:operate');
  const canInv = can('inventory:manage');
  const canReq = can('requisitions:request') || can('requisitions:approve');
  const canReports = can('reports:read');
  const canHr = can('hr:manage');

  // Default lens tailored to user's role
  const defaultLens: DashboardLens =
    me.role === 'HOUSEKEEPING' && !canDesk
      ? 'HOUSEKEEPING'
      : canPos && !canDesk && !isOwner
        ? 'OPERATIONS'
        : 'ALL';

  const [lens, setLens] = useState<DashboardLens>(defaultLens);
  const [deskTab, setDeskTab] = useState<'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES' | 'LATE'>('ARRIVALS');
  const [deskDialog, setDeskDialog] = useState<{
    kind: 'in' | 'out' | 'assign' | 'charge';
    stay: StayRef;
  } | null>(null);

  // 1. Unified fast pulse (works for all authenticated roles)
  const {
    data: pulse,
    isLoading: pulseLoading,
    refetch: refetchPulse,
    isFetching: pulseFetching,
  } = useQuery({
    queryKey: ['admin-pulse'],
    queryFn: () => get<AdminPulseDTO>('/pulse'),
    refetchInterval: 25_000,
  });

  // 2. Dashboard threads & (for Owner) analytical charts
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
    refetchInterval: 25_000,
    enabled: canDesk,
  });

  // Auto-select the most actionable Front Desk tab on initial load
  useEffect(() => {
    if (deskBoard) {
      const late = deskBoard.lateArrivals?.length ?? 0;
      const arr = deskBoard.counts.arrivals ?? 0;
      const dep = deskBoard.counts.departures ?? 0;
      const inH = deskBoard.counts.inHouse ?? 0;
      if (late > 0) setDeskTab('LATE');
      else if (arr > 0) setDeskTab('ARRIVALS');
      else if (dep > 0) setDeskTab('DEPARTURES');
      else if (inH > 0) setDeskTab('IN_HOUSE');
    }
  }, [deskBoard]);

  // 4. Housekeeping board (when permitted)
  const { data: hkBoard } = useQuery({
    queryKey: ['hk-board-today'],
    queryFn: () => get<HkBoardDTO>('/housekeeping'),
    refetchInterval: 25_000,
    enabled: canRooms,
  });

  // 5. HR overview (only needed for Owner analytical view or HR staff)
  const { data: hrOverview } = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => get<HrDashboardDTO>('/hr/overview'),
    refetchInterval: 60_000,
    enabled: canHr && (isOwner || me.role === 'HR'),
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

  const refreshWorkspace = () => {
    refetchPulse();
    qc.invalidateQueries({ queryKey: ['desk-board-today'] });
    qc.invalidateQueries({ queryKey: ['desk'] });
    qc.invalidateQueries({ queryKey: ['hk-board-today'] });
    qc.invalidateQueries({ queryKey: ['housekeeping'] });
    qc.invalidateQueries({ queryKey: ['rack'] });
    qc.invalidateQueries({ queryKey: ['live-console'] });
  };

  // Direct Housekeeping Task Mutation from Workspace
  const hkTaskMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      patch(`/housekeeping/tasks/${id}`, body),
    onSuccess: () => {
      toast.success('Housekeeping task updated');
      refreshWorkspace();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update task'),
  });

  // Direct Room Clean Status Mutation from Workspace
  const quickRoomStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HkStatus }) =>
      patch(`/rack/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Room status updated');
      refreshWorkspace();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update room'),
  });

  const toStayRef = (s: DeskStayDTO): StayRef => ({
    ...s,
    keep: s.rooms.flatMap((rr) =>
      rr.assigned.map((a) => ({ reservationRoomId: rr.reservationRoomId, roomId: a.roomId })),
    ),
  });

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  }).format(new Date());

  const roleBadgeLabel: Record<string, string> = {
    OWNER: 'Proprietor & Executive Workspace',
    MANAGER: 'Operations & Management Workspace',
    HR: 'HR & Staff Workspace',
    ACCOUNTANT: 'Accounts & Billing Workspace',
    DESK: 'Front Desk & Guest Workspace',
    KITCHEN: 'Kitchen Operations Workspace',
    BAR: 'Bar & Beverage Workspace',
    GYM: 'Health Club & Spa Workspace',
    HOUSEKEEPING: 'Housekeeping & Room Readiness Workspace',
  };

  // Build role-tailored Quick Actions Bar right at the top of the workspace
  const quickActions: QuickActionItem[] = [];

  if (can('bookings:write')) {
    quickActions.push({
      key: 'walkin',
      label: '+ Walk-In / Booking',
      sub: 'New stay or reservation',
      href: '/reservations/new?walkin=1',
      icon: Plus,
      primary: true,
    });
  }

  if (canDesk) {
    const dueArrivals = (pulse?.desk.lateArrivals ?? 0) + (pulse?.desk.arrivalsToday ?? 0);
    quickActions.push({
      key: 'desk',
      label: 'Front Desk & Check-In',
      sub: `${pulse?.desk.inHouse ?? 0} in-house · ${pulse?.desk.departuresToday ?? 0} departing`,
      href: '/desk',
      icon: ConciergeBell,
      iconColor: 'text-sky-500',
      badge:
        (pulse?.desk.lateArrivals ?? 0) > 0
          ? { text: `${pulse?.desk.lateArrivals} late`, tone: 'red' }
          : dueArrivals > 0
            ? { text: `${dueArrivals} arriving`, tone: 'amber' }
            : undefined,
    });
  }

  if (canRooms) {
    const dirtyCount = (pulse?.rooms.vacantDirty ?? 0) + (pulse?.rooms.hkTodoCount ?? 0);
    quickActions.push({
      key: 'hk',
      label: me.role === 'HOUSEKEEPING' ? 'My Cleaning Queue' : 'Housekeeping Queue',
      sub: `${pulse?.rooms.vacantClean ?? 0}/${pulse?.rooms.totalActive ?? 0} rooms ready`,
      href: '/housekeeping',
      icon: SprayCan,
      primary: me.role === 'HOUSEKEEPING' && !can('bookings:write'),
      iconColor: 'text-amber-500',
      badge:
        dirtyCount > 0
          ? { text: `${dirtyCount} dirty`, tone: 'amber' }
          : (pulse?.rooms.hkDoneToInspect ?? 0) > 0
            ? { text: `${pulse?.rooms.hkDoneToInspect} inspect`, tone: 'amber' }
            : { text: 'All clean', tone: 'green' },
    });

    quickActions.push({
      key: 'rack',
      label: 'Room Rack',
      sub: 'Live room status & floor plan',
      href: '/rack',
      icon: LayoutGrid,
      iconColor: 'text-emerald-500',
      badge: pulse
        ? { text: `${pulse.rooms.vacantClean} clean`, tone: 'green' }
        : undefined,
    });
  }

  if (canPos) {
    quickActions.push({
      key: 'pos',
      label: canDesk || isOwner ? 'POS: Kitchen & Bar' : '+ New POS Order',
      sub: 'Food, drinks & room tabs',
      href: '/pos',
      icon: UtensilsCrossed,
      primary: !can('bookings:write') && (me.role === 'KITCHEN' || me.role === 'BAR'),
      iconColor: 'text-orange-500',
      badge:
        (pulse?.operations.posOpenOrders ?? 0) > 0
          ? { text: `${pulse?.operations.posOpenOrders} open`, tone: 'amber' }
          : undefined,
    });
  }

  if (canClub) {
    quickActions.push({
      key: 'club',
      label: 'Health Club & Spa',
      sub: 'Day passes & gym check-in',
      href: '/health-club',
      icon: Dumbbell,
      primary: me.role === 'GYM' && !can('bookings:write'),
      iconColor: 'text-teal-500',
      badge:
        (pulse?.operations.healthClubInsideNow ?? 0) > 0
          ? { text: `${pulse?.operations.healthClubInsideNow} active`, tone: 'green' }
          : undefined,
    });
  }

  if (canInbox) {
    quickActions.push({
      key: 'inbox',
      label: 'Guest Inbox',
      sub: 'WhatsApp, email & enquiries',
      href: '/inbox',
      icon: Inbox,
      iconColor: 'text-violet-500',
      badge:
        (pulse?.inbox.newCount ?? 0) > 0
          ? { text: `${pulse?.inbox.newCount} new`, tone: 'amber' }
          : undefined,
    });
  }

  if (canReq) {
    quickActions.push({
      key: 'reqs',
      label: 'Store Requisitions',
      sub: 'Request or approve stock',
      href: '/requisitions',
      icon: ClipboardCheck,
      iconColor: 'text-teal-500',
      badge:
        (pulse?.operations.urgentRequisitions ?? 0) > 0
          ? { text: `${pulse?.operations.urgentRequisitions} urgent`, tone: 'red' }
          : (pulse?.operations.pendingRequisitions ?? 0) > 0
            ? { text: `${pulse?.operations.pendingRequisitions} pending`, tone: 'amber' }
            : undefined,
    });
  }

  if (canHr) {
    quickActions.push({
      key: 'hr-staff',
      label: me.role === 'HR' ? '+ Add / Staff Directory' : 'Staff Directory',
      sub: `${pulse?.hr.activeStaff ?? 0} active · ${pulse?.hr.departmentsCount ?? 0} depts`,
      href: '/hr?tab=STAFF',
      icon: Users,
      primary: me.role === 'HR' && !can('bookings:write'),
      iconColor: 'text-rose-500',
    });

    quickActions.push({
      key: 'hr-roster',
      label: 'Shift Rosters',
      sub: `${pulse?.hr.shiftsToday ?? 0} shifts scheduled today`,
      href: '/hr?tab=ROSTER',
      icon: Clock,
      iconColor: 'text-sky-500',
    });

    quickActions.push({
      key: 'hr-leave',
      label: 'Leave Requests',
      sub: 'Annual & statutory time off',
      href: '/hr?tab=LEAVE',
      icon: CalendarDays,
      iconColor: 'text-amber-500',
      badge:
        (pulse?.hr.pendingLeaves ?? 0) > 0
          ? { text: `${pulse?.hr.pendingLeaves} pending`, tone: 'amber' }
          : undefined,
    });

    quickActions.push({
      key: 'hr-payroll',
      label: 'Payroll & Taxes',
      sub: 'URA PAYE, NSSF & payslips',
      href: '/hr?tab=PAYROLL',
      icon: CreditCard,
      iconColor: 'text-emerald-500',
    });
  }

  if (!isOwner && can('receipts:read')) {
    quickActions.push({
      key: 'receipts',
      label: 'Receipts & Folios',
      sub: 'Print receipts & settle bills',
      href: '/receipts',
      icon: Receipt,
      iconColor: 'text-indigo-500',
    });
  }

  if (isOwner) {
    quickActions.push({
      key: 'brief',
      label: 'Owner Brief',
      sub: 'Daily revenue & audit summary',
      href: '/brief',
      icon: Sunset,
      iconColor: 'text-amber-500',
    });
    quickActions.push({
      key: 'reports',
      label: 'Financial Reports',
      sub: 'Ledger, P&L & tax exports',
      href: '/reports',
      icon: FileSpreadsheet,
      iconColor: 'text-emerald-500',
    });
  }

  // Lenses for Owner (includes Executive & Analytics) vs Operational Staff (strictly work views)
  const lenses: { id: DashboardLens; label: string; icon: LucideIcon; badge?: number; tone?: BadgeTone }[] = [
    ...(me.role !== 'HOUSEKEEPING' || canDesk
      ? [{ id: 'ALL' as const, label: isOwner ? 'All Workspace' : 'My Workspace', icon: Radio }]
      : []),
    ...(isOwner
      ? [
          {
            id: 'EXECUTIVE' as const,
            label: 'Analytics & Finance',
            icon: TrendingUp,
            badge: pulse?.finance.clearedTodayCount || undefined,
            tone: 'green' as const,
          },
        ]
      : []),
    ...(canDesk || canBookings
      ? [
          {
            id: 'DESK' as const,
            label: 'Front Desk',
            icon: ConciergeBell,
            badge:
              (pulse?.desk.lateArrivals ?? 0) +
                (pulse?.desk.arrivalsToday ?? 0) +
                (pulse?.desk.departuresToday ?? 0) ||
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
            label: 'Rooms & Cleaning',
            icon: SprayCan,
            badge:
              (pulse?.rooms.vacantDirty ?? 0) +
                (pulse?.rooms.hkTodoCount ?? 0) +
                (pulse?.rooms.hkDoneToInspect ?? 0) ||
              undefined,
            tone:
              (pulse?.rooms.vacantDirty ?? 0) +
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
            label: 'POS & Supplies',
            icon: UtensilsCrossed,
            badge:
              (pulse?.operations.posOpenOrders ?? 0) +
                (pulse?.operations.pendingRequisitions ?? 0) ||
              undefined,
            tone:
              (pulse?.operations.urgentRequisitions ?? 0) > 0
                ? ('red' as const)
                : ('amber' as const),
          },
        ]
      : []),
    ...(canInbox || canWaitlist
      ? [
          {
            id: 'HR_COMMS' as const,
            label: 'Inbox & Enquiries',
            icon: Inbox,
            badge: (pulse?.inbox.newCount ?? 0) + (pulse?.waitlist.newCount ?? 0) || undefined,
            tone: 'amber' as const,
          },
        ]
      : []),
  ];

  const pendingReqs = (requisitions ?? []).filter(
    (r) => r.status === 'PENDING' || r.status === 'MANAGER_APPROVED',
  );
  const pinnedComms = (announcements ?? []).slice(0, 3);

  const showExecutive = isOwner && (lens === 'ALL' || lens === 'EXECUTIVE');
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
      <div className="fade-in space-y-5 pb-12">
        <PageHeader
          title={`${isOwner ? 'Executive Workspace' : 'Workspace'} · ${me.name.split(' ')[0]}`}
          description={`${todayFormatted} · ${me.customRoleName || me.jobTitle || roleBadgeLabel[me.role] || me.role}`}
          actions={
            <div className="flex items-center gap-2">
              {can('bookings:write') && (
                <Button size="sm" variant="primary" href="/reservations/new?walkin=1" icon={<Plus className="size-3.5" />}>
                  Walk-In / Booking
                </Button>
              )}
              <button
                type="button"
                onClick={refreshWorkspace}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-fg-muted transition hover:border-line-strong hover:text-fg"
                title="Refresh live workspace"
              >
                <RefreshCw className={cn('size-3.5', pulseFetching && 'animate-spin')} />
                <span className="hidden sm:inline">Sync</span>
              </button>
            </div>
          }
        />

        {/* 1. QUICK ACTIONS WORKSPACE BAR — Front-and-center daily tools for every role */}
        <section
          aria-label="Quick Actions"
          className="rounded-2xl border border-line bg-surface p-3 shadow-2xs"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg">
                Quick Actions
              </span>
              <span className="hidden text-[11px] text-fg-muted sm:inline">
                — One-click access to your daily tools & active queues
              </span>
            </div>

            {/* Compact Workspace Filter Tabs */}
            {lenses.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {lenses.map((l) => {
                  const active = lens === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLens(l.id)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-all',
                        active
                          ? 'bg-fg text-bg shadow-2xs'
                          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      <l.icon className="size-3" strokeWidth={2} />
                      <span>{l.label}</span>
                      {l.badge !== undefined && l.badge > 0 && (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.2 text-[9.5px] font-bold tabular leading-tight',
                            l.tone === 'red'
                              ? 'bg-rose-500 text-white'
                              : active
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-amber-500/20 text-warning',
                          )}
                        >
                          {l.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  className={cn(
                    'group flex flex-col justify-between gap-2 rounded-xl border p-3 transition-all',
                    action.primary
                      ? 'border-fg bg-fg text-bg shadow-xs hover:opacity-95'
                      : 'border-line bg-surface-2/35 text-fg hover:border-line-strong hover:bg-surface-2/80',
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg',
                        action.primary
                          ? 'bg-white/15 text-bg'
                          : 'bg-surface border border-line/80',
                        !action.primary && action.iconColor,
                      )}
                    >
                      <Icon className="size-4" strokeWidth={2.2} />
                    </span>

                    {action.badge ? (
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold tabular',
                          action.primary
                            ? 'border-white/25 bg-white/15 text-bg'
                            : TONE_PILL_CLASSES[action.badge.tone],
                        )}
                      >
                        {action.badge.text}
                      </span>
                    ) : (
                      <ArrowRight
                        className={cn(
                          'size-3.5 transition-transform group-hover:translate-x-0.5',
                          action.primary ? 'text-bg/75' : 'text-fg-subtle',
                        )}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate text-xs font-extrabold',
                        action.primary ? 'text-bg' : 'text-fg',
                      )}
                    >
                      {action.label}
                    </p>
                    {action.sub && (
                      <p
                        className={cn(
                          'mt-0.5 truncate text-[10.5px]',
                          action.primary ? 'text-bg/75' : 'text-fg-muted',
                        )}
                      >
                        {action.sub}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 2. OWNER-ONLY EXECUTIVE FINANCIAL & ANALYTICAL SUMMARY STRIP */}
        {isOwner && showExecutive && (
          <section aria-label="Owner Financial Summary">
            {pulseLoading || !pulse ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Cleared Revenue Today"
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
                      : { text: 'Owner Brief', tone: 'neutral' }
                  }
                />

                <KpiCard
                  label="POS & Club Revenue"
                  icon={UtensilsCrossed}
                  accent="orange"
                  value={money(pulse.operations.posRevenueTodayUgxMinor, 'UGX')}
                  sub={`${pulse.operations.posCompletedToday} settled · ${pulse.operations.healthClubInsideNow} in Gym/Spa`}
                  href="/pos"
                  badge={
                    pulse.operations.posOpenOrders > 0
                      ? { text: `${pulse.operations.posOpenOrders} open tabs`, tone: 'amber' }
                      : { text: `${pulse.operations.posCompletedToday} settled`, tone: 'green' }
                  }
                />

                <KpiCard
                  label="House Occupancy"
                  icon={BedDouble}
                  accent="emerald"
                  value={`${occupancyPct}% (${pulse.rooms.occupied}/${pulse.rooms.totalActive})`}
                  sub={`${pulse.rooms.vacantClean} clean ready · ${pulse.desk.guestsInHouse} guests in-house`}
                  href="/rack"
                  badge={{
                    text: `${pulse.rooms.vacantClean} ready`,
                    tone: pulse.rooms.vacantClean > 0 ? 'green' : 'amber',
                  }}
                />

                <KpiCard
                  label="Bookings & Payroll"
                  icon={BookOpenText}
                  accent="indigo"
                  value={`${pulse.reservations.confirmedCount} Confirmed`}
                  sub={`${pulse.reservations.upcoming7d} next 7d · ${pulse.hr.activeStaff} staff (${money(hrOverview?.totalMonthlyPayrollMinor || '0', 'UGX')}/mo)`}
                  href="/reservations"
                  badge={
                    pulse.reservations.heldCount > 0
                      ? { text: `${pulse.reservations.heldCount} held`, tone: 'amber' }
                      : { text: `${pulse.reservations.upcoming7d} upcoming`, tone: 'neutral' }
                  }
                />
              </div>
            )}
          </section>
        )}

        {/* 3. LIVE OPERATIONS CONSOLE (Priority Task Spotlight & Live Activity Stream) */}
        <LiveOperationsConsole lens={lens} onLensChange={setLens} />

        {/* 4. INTERACTIVE WORKBENCHES: FRONT DESK & HOUSEKEEPING */}
        {((showDesk && canDesk) || (showHk && canRooms)) && (
          <div
            className={cn(
              'grid gap-4',
              showDesk && canDesk && showHk && canRooms
                ? 'xl:grid-cols-[1.35fr_1fr]'
                : 'grid-cols-1',
            )}
          >
            {/* Workbench A: Interactive Front Desk Action Queue */}
            {showDesk && canDesk && (
              <Section
                title="Front Desk Workbench"
                description="Check in arriving guests, assign rooms, settle folios, and check out departures directly"
                actions={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex rounded-lg border border-line bg-surface-2/60 p-0.5 text-[11px] font-semibold">
                      {(
                        [
                          ...(deskBoard && deskBoard.lateArrivals.length > 0
                            ? [
                                {
                                  id: 'LATE' as const,
                                  label: `Overdue (${deskBoard.lateArrivals.length})`,
                                },
                              ]
                            : []),
                          {
                            id: 'ARRIVALS' as const,
                            label: `Arrivals (${deskBoard?.counts.arrivals ?? pulse?.desk.arrivalsToday ?? 0})`,
                          },
                          {
                            id: 'IN_HOUSE' as const,
                            label: `In-House (${deskBoard?.counts.inHouse ?? pulse?.desk.inHouse ?? 0})`,
                          },
                          {
                            id: 'DEPARTURES' as const,
                            label: `Departures (${deskBoard?.counts.departures ?? pulse?.desk.departuresToday ?? 0})`,
                          },
                        ]
                      ).map((tItem) => (
                        <button
                          key={tItem.id}
                          type="button"
                          onClick={() => setDeskTab(tItem.id)}
                          className={cn(
                            'min-h-[30px] rounded-md px-2.5 py-1 transition',
                            deskTab === tItem.id
                              ? 'bg-surface text-fg shadow-2xs'
                              : 'text-fg-muted hover:text-fg',
                          )}
                        >
                          {tItem.label}
                        </button>
                      ))}
                    </div>
                    <Link
                      href="/desk"
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                    >
                      Full Desk <ArrowRight className="size-3" />
                    </Link>
                  </div>
                }
              >
                {!deskBoard ? (
                  <div className="space-y-2.5">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(() => {
                      const list =
                        deskTab === 'LATE'
                          ? deskBoard.lateArrivals
                          : deskTab === 'ARRIVALS'
                            ? deskBoard.arrivals
                            : deskTab === 'IN_HOUSE'
                              ? deskBoard.inHouse
                              : deskBoard.departures;

                      if (list.length === 0) {
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-4 text-xs text-fg-muted">
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="size-4 text-emerald-500" />
                              <span>
                                No stays in the{' '}
                                <strong className="font-semibold text-fg">
                                  {deskTab.toLowerCase().replace('_', '-')}
                                </strong>{' '}
                                queue right now.
                              </span>
                            </span>
                            {can('bookings:write') && (
                              <Button
                                size="sm"
                                variant="secondary"
                                href="/reservations/new?walkin=1"
                                icon={<Plus className="size-3.5" />}
                              >
                                New Walk-In / Booking
                              </Button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="grid gap-2">
                          {list.slice(0, 6).map((stay) => {
                            const assignedRooms = stay.rooms
                              .flatMap((r) => r.assigned.map((a) => a.number))
                              .join(', ');
                            const balance = BigInt(stay.balanceMinor || '0');
                            const canCheckIn =
                              (deskTab === 'ARRIVALS' || deskTab === 'LATE') &&
                              stay.status === 'CONFIRMED';
                            const canCheckOut = stay.status === 'IN_HOUSE';

                            return (
                              <div
                                key={stay.id}
                                className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-surface-2/35 p-3.5 transition hover:border-line-strong sm:flex-row sm:items-center"
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
                                    <span className="font-mono text-[11px] font-semibold text-fg-subtle">
                                      {stay.code}
                                    </span>
                                    <Status value={stay.status} />
                                  </div>
                                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                                    <span className="font-medium text-fg">
                                      {stay.rooms
                                        .map((r) => `${r.quantity}× ${r.roomTypeName}`)
                                        .join(', ')}
                                    </span>
                                    <span>·</span>
                                    {assignedRooms ? (
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-success">
                                        Rm {assignedRooms}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeskDialog({ kind: 'assign', stay: toStayRef(stay) })
                                        }
                                        className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-warning hover:bg-amber-500/25"
                                      >
                                        <DoorOpen className="size-3" />
                                        Assign Room
                                      </button>
                                    )}
                                    <span>·</span>
                                    <span>
                                      {stay.nights}n ({dateShort(stay.arrival)} →{' '}
                                      {dateShort(stay.departure)})
                                    </span>
                                    <span>·</span>
                                    {balance > 0n ? (
                                      <span className="font-bold text-warning tabular">
                                        Due {money(balance.toString(), stay.currency)}
                                      </span>
                                    ) : (
                                      <span className="font-bold text-success">Paid</span>
                                    )}
                                  </p>
                                </div>

                                {/* Direct One-Click Desk Work Actions */}
                                <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2 sm:border-t-0 sm:pt-0">
                                  {!assignedRooms && stay.status !== 'CHECKED_OUT' && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      icon={<DoorOpen className="size-3.5" />}
                                      onClick={() =>
                                        setDeskDialog({ kind: 'assign', stay: toStayRef(stay) })
                                      }
                                    >
                                      Assign Rm
                                    </Button>
                                  )}

                                  {canCheckIn && (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon={<LogIn className="size-3.5" />}
                                      onClick={() =>
                                        setDeskDialog({ kind: 'in', stay: toStayRef(stay) })
                                      }
                                    >
                                      Check In
                                    </Button>
                                  )}

                                  {['CONFIRMED', 'IN_HOUSE', 'HELD'].includes(stay.status) && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      icon={<Receipt className="size-3.5" />}
                                      onClick={() =>
                                        setDeskDialog({ kind: 'charge', stay: toStayRef(stay) })
                                      }
                                    >
                                      {stay.status === 'HELD' ? 'Take Deposit' : 'Folio / Pay'}
                                    </Button>
                                  )}

                                  {canCheckOut && (
                                    <Button
                                      size="sm"
                                      variant={deskTab === 'DEPARTURES' ? 'primary' : 'secondary'}
                                      icon={<LogOut className="size-3.5" />}
                                      onClick={() =>
                                        setDeskDialog({ kind: 'out', stay: toStayRef(stay) })
                                      }
                                    >
                                      Check Out
                                    </Button>
                                  )}
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

            {/* Workbench B: Interactive Housekeeping & Room Readiness */}
            {showHk && canRooms && (
              <Section
                title="Rooms & Housekeeping Workbench"
                description="Clean dirty rooms, start or complete room tasks, and inspect turnovers"
                actions={
                  <div className="flex items-center gap-2">
                    <Link
                      href="/rack"
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-fg-muted hover:border-line-strong hover:text-fg"
                    >
                      Room Rack
                    </Link>
                    <Link
                      href="/housekeeping"
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                    >
                      Full Board <ArrowRight className="size-3" />
                    </Link>
                  </div>
                }
              >
                <div className="space-y-3">
                  {/* Compact Room Status Bar (Replaces the 7 nested boxes) */}
                  {pulse && (
                    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href="/rack"
                            className="inline-flex items-center gap-1.5 font-bold text-success hover:underline"
                          >
                            <span className="size-2 rounded-full bg-emerald-500" />
                            <span>{pulse.rooms.vacantClean} Ready</span>
                          </Link>
                          <Link
                            href="/rack"
                            className="inline-flex items-center gap-1.5 font-bold text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            <span className="size-2 rounded-full bg-sky-500" />
                            <span>{pulse.rooms.occupied} Occupied</span>
                          </Link>
                          <Link
                            href="/housekeeping"
                            className="inline-flex items-center gap-1.5 font-bold text-warning hover:underline"
                          >
                            <span className="size-2 rounded-full bg-amber-500" />
                            <span>{pulse.rooms.vacantDirty} Dirty</span>
                          </Link>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-fg-muted tabular">
                          {pulse.rooms.vacantClean}/{pulse.rooms.totalActive} Clean
                        </span>
                      </div>

                      {pulse.rooms.totalActive > 0 && (
                        <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
                          <div
                            style={{
                              width: `${(pulse.rooms.vacantClean / pulse.rooms.totalActive) * 100}%`,
                            }}
                            className="bg-emerald-500 transition-all"
                          />
                          <div
                            style={{
                              width: `${(pulse.rooms.occupied / pulse.rooms.totalActive) * 100}%`,
                            }}
                            className="bg-sky-500 transition-all"
                          />
                          <div
                            style={{
                              width: `${(pulse.rooms.vacantDirty / pulse.rooms.totalActive) * 100}%`,
                            }}
                            className="bg-amber-500 transition-all"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Active Housekeeping Tasks & Dirty Rooms Queue with Direct One-Click Actions */}
                  {(() => {
                    const tasks: HkTaskDTO[] = hkBoard?.tasks ?? [];
                    const actionableTasks = tasks.filter(
                      (tItem) =>
                        tItem.status === 'TODO' ||
                        tItem.status === 'IN_PROGRESS' ||
                        (canInspect && tItem.status === 'DONE'),
                    );
                    const dirtyRoomsWithoutTask = (hkBoard?.rooms ?? []).filter(
                      (r) =>
                        r.hkStatus === 'VACANT_DIRTY' &&
                        !actionableTasks.some((tItem) => tItem.room.id === r.id),
                    );

                    if (actionableTasks.length === 0 && dirtyRoomsWithoutTask.length === 0) {
                      return (
                        <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-3 text-xs font-medium text-success">
                          <span className="flex items-center gap-2">
                            <Sparkles className="size-4 shrink-0" />
                            <span>All rooms are clean and housekeeping tasks are up to date.</span>
                          </span>
                          <Link href="/housekeeping" className="font-bold underline">
                            Open Board →
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                        {actionableTasks.slice(0, 5).map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between gap-2.5 rounded-xl border border-line bg-surface p-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-display text-sm font-extrabold text-fg">
                                  Rm {task.room.number}
                                </span>
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                  {task.kind.replace('_', ' ')}
                                </span>
                                <Status value={task.status} />
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                                {task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'}
                                {task.notes ? ` · ${task.notes}` : ''}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {task.status === 'TODO' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Play className="size-3" />}
                                  loading={hkTaskMutation.isPending}
                                  onClick={() =>
                                    hkTaskMutation.mutate({
                                      id: task.id,
                                      body: {
                                        status: 'IN_PROGRESS',
                                        assigneeUserId: task.assignee?.id ?? me.id,
                                      },
                                    })
                                  }
                                >
                                  Start
                                </Button>
                              )}

                              {(task.status === 'TODO' || task.status === 'IN_PROGRESS') && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<BrushCleaning className="size-3.5" />}
                                  loading={hkTaskMutation.isPending}
                                  onClick={() =>
                                    hkTaskMutation.mutate({
                                      id: task.id,
                                      body: { status: 'DONE' },
                                    })
                                  }
                                >
                                  Mark Clean
                                </Button>
                              )}

                              {task.status === 'DONE' && canInspect && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<CheckCheck className="size-3.5" />}
                                  loading={hkTaskMutation.isPending}
                                  onClick={() =>
                                    hkTaskMutation.mutate({
                                      id: task.id,
                                      body: { status: 'INSPECTED' },
                                    })
                                  }
                                >
                                  Inspect
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}

                        {dirtyRoomsWithoutTask.slice(0, 4).map((room) => (
                          <div
                            key={room.id}
                            className="flex items-center justify-between gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-display text-sm font-extrabold text-fg">
                                  Rm {room.number}
                                </span>
                                <span className="text-[11px] font-medium text-fg-muted">
                                  {room.roomType.name}
                                </span>
                                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                  VACANT DIRTY
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-fg-muted">
                                Floor {room.floor} · Needs turnover cleaning before next check-in
                              </p>
                            </div>

                            <Button
                              size="sm"
                              variant="primary"
                              icon={<BrushCleaning className="size-3.5" />}
                              loading={quickRoomStatusMutation.isPending}
                              onClick={() =>
                                quickRoomStatusMutation.mutate({
                                  id: room.id,
                                  status: canInspect ? 'INSPECTED' : 'VACANT_CLEAN',
                                })
                              }
                            >
                              Mark Clean
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* 5. ACTIVE WORK QUEUES: INBOX ENQUIRIES, REQUISITIONS & HANDOVER NOTES */}
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Guest Inbox Work Queue */}
          {(showHrComms || showDesk) && canInbox && dashboardData && (
            <Section
              title="Guest Enquiries Queue"
              description="Reply to guest messages across WhatsApp, website & email"
              actions={
                <Link
                  href="/inbox"
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                >
                  Open Inbox ({pulse?.inbox.newCount ?? 0} new) <ArrowRight className="size-3" />
                </Link>
              }
            >
              {dashboardData.latestConversations.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-xs font-medium text-success">
                  <CheckCircle2 className="size-4 shrink-0" />
                  All guest enquiries have been answered.
                </div>
              ) : (
                <ul className="-my-1 divide-y divide-line">
                  {dashboardData.latestConversations.slice(0, 5).map((c) => (
                    <li key={c.id} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/inbox/${c.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg p-1.5 transition hover:bg-surface-2"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                          <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold">
                            {c.contact.name
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')}
                            {c.status === 'NEW' && (
                              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-surface" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="truncate font-bold text-fg">{c.contact.name}</span>
                              <span className="text-[10.5px] text-fg-subtle">
                                {CHANNEL[c.channel]}
                              </span>
                              <span className="text-[10.5px] text-fg-subtle">
                                · {ago(c.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-fg-muted">{c.preview}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Status value={c.status} />
                          <span className="text-xs font-bold text-accent">Reply →</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Supply Requisitions & Shift Handover Notes */}
          {showOps && (canReq || pinnedComms.length > 0) && (
            <Section
              title="Store Requisitions & Shift Handover"
              description="Pending department supply requests and pinned team announcements"
              actions={
                canReq ? (
                  <Link
                    href="/requisitions"
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                  >
                    Requisitions <ArrowRight className="size-3" />
                  </Link>
                ) : undefined
              }
            >
              <div className="space-y-3">
                {pinnedComms.length > 0 && (
                  <div className="space-y-1.5">
                    {pinnedComms.map((c) => (
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

                {canReq && (
                  <>
                    {pendingReqs.length === 0 ? (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs font-medium text-success">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span>Zero pending requisitions awaiting action.</span>
                        </span>
                        <Link href="/requisitions" className="font-bold underline">
                          + Request Stock
                        </Link>
                      </div>
                    ) : (
                      <ul className="divide-y divide-line">
                        {pendingReqs.slice(0, 4).map((req) => (
                          <li
                            key={req.id}
                            className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-fg-subtle">
                                  {req.number}
                                </span>
                                <span className="truncate text-xs font-semibold text-fg">
                                  {req.title}
                                </span>
                                {req.priority === 'URGENT' && (
                                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-fg-muted">
                                {req.department} · by {req.requestedByName} · {ago(req.createdAt)}
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
                  </>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* 6. OWNER-ONLY ANALYTICAL CHARTS (30d Demand & Waitlist Breakdown) */}
        {isOwner && showExecutive && canDashboard && (canInbox || canWaitlist) && (
          <>
            {dashLoading || !dashboardData ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Skeleton className="h-60" />
                <Skeleton className="h-60" />
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                {canInbox && (
                  <Section
                    title="Guest Enquiry Volume (30 Days)"
                    description="Owner analytical trend of daily incoming guest demand"
                  >
                    <ColumnChart data={dashboardData.enquiriesByDay} label="Enquiries" />
                  </Section>
                )}
                {canWaitlist && (
                  <Section
                    title="Waitlist Demand by Room Type"
                    description="Room category preference across waitlist signups"
                  >
                    {dashboardData.waitlistByRoomType.length ? (
                      <BarList
                        data={dashboardData.waitlistByRoomType.map((r) => ({
                          label: t(r.name),
                          value: r.count,
                        }))}
                      />
                    ) : (
                      <p className="text-xs text-fg-muted">No waitlist entries recorded yet.</p>
                    )}
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Interactive Front Desk Modals Mounted Directly on the Workspace */}
      <CheckInDialog
        stay={deskDialog?.kind === 'in' ? deskDialog.stay : null}
        open={deskDialog?.kind === 'in'}
        onClose={() => setDeskDialog(null)}
        onDone={() => {
          setDeskDialog(null);
          refreshWorkspace();
        }}
      />
      <CheckOutDialog
        stay={deskDialog?.kind === 'out' ? deskDialog.stay : null}
        open={deskDialog?.kind === 'out'}
        onClose={() => setDeskDialog(null)}
        onDone={() => {
          setDeskDialog(null);
          refreshWorkspace();
        }}
      />
      <AssignRoomDialog
        stay={deskDialog?.kind === 'assign' ? deskDialog.stay : null}
        open={deskDialog?.kind === 'assign'}
        onClose={() => setDeskDialog(null)}
        onDone={() => {
          setDeskDialog(null);
          refreshWorkspace();
        }}
      />
      <FolioChargeDialog
        stay={deskDialog?.kind === 'charge' ? deskDialog.stay : null}
        open={deskDialog?.kind === 'charge'}
        onClose={() => setDeskDialog(null)}
        onDone={() => {
          setDeskDialog(null);
          refreshWorkspace();
        }}
      />
    </>
  );
}
