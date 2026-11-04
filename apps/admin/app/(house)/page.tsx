'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlarmClock,
  ArrowRight,
  BedDouble,
  BellRing,
  BookOpenText,
  BrushCleaning,
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
  FileText,
  Inbox,
  LayoutGrid,
  ListChecks,
  LogIn,
  LogOut,
  Megaphone,
  MessageSquareWarning,
  PackageX,
  Play,
  Plus,
  Radio,
  Receipt,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  SprayCan,
  Sunset,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
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
  PosOrderDTO,
  RackRoomDTO,
  RequisitionDTO,
  StaffAnnouncementDTO,
} from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, get, patch } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { useNow } from '@/lib/use-now';
import { Button } from '@/components/ui/button';
import { Section, Skeleton, Status } from '@/components/ui/bits';
import { BarList, ColumnChart } from '@/components/charts/charts';
import { type DashboardLens } from '@/components/house/live-console';
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  FolioChargeDialog,
  type StayRef,
} from '@/components/house/desk-dialogs';
import { AttentionRail, type AttentionItem } from '@/components/dashboard/attention';
import { RoomMap } from '@/components/dashboard/room-map';
import { PosLive } from '@/components/dashboard/pos-live';

const CHANNEL: Record<string, string> = {
  WEB_FORM: 'Website',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PHONE: 'Phone',
};

type BadgeTone = 'red' | 'amber' | 'green' | 'neutral';
type KpiAccent = 'emerald' | 'amber' | 'indigo' | 'orange';
type DeskTab = 'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES' | 'LATE';

const DESK_TAB_LABEL: Record<DeskTab, string> = {
  LATE: 'overdue',
  ARRIVALS: 'arrivals',
  IN_HOUSE: 'in-house',
  DEPARTURES: 'departures',
};

const TONE_PILL_CLASSES: Record<BadgeTone, string> = {
  red: 'border-rose-500/35 bg-rose-500/12 text-danger font-bold',
  amber: 'border-amber-500/35 bg-amber-500/12 text-warning font-semibold',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-success font-semibold',
  neutral: 'border-line bg-surface-2 text-fg-muted font-medium',
};

const KPI_ACCENT: Record<KpiAccent, { bar: string; icon: string }> = {
  emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' },
  amber: { bar: 'bg-amber-500', icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-400' },
  indigo: { bar: 'bg-indigo-500', icon: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400' },
  orange: { bar: 'bg-orange-500', icon: 'bg-orange-500/12 text-orange-600 dark:text-orange-400' },
};

function KpiCard({
  label,
  value,
  sub,
  href,
  icon: Icon,
  accent,
  meter,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  accent: KpiAccent;
  /** 0–100: draws a progress bar under the value. */
  meter?: number;
}) {
  const a = KPI_ACCENT[accent];
  return (
    <Link
      href={href}
      className="card group relative overflow-hidden px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
    >
      <span className={cn('absolute inset-x-0 top-0 h-1', a.bar)} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
        <span className={cn('grid size-8 place-items-center rounded-lg transition-transform group-hover:scale-110', a.icon)}>
          <Icon className="size-4" strokeWidth={2.2} />
        </span>
      </div>
      <p className="mt-1 truncate font-display text-[1.45rem] font-extrabold leading-tight tabular">{value}</p>
      {meter !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className={cn('h-full rounded-full transition-all duration-700', a.bar)} style={{ width: `${Math.min(100, meter)}%` }} />
        </div>
      )}
      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
        <span className="truncate">{sub}</span>
        <ArrowRight className="size-3 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </p>
    </Link>
  );
}

interface Shortcut {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  iconColor: string;
  badge?: { text: string | number; tone: BadgeTone };
}

const kampalaHour = () =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Kampala' }).format(new Date()));

export default function Today() {
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const now = useNow(15_000);

  // Only the Owner gets executive analytics & financial stat strips on the main workspace.
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
  const canHr = can('hr:manage');

  const defaultLens: DashboardLens =
    me.role === 'HOUSEKEEPING' && !canDesk ? 'HOUSEKEEPING' : canPos && !canDesk && !isOwner ? 'OPERATIONS' : 'ALL';

  const [lens, setLens] = useState<DashboardLens>(defaultLens);
  const [deskTab, setDeskTab] = useState<DeskTab>('ARRIVALS');
  const [deskDialog, setDeskDialog] = useState<{ kind: 'in' | 'out' | 'assign' | 'charge'; stay: StayRef } | null>(null);

  const {
    data: pulse,
    isLoading: pulseLoading,
    refetch: refetchPulse,
    isFetching: pulseFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['admin-pulse'],
    queryFn: () => get<AdminPulseDTO>('/pulse'),
    refetchInterval: 25_000,
  });

  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get<DashboardDTO>('/dashboard'),
    refetchInterval: 45_000,
    enabled: canDashboard && (canInbox || canWaitlist || canContent),
  });

  const { data: deskBoard } = useQuery({
    queryKey: ['desk-board-today'],
    queryFn: () => get<DeskBoardDTO>('/desk'),
    refetchInterval: 25_000,
    enabled: canDesk,
  });

  // Open the most actionable Front Desk tab once the board first loads.
  const [deskTabPicked, setDeskTabPicked] = useState(false);
  useEffect(() => {
    if (!deskBoard || deskTabPicked) return;
    setDeskTabPicked(true);
    if (deskBoard.lateArrivals?.length) setDeskTab('LATE');
    else if (deskBoard.counts.arrivals) setDeskTab('ARRIVALS');
    else if (deskBoard.counts.departures) setDeskTab('DEPARTURES');
    else if (deskBoard.counts.inHouse) setDeskTab('IN_HOUSE');
  }, [deskBoard, deskTabPicked]);

  const { data: hkBoard } = useQuery({
    queryKey: ['hk-board-today'],
    queryFn: () => get<HkBoardDTO>('/housekeeping'),
    refetchInterval: 25_000,
    enabled: canRooms,
  });

  const { data: hrOverview } = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => get<HrDashboardDTO>('/hr/overview'),
    refetchInterval: 60_000,
    enabled: canHr && (isOwner || me.role === 'HR'),
  });

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

  // Shares the POS screen's cache key, so both stay in step.
  const { data: posOrders } = useQuery({
    queryKey: ['pos', 'orders'],
    queryFn: () => get<PosOrderDTO[]>('/pos/orders'),
    refetchInterval: 20_000,
    enabled: canPos,
  });

  const refreshWorkspace = () => {
    refetchPulse();
    for (const key of ['desk-board-today', 'desk', 'hk-board-today', 'housekeeping', 'rack', 'requisitions-dash']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
    qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
  };

  const hkTaskMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => patch(`/housekeeping/tasks/${id}`, body),
    onSuccess: () => {
      toast.success('Housekeeping task updated');
      refreshWorkspace();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update task'),
  });

  const quickRoomStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HkStatus }) => patch(`/rack/${id}/status`, { status }),
    onSuccess: (_r, v) => {
      toast.success(v.status === 'INSPECTED' ? 'Room inspected and ready' : 'Room marked clean');
      refreshWorkspace();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update room'),
  });

  const markRoomClean = (room: { id: string }) =>
    quickRoomStatusMutation.mutate({ id: room.id, status: canInspect ? 'INSPECTED' : 'VACANT_CLEAN' });

  const toStayRef = (s: DeskStayDTO): StayRef => ({
    ...s,
    keep: s.rooms.flatMap((rr) => rr.assigned.map((a) => ({ reservationRoomId: rr.reservationRoomId, roomId: a.roomId }))),
  });

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Kampala',
  }).format(now);
  const hour = kampalaHour();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = me.name.split(' ')[0];

  const roleBadgeLabel: Record<string, string> = {
    OWNER: 'Proprietor',
    MANAGER: 'Operations & Management',
    HR: 'HR & Staff',
    ACCOUNTANT: 'Accounts & Billing',
    DESK: 'Front Desk',
    KITCHEN: 'Kitchen',
    BAR: 'Bar & Beverage',
    GYM: 'Health Club & Spa',
    HOUSEKEEPING: 'Housekeeping',
  };

  const occupancyPct =
    pulse && pulse.rooms.totalActive > 0 ? Math.round((pulse.rooms.occupied / pulse.rooms.totalActive) * 100) : 0;

  // ── What needs this person right now ──
  const rooms: RackRoomDTO[] = hkBoard?.rooms ?? [];
  const roomsNotReady = rooms.filter(
    (r) => r.isActive && r.arriving && !['VACANT_CLEAN', 'INSPECTED', 'OCCUPIED'].includes(r.hkStatus),
  );
  const openBills = (posOrders ?? []).filter((o) => !o.isSettled && o.status !== 'CANCELLED');
  const readyOrders = (posOrders ?? []).filter((o) => o.status === 'READY');
  const staleBills = openBills.filter((o) => now - Date.parse(o.createdAt) > 60 * 60_000);
  const names = (list: { guest: { name: string } }[] | undefined) =>
    (list ?? []).slice(0, 2).map((s) => s.guest.name.split(' ')[0]).join(', ');

  // Still in-house after their departure date: the folio and the room are both stuck.
  const overdueDepartures = pulse
    ? (deskBoard?.inHouse ?? []).filter((s) => s.departure.slice(0, 10) < pulse.hotelDate)
    : [];

  const attention: AttentionItem[] = [];
  if (pulse) {
    const p = pulse;
    const add = (cond: unknown, item: AttentionItem) => {
      if (cond && item.count > 0) attention.push(item);
    };
    add(canDesk, {
      key: 'late', tone: 'red', icon: AlarmClock, count: p.desk.lateArrivals,
      title: 'Overdue arrivals', sub: names(deskBoard?.lateArrivals) || 'Past arrival and not checked in', cta: 'Resolve', href: '/desk',
    });
    add(canDesk, {
      key: 'overdue-out', tone: 'red', icon: LogOut, count: overdueDepartures.length,
      title: 'Overdue check-outs', sub: `${names(overdueDepartures)} · past departure date`, cta: 'Check out', href: '/desk',
    });
    add(canRooms, {
      key: 'not-ready', tone: 'red', icon: BedDouble, count: roomsNotReady.length,
      title: 'Arrival rooms not ready', sub: `Rm ${roomsNotReady.map((r) => r.number).join(', ')} · guest due today`, cta: 'Clean first', href: '/housekeeping',
    });
    add(can('requisitions:approve'), {
      key: 'req-urgent', tone: 'red', icon: ClipboardCheck, count: p.operations.urgentRequisitions,
      title: 'Urgent requisitions', sub: 'Departments waiting on stock', cta: 'Review', href: '/requisitions',
    });
    add(isOwner, {
      key: 'failed-msgs', tone: 'red', icon: SendHorizontal, count: p.cms.failedOutboundMessages24h,
      title: 'Messages failed to send', sub: 'In the last 24 hours', cta: 'Check', href: '/messages',
    });
    add(canPos, {
      key: 'pos-ready', tone: 'green', icon: UtensilsCrossed, count: readyOrders.length,
      title: 'Orders ready to serve', sub: readyOrders.map((o) => o.tableOrRoom || o.orderNumber).slice(0, 3).join(', '), cta: 'Serve', href: '/pos',
    });
    add(canDesk, {
      key: 'arrivals', tone: 'amber', icon: LogIn, count: p.desk.arrivalsToday,
      title: 'Arrivals to check in', sub: names(deskBoard?.arrivals) || 'Expected today', cta: 'Check in', href: '/desk',
    });
    add(canDesk, {
      key: 'departures', tone: 'amber', icon: LogOut, count: p.desk.departuresToday,
      title: 'Departures due', sub: names(deskBoard?.departures) || 'Settle folios & check out', cta: 'Check out', href: '/desk',
    });
    add(canDesk, {
      key: 'guest-req', tone: 'amber', icon: BellRing, count: p.desk.pendingGuestRequests,
      title: 'Guest requests', sub: 'Waiting for the front desk', cta: 'Open', href: '/desk',
    });
    add(canRooms, {
      key: 'dirty', tone: 'amber', icon: SprayCan, count: p.rooms.vacantDirty,
      title: 'Rooms to clean', sub: `${p.rooms.hkTodoCount} housekeeping tasks open`, cta: 'Clean', href: '/housekeeping',
    });
    add(canPos, {
      key: 'stale-bills', tone: 'amber', icon: Wallet, count: staleBills.length,
      title: 'Bills open over an hour', sub: staleBills.map((o) => o.tableOrRoom || o.orderNumber).slice(0, 3).join(', '), cta: 'Collect', href: '/pos',
    });
    add(canInbox, {
      key: 'inbox', tone: 'amber', icon: Inbox, count: p.inbox.newCount,
      title: 'New guest messages', sub: `${p.inbox.enquiries24h} enquiries in the last 24 h`, cta: 'Reply', href: '/inbox',
    });
    add(can('requisitions:approve') && !p.operations.urgentRequisitions, {
      key: 'req', tone: 'amber', icon: ClipboardCheck, count: p.operations.pendingRequisitions,
      title: 'Requisitions to review', sub: 'Stock requests from departments', cta: 'Review', href: '/requisitions',
    });
    add(canInv, {
      key: 'low-stock', tone: 'amber', icon: PackageX, count: p.operations.lowStockCount,
      title: 'Items below par level', sub: `of ${p.operations.totalInventoryItems} stock items`, cta: 'Restock', href: '/inventory',
    });
    add(can('feedback:manage'), {
      key: 'feedback', tone: 'amber', icon: MessageSquareWarning, count: p.feedback.openIssues,
      title: 'Guest feedback to follow up', sub: 'Unhappy guests not yet handled', cta: 'Follow up', href: '/feedback',
    });
    add(canHr, {
      key: 'leave', tone: 'amber', icon: CalendarDays, count: p.hr.pendingLeaves,
      title: 'Leave requests', sub: 'Waiting for approval', cta: 'Decide', href: '/hr?tab=LEAVE',
    });
    add(canInspect, {
      key: 'inspect', tone: 'blue', icon: CheckCheck, count: p.rooms.hkDoneToInspect,
      title: 'Rooms to inspect', sub: 'Cleaned and waiting for sign-off', cta: 'Inspect', href: '/housekeeping',
    });
    add(canWaitlist, {
      key: 'waitlist', tone: 'blue', icon: ListChecks, count: p.waitlist.newCount,
      title: 'New waitlist sign-ups', sub: 'Waiting for a first contact', cta: 'Contact', href: '/waitlist',
    });
    add(can('quotations:manage'), {
      key: 'quotes', tone: 'blue', icon: FileText, count: p.finance.pendingQuotations,
      title: 'Quotations awaiting reply', sub: 'Sent to clients, not yet answered', cta: 'Follow up', href: '/quotations',
    });
    add(canBookings, {
      key: 'held', tone: 'blue', icon: BookOpenText, count: p.reservations.heldCount,
      title: 'Held bookings', sub: 'Awaiting deposit to confirm', cta: 'Review', href: '/reservations',
    });
    add(canHr, {
      key: 'payroll', tone: 'blue', icon: CreditCard, count: p.hr.draftPayrolls,
      title: 'Draft payroll', sub: 'Ready to finalise', cta: 'Finalise', href: '/hr?tab=PAYROLL',
    });
  }
  const urgentCount = attention.filter((a) => a.tone === 'red').length;

  // ── Jump-to shortcuts ──
  const shortcuts: Shortcut[] = [];
  if (canDesk) shortcuts.push({ key: 'desk', label: 'Front Desk', href: '/desk', icon: ConciergeBell, iconColor: 'text-sky-500' });
  if (canRooms) {
    shortcuts.push({
      key: 'hk',
      label: me.role === 'HOUSEKEEPING' ? 'My cleaning queue' : 'Housekeeping',
      href: '/housekeeping',
      icon: SprayCan,
      iconColor: 'text-amber-500',
      badge: pulse?.rooms.vacantDirty ? { text: pulse.rooms.vacantDirty, tone: 'amber' } : undefined,
    });
    shortcuts.push({ key: 'rack', label: 'Room Rack', href: '/rack', icon: LayoutGrid, iconColor: 'text-emerald-500' });
  }
  if (canPos) {
    shortcuts.push({
      key: 'pos',
      label: 'POS',
      href: '/pos',
      icon: UtensilsCrossed,
      iconColor: 'text-orange-500',
      badge: openBills.length ? { text: openBills.length, tone: 'amber' } : undefined,
    });
  }
  if (canClub) {
    shortcuts.push({
      key: 'club',
      label: 'Health Club',
      href: '/health-club',
      icon: Dumbbell,
      iconColor: 'text-teal-500',
      badge: pulse?.operations.healthClubInsideNow ? { text: `${pulse.operations.healthClubInsideNow} in`, tone: 'green' } : undefined,
    });
  }
  if (canInbox) {
    shortcuts.push({
      key: 'inbox',
      label: 'Inbox',
      href: '/inbox',
      icon: Inbox,
      iconColor: 'text-violet-500',
      badge: pulse?.inbox.newCount ? { text: pulse.inbox.newCount, tone: 'amber' } : undefined,
    });
  }
  if (canReq) shortcuts.push({ key: 'reqs', label: 'Requisitions', href: '/requisitions', icon: ClipboardCheck, iconColor: 'text-teal-500' });
  if (canHr) {
    shortcuts.push({ key: 'hr-staff', label: 'Staff', href: '/hr?tab=STAFF', icon: Users, iconColor: 'text-rose-500' });
    shortcuts.push({ key: 'hr-roster', label: 'Rosters', href: '/hr?tab=ROSTER', icon: Clock, iconColor: 'text-sky-500' });
    shortcuts.push({ key: 'hr-payroll', label: 'Payroll', href: '/hr?tab=PAYROLL', icon: CreditCard, iconColor: 'text-emerald-500' });
  }
  if (!isOwner && can('receipts:read')) {
    shortcuts.push({ key: 'receipts', label: 'Receipts', href: '/receipts', icon: Receipt, iconColor: 'text-indigo-500' });
  }
  if (isOwner) {
    shortcuts.push({ key: 'brief', label: 'Owner Brief', href: '/brief', icon: Sunset, iconColor: 'text-amber-500' });
    shortcuts.push({ key: 'reports', label: 'Reports', href: '/reports', icon: FileSpreadsheet, iconColor: 'text-emerald-500' });
  }

  // ── Lenses ──
  const lenses: { id: DashboardLens; label: string; icon: LucideIcon; badge?: number; tone?: BadgeTone }[] = [
    ...(me.role !== 'HOUSEKEEPING' || canDesk
      ? [{ id: 'ALL' as const, label: 'Everything', icon: Radio }]
      : []),
    ...(isOwner
      ? [{ id: 'EXECUTIVE' as const, label: 'Analytics & Finance', icon: TrendingUp }]
      : []),
    ...(canDesk || canBookings
      ? [
          {
            id: 'DESK' as const,
            label: 'Front Desk',
            icon: ConciergeBell,
            badge: (pulse?.desk.lateArrivals ?? 0) + (pulse?.desk.arrivalsToday ?? 0) + (pulse?.desk.departuresToday ?? 0) || undefined,
            tone: (pulse?.desk.lateArrivals ?? 0) > 0 ? ('red' as const) : ('amber' as const),
          },
        ]
      : []),
    ...(canRooms
      ? [
          {
            id: 'HOUSEKEEPING' as const,
            label: 'Rooms',
            icon: SprayCan,
            badge: (pulse?.rooms.vacantDirty ?? 0) + (pulse?.rooms.hkDoneToInspect ?? 0) || undefined,
            tone: roomsNotReady.length ? ('red' as const) : ('amber' as const),
          },
        ]
      : []),
    ...(canPos || canInv || canReq
      ? [
          {
            id: 'OPERATIONS' as const,
            label: 'POS & Supplies',
            icon: UtensilsCrossed,
            badge: openBills.length + (pulse?.operations.pendingRequisitions ?? 0) || undefined,
            tone: (pulse?.operations.urgentRequisitions ?? 0) > 0 ? ('red' as const) : ('amber' as const),
          },
        ]
      : []),
    ...(canInbox || canWaitlist
      ? [
          {
            id: 'HR_COMMS' as const,
            label: 'Guests & Enquiries',
            icon: Inbox,
            badge: (pulse?.inbox.newCount ?? 0) + (pulse?.waitlist.newCount ?? 0) || undefined,
            tone: 'amber' as const,
          },
        ]
      : []),
  ];

  const pendingReqs = (requisitions ?? []).filter((r) => r.status === 'PENDING' || r.status === 'MANAGER_APPROVED');
  const pinnedComms = (announcements ?? []).slice(0, 3);

  const showExecutive = isOwner && (lens === 'ALL' || lens === 'EXECUTIVE');
  const showDesk = lens === 'ALL' || lens === 'DESK';
  const showHk = lens === 'ALL' || lens === 'HOUSEKEEPING';
  const showOps = lens === 'ALL' || lens === 'OPERATIONS';
  const showComms = lens === 'ALL' || lens === 'HR_COMMS';

  // Hero mini-stats: a few live numbers relevant to this person.
  const heroStats: { label: string; value: string }[] = [];
  if (pulse) {
    if (canRooms || canDesk) heroStats.push({ label: 'Occupancy', value: `${occupancyPct}%` });
    if (canDesk) {
      heroStats.push({ label: 'Guests in house', value: String(pulse.desk.guestsInHouse) });
      heroStats.push({ label: 'Arriving', value: String(pulse.desk.arrivalsToday) });
      heroStats.push({ label: 'Departing', value: String(pulse.desk.departuresToday) });
    } else if (canRooms) {
      heroStats.push({ label: 'Rooms ready', value: `${pulse.rooms.vacantClean}/${pulse.rooms.totalActive}` });
    }
    if (canPos && !canDesk) {
      heroStats.push({ label: 'Open bills', value: String(openBills.length) });
      heroStats.push({ label: 'Ready to serve', value: String(readyOrders.length) });
    }
    if (canClub && !canDesk) heroStats.push({ label: 'In the club', value: String(pulse.operations.healthClubInsideNow) });
    if (canHr && !canDesk) heroStats.push({ label: 'Shifts today', value: `${pulse.hr.checkedInShiftsToday}/${pulse.hr.shiftsToday}` });
  }

  const syncedSecs = dataUpdatedAt ? Math.max(0, Math.round((now - dataUpdatedAt) / 1000)) : null;

  return (
    <>
      <div className="fade-in space-y-5 pb-12">
        {/* 1. Greeting hero */}
        <section className="relative overflow-hidden rounded-2xl bg-[var(--sidebar)] px-5 py-5 text-[var(--sidebar-fg)] shadow-[var(--shadow-soft)] sm:px-6">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[var(--accent)]/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[var(--sidebar-muted)]">
                {todayFormatted} · {me.customRoleName || me.jobTitle || roleBadgeLabel[me.role] || me.role}
              </p>
              <h1 className="mt-1 font-display text-[1.65rem] font-extrabold leading-tight tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--sidebar-muted)]">
                {!pulse
                  ? 'Gathering the latest from around the house…'
                  : attention.length === 0
                    ? 'Everything is on track. Enjoy a calm moment.'
                    : `${attention.length} thing${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} you${urgentCount ? ` — ${urgentCount} urgent` : ''}.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--sidebar-muted)] sm:inline-flex">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Live{syncedSecs !== null && ` · ${syncedSecs < 10 ? 'just now' : `${syncedSecs}s ago`}`}
              </span>
              <button
                type="button"
                onClick={refreshWorkspace}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold transition hover:bg-white/20"
                title="Refresh now"
              >
                <RefreshCw className={cn('size-3.5', pulseFetching && 'animate-spin')} />
                <span className="hidden sm:inline">Sync</span>
              </button>
              {can('bookings:write') && (
                <Button size="lg" variant="primary" href="/reservations/new?walkin=1" icon={<Plus className="size-4" />}>
                  Walk-in / Booking
                </Button>
              )}
            </div>
          </div>
          {heroStats.length > 0 && (
            <div className="relative mt-4 flex flex-wrap gap-2">
              {heroStats.map((s) => (
                <span key={s.label} className="inline-flex items-baseline gap-1.5 rounded-xl bg-white/[0.08] px-3 py-1.5 ring-1 ring-white/10">
                  <span className="font-display text-[15px] font-extrabold tabular">{s.value}</span>
                  <span className="text-[11px] text-[var(--sidebar-muted)]">{s.label}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 2. Jump to */}
        {shortcuts.length > 0 && (
          <nav aria-label="Shortcuts" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {shortcuts.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] font-semibold shadow-2xs transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
              >
                <s.icon className={cn('size-4 transition-transform group-hover:scale-110', s.iconColor)} strokeWidth={2.2} />
                {s.label}
                {s.badge && (
                  <span className={cn('rounded-full border px-1.5 text-[10px] font-bold tabular', TONE_PILL_CLASSES[s.badge.tone])}>
                    {s.badge.text}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}

        {/* 3. Owner money & occupancy */}
        {showExecutive && (
          <section aria-label="Owner summary">
            {pulseLoading || !pulse ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Cleared today"
                  icon={Wallet}
                  accent="amber"
                  value={money(pulse.finance.clearedTodayUgxMinor, 'UGX')}
                  sub={
                    BigInt(pulse.finance.clearedTodayUsdMinor) > 0n
                      ? `+ ${money(pulse.finance.clearedTodayUsdMinor, 'USD')} · ${pulse.finance.receiptsIssuedToday} receipts`
                      : `${pulse.finance.clearedTodayCount} payments · ${pulse.finance.receiptsIssuedToday} receipts`
                  }
                  href="/brief"
                />
                <KpiCard
                  label="Restaurant, bar & club"
                  icon={UtensilsCrossed}
                  accent="orange"
                  value={money(pulse.operations.posRevenueTodayUgxMinor, 'UGX')}
                  sub={`${pulse.operations.posCompletedToday} settled · ${openBills.length || pulse.operations.posOpenOrders} open bills`}
                  href="/pos"
                />
                <KpiCard
                  label="Occupancy"
                  icon={BedDouble}
                  accent="emerald"
                  value={`${occupancyPct}%`}
                  meter={occupancyPct}
                  sub={`${pulse.rooms.occupied} of ${pulse.rooms.totalActive} rooms · ${pulse.desk.guestsInHouse} guests in house`}
                  href="/rack"
                />
                <KpiCard
                  label="Bookings"
                  icon={BookOpenText}
                  accent="indigo"
                  value={`${pulse.reservations.confirmedCount} confirmed`}
                  sub={`${pulse.reservations.upcoming7d} in next 7 days · ${pulse.hr.activeStaff} staff (${money(hrOverview?.totalMonthlyPayrollMinor || '0', 'UGX')}/mo)`}
                  href="/reservations"
                />
              </div>
            )}
          </section>
        )}

        {/* 4. Needs you now */}
        <AttentionRail items={attention} loading={pulseLoading} />

        {/* 5. Lens bar */}
        {lenses.length > 1 && (
          <div role="tablist" aria-label="Workspace focus" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
            {lenses.map((l) => {
              const active = lens === l.id;
              return (
                <button
                  key={l.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setLens(l.id)}
                  className={cn(
                    '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-semibold transition',
                    active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
                  )}
                >
                  <l.icon className="size-3.5" strokeWidth={2.2} />
                  {l.label}
                  {l.badge !== undefined && l.badge > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[10px] font-bold leading-[1.15rem] tabular',
                        l.tone === 'red' ? 'bg-rose-500 text-white' : 'bg-amber-500/20 text-warning',
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

        {/* 6. Workbenches: Front Desk & Rooms */}
        {((showDesk && canDesk) || (showHk && canRooms)) && (
          <div className={cn('grid gap-4', showDesk && canDesk && showHk && canRooms ? 'xl:grid-cols-[1.35fr_1fr]' : 'grid-cols-1')}>
            {showDesk && canDesk && (
              <Section
                title="Front Desk"
                description="Check guests in, assign rooms, settle folios and check out"
                actions={
                  <Link
                    href="/desk"
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                  >
                    Full desk <ArrowRight className="size-3" />
                  </Link>
                }
              >
                <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2/60 p-0.5 text-[11.5px] font-semibold">
                  {(
                    [
                      ...(deskBoard && deskBoard.lateArrivals.length > 0
                        ? [{ id: 'LATE' as const, label: 'Overdue', n: deskBoard.lateArrivals.length }]
                        : []),
                      { id: 'ARRIVALS' as const, label: 'Arrivals', n: deskBoard?.counts.arrivals ?? pulse?.desk.arrivalsToday ?? 0 },
                      { id: 'IN_HOUSE' as const, label: 'In-house', n: deskBoard?.counts.inHouse ?? pulse?.desk.inHouse ?? 0 },
                      { id: 'DEPARTURES' as const, label: 'Departures', n: deskBoard?.counts.departures ?? pulse?.desk.departuresToday ?? 0 },
                    ]
                  ).map((tItem) => (
                    <button
                      key={tItem.id}
                      type="button"
                      onClick={() => setDeskTab(tItem.id)}
                      className={cn(
                        'inline-flex min-h-[30px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 transition',
                        deskTab === tItem.id ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                        tItem.id === 'LATE' && 'text-danger',
                      )}
                    >
                      {tItem.label}
                      <span className="rounded-full bg-surface-2 px-1.5 text-[10px] tabular">{tItem.n}</span>
                    </button>
                  ))}
                </div>
                {!deskBoard ? (
                  <div className="space-y-2.5">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : (
                  (() => {
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
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-4 py-4 text-xs text-fg-muted">
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="size-4 text-emerald-500" />
                            No {DESK_TAB_LABEL[deskTab]} right now.
                          </span>
                          {can('bookings:write') && (
                            <Button size="sm" variant="secondary" href="/reservations/new?walkin=1" icon={<Plus className="size-3.5" />}>
                              New walk-in
                            </Button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="grid gap-2">
                        {list.slice(0, 6).map((stay) => {
                          const assignedRooms = stay.rooms.flatMap((r) => r.assigned.map((a) => a.number)).join(', ');
                          const balance = BigInt(stay.balanceMinor || '0');
                          const canCheckIn = (deskTab === 'ARRIVALS' || deskTab === 'LATE') && stay.status === 'CONFIRMED';
                          const canCheckOut = stay.status === 'IN_HOUSE';
                          const initials = stay.guest.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

                          return (
                            <div
                              key={stay.id}
                              className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-surface-2/35 p-3 transition hover:border-line-strong sm:flex-row sm:items-center"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sidebar)] text-[12px] font-bold text-[var(--sidebar-fg)]">
                                  {initials}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/reservations/${stay.id}`} className="text-[13.5px] font-bold text-fg hover:underline">
                                      {stay.guest.name}
                                    </Link>
                                    {stay.isVip && (
                                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">VIP</span>
                                    )}
                                    <Status value={stay.status} />
                                  </div>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                                    <span className="font-medium text-fg">
                                      {stay.rooms.map((r) => `${r.quantity}× ${r.roomTypeName}`).join(', ')}
                                    </span>
                                    <span>·</span>
                                    {assignedRooms ? (
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-success">
                                        Rm {assignedRooms}
                                      </span>
                                    ) : (
                                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">No room yet</span>
                                    )}
                                    <span>·</span>
                                    <span>
                                      {stay.nights}n · {dateShort(stay.arrival)} → {dateShort(stay.departure)}
                                    </span>
                                    <span>·</span>
                                    {balance > 0n ? (
                                      <span className="font-bold text-warning tabular">Due {money(balance.toString(), stay.currency)}</span>
                                    ) : (
                                      <span className="font-bold text-success">Paid</span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2 sm:border-t-0 sm:pt-0">
                                {!assignedRooms && stay.status !== 'CHECKED_OUT' && (
                                  <Button size="sm" variant="secondary" icon={<DoorOpen className="size-3.5" />} onClick={() => setDeskDialog({ kind: 'assign', stay: toStayRef(stay) })}>
                                    Assign room
                                  </Button>
                                )}
                                {['CONFIRMED', 'IN_HOUSE', 'HELD'].includes(stay.status) && (
                                  <Button size="sm" variant="secondary" icon={<Receipt className="size-3.5" />} onClick={() => setDeskDialog({ kind: 'charge', stay: toStayRef(stay) })}>
                                    {stay.status === 'HELD' ? 'Take deposit' : 'Folio'}
                                  </Button>
                                )}
                                {canCheckIn && (
                                  <Button size="sm" variant="primary" icon={<LogIn className="size-3.5" />} onClick={() => setDeskDialog({ kind: 'in', stay: toStayRef(stay) })}>
                                    Check in
                                  </Button>
                                )}
                                {canCheckOut && (
                                  <Button
                                    size="sm"
                                    variant={deskTab === 'DEPARTURES' ? 'primary' : 'secondary'}
                                    icon={<LogOut className="size-3.5" />}
                                    onClick={() => setDeskDialog({ kind: 'out', stay: toStayRef(stay) })}
                                  >
                                    Check out
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {list.length > 6 && (
                          <Link href="/desk" className="text-center text-[12px] font-semibold text-fg-muted hover:text-fg">
                            + {list.length - 6} more on the Front Desk
                          </Link>
                        )}
                      </div>
                    );
                  })()
                )}
              </Section>
            )}

            {showHk && canRooms && (
              <Section
                title="Rooms"
                description="Live state of every room — tap the brush to mark a room clean"
                actions={
                  <Link
                    href="/housekeeping"
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
                  >
                    Housekeeping <ArrowRight className="size-3" />
                  </Link>
                }
              >
                <div className="space-y-4">
                  {!hkBoard ? (
                    <Skeleton className="h-44" />
                  ) : (
                    <RoomMap
                      rooms={rooms}
                      canClean={canRooms}
                      busyId={quickRoomStatusMutation.isPending ? (quickRoomStatusMutation.variables?.id ?? null) : null}
                      onMarkClean={markRoomClean}
                    />
                  )}

                  {(() => {
                    const tasks: HkTaskDTO[] = hkBoard?.tasks ?? [];
                    const actionable = tasks.filter(
                      (x) => x.status === 'TODO' || x.status === 'IN_PROGRESS' || (canInspect && x.status === 'DONE'),
                    );
                    if (!hkBoard) return null;
                    if (actionable.length === 0) {
                      return (
                        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-2.5 text-xs font-medium text-success">
                          <Sparkles className="size-4 shrink-0" />
                          No housekeeping tasks waiting.
                        </div>
                      );
                    }
                    return (
                      <div>
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">Tasks today</p>
                        <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                          {actionable.slice(0, 6).map((task) => {
                            const busy = hkTaskMutation.isPending && hkTaskMutation.variables?.id === task.id;
                            return (
                              <div key={task.id} className="flex items-center justify-between gap-2.5 rounded-xl border border-line bg-surface p-2.5 text-xs">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-display text-sm font-extrabold">Rm {task.room.number}</span>
                                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">
                                      {task.kind.replace('_', ' ').toLowerCase()}
                                    </span>
                                    {task.arrivalToday && (
                                      <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-bold text-danger">guest due</span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                                    {task.status === 'IN_PROGRESS' ? 'Cleaning · ' : task.status === 'DONE' ? 'Done · awaiting inspection · ' : ''}
                                    {task.assignee ? task.assignee.name : 'Unassigned'}
                                    {task.notes ? ` · ${task.notes}` : ''}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {task.status === 'TODO' && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      icon={<Play className="size-3" />}
                                      loading={busy}
                                      onClick={() =>
                                        hkTaskMutation.mutate({ id: task.id, body: { status: 'IN_PROGRESS', assigneeId: task.assignee?.id ?? me.id } })
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
                                      loading={busy}
                                      onClick={() => hkTaskMutation.mutate({ id: task.id, body: { status: 'DONE' } })}
                                    >
                                      Done
                                    </Button>
                                  )}
                                  {task.status === 'DONE' && canInspect && (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      icon={<CheckCheck className="size-3.5" />}
                                      loading={busy}
                                      onClick={() => hkTaskMutation.mutate({ id: task.id, body: { status: 'INSPECTED' } })}
                                    >
                                      Inspect
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* 7. Restaurant & supplies */}
        {showOps && (canPos || canReq || pinnedComms.length > 0) && (
          <div className={cn('grid gap-4', canPos && (canReq || pinnedComms.length > 0) && 'xl:grid-cols-2')}>
            {canPos && <PosLive orders={posOrders ?? []} now={now} />}

            {(canReq || pinnedComms.length > 0) && (
              <Section
                title="Requisitions & Handover Notes"
                description="Stock requests waiting on a decision, and pinned team notices"
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
                  {pinnedComms.map((c) => (
                    <div key={c.id} className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-semibold text-fg">
                          <Megaphone className="size-3.5 text-warning" />
                          {c.title}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-fg-subtle">
                          {c.department ?? 'All House'} · {ago(c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] text-fg-muted">{c.body}</p>
                    </div>
                  ))}

                  {canReq &&
                    (pendingReqs.length === 0 ? (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5 text-xs font-medium text-success">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 shrink-0" />
                          No requisitions waiting.
                        </span>
                        <Link href="/requisitions" className="font-bold underline">
                          Request stock
                        </Link>
                      </div>
                    ) : (
                      <ul className="divide-y divide-line">
                        {pendingReqs.slice(0, 4).map((req) => (
                          <li key={req.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-semibold text-fg">{req.title}</span>
                                {req.priority === 'URGENT' && (
                                  <span className="rounded-full bg-rose-500 px-1.5 text-[9.5px] font-bold text-white">URGENT</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-fg-muted">
                                {req.number} · {req.department} · {req.requestedByName} · {ago(req.createdAt)}
                              </p>
                            </div>
                            <span className="font-mono text-xs font-semibold tabular">{money(req.totalEstimatedMinor, req.currency)}</span>
                            <Button size="sm" variant="secondary" href="/requisitions">
                              Review
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* 8. Guest enquiries */}
        {(showComms || showDesk) && canInbox && dashboardData && (
          <Section
            title="Guest Enquiries"
            description="Latest conversations across WhatsApp, website & email"
            actions={
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg"
              >
                Inbox{pulse?.inbox.newCount ? ` · ${pulse.inbox.newCount} new` : ''} <ArrowRight className="size-3" />
              </Link>
            }
          >
            {dashboardData.latestConversations.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-xs font-medium text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                Every guest enquiry has been answered.
              </div>
            ) : (
              <ul className="-my-1 grid gap-x-6 divide-y divide-line lg:grid-cols-2 lg:divide-y-0">
                {dashboardData.latestConversations.slice(0, 6).map((c) => (
                  <li key={c.id} className="py-1 lg:border-b lg:border-line">
                    <Link href={`/inbox/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg p-1.5 transition hover:bg-surface-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold">
                          {c.contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                          {c.status === 'NEW' && (
                            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-surface" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="truncate font-bold text-fg">{c.contact.name}</span>
                            <span className="shrink-0 text-[10.5px] text-fg-subtle">
                              {CHANNEL[c.channel]} · {ago(c.lastMessageAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-fg-muted">{c.preview}</p>
                        </div>
                      </div>
                      <Status value={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* 9. Owner analytics */}
        {showExecutive && canDashboard && (canInbox || canWaitlist) && (
          dashLoading || !dashboardData ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-60" />
              <Skeleton className="h-60" />
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              {canInbox && (
                <Section title="Enquiries · last 30 days" description="Daily incoming guest demand">
                  <ColumnChart data={dashboardData.enquiriesByDay} label="Enquiries" />
                </Section>
              )}
              {canWaitlist && (
                <Section title="Waitlist by room type" description="Which rooms future guests want most">
                  {dashboardData.waitlistByRoomType.length ? (
                    <BarList data={dashboardData.waitlistByRoomType.map((r) => ({ label: t(r.name), value: r.count }))} />
                  ) : (
                    <p className="text-xs text-fg-muted">No waitlist entries recorded yet.</p>
                  )}
                </Section>
              )}
            </div>
          )
        )}
      </div>

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
