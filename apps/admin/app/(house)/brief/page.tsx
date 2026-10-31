'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BedDouble,
  BellRing,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Download,
  ExternalLink,
  Package,
  Phone,
  Printer,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import { whatsappLink } from '@reberon/utils';
import { get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Status } from '@/components/ui/bits';

type BriefGuestItem = {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  isVip?: boolean;
  status: string;
  eta?: string | null;
  arrival?: string;
  departure?: string;
  nights?: number;
  guests?: number;
  rooms: string;
  assignedRooms: string[];
  total?: string;
  paid?: string;
  balance: string;
  balanceMinor?: string;
  currency?: string;
};

type Brief = {
  date: string;
  tomorrow: string;
  todayArrivals?: BriefGuestItem[];
  todayDepartures?: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    status: string;
    rooms: string;
    assignedRooms: string[];
    balance: string;
    balanceMinor: string;
    currency: string;
  }[];
  inHouseList?: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    isVip: boolean;
    departure: string;
    nights: number;
    guests: number;
    rooms: string;
    assignedRooms: string[];
    balance: string;
    balanceMinor: string;
    currency: string;
  }[];
  arrivals: BriefGuestItem[];
  occupancy: {
    tonight: number;
    total: number;
    percent: number;
    guestsInHouse?: number;
    vipsInHouse?: number;
  };
  clearedToday: { UGX: string; USD: string; count: number };
  financialPulse?: {
    today: {
      roomsUGX: string;
      roomsUSD: string;
      roomPaymentsCount: number;
      posUGX: string;
      posOrdersCount: number;
      posOpenTabsUGX: string;
      posOpenTabsCount: number;
      healthClubUGX: string;
      healthClubPassesCount: number;
      totalUGX: string;
      totalUSD: string;
      byMethod: Record<string, string>;
    };
    mtd: {
      roomsUGX: string;
      roomsUSD: string;
      posUGX: string;
      totalUGX: string;
    };
  };
  houseReadiness?: {
    totalRooms: number;
    inspected: number;
    vacantClean: number;
    ready: number;
    dirty: number;
    occupied: number;
    outOfOrder: number;
    pendingTasks: number;
    roomTypes: {
      id: string;
      code: string;
      name: string;
      total: number;
      ready: number;
      dirty: number;
      occupied: number;
      outOfOrder: number;
    }[];
  };
  forecast7d?: {
    date: string;
    occupied: number;
    total: number;
    percent: number;
    arrivals: number;
    departures: number;
  }[];
  promised: {
    id: string;
    code: string;
    name: string;
    phone?: string | null;
    status: string;
    arrival: string;
    departure?: string;
    rooms?: string;
    balance: string;
    balanceMinor?: string;
    currency?: string;
  }[];
  alertsAndApprovals?: {
    pendingRequisitions: {
      id: string;
      number: string;
      title: string;
      status: string;
      priority: string;
      department: string;
      requestedBy: string;
      totalAmountMinor: string;
      currency: string;
      createdAt: string;
    }[];
    pendingGuestRequests: {
      id: string;
      reservationId: string;
      code: string;
      guestName: string;
      kind: string;
      status: string;
      note: string | null;
      createdAt: string;
    }[];
    lowStockCount: number;
    unhandledFeedbackCount: number;
    activeStaffCount: number;
  };
};

const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function BriefPage() {
  const can = useCan();
  const today = kampalaToday();
  const [date, setDate] = useState(today);
  const [arrivalView, setArrivalView] = useState<'today' | 'tomorrow'>('today');

  const { data: b, isLoading } = useQuery({
    queryKey: ['brief', date],
    queryFn: () => get<Brief>(`/owner/brief?date=${date}`),
    refetchInterval: 60_000,
  });

  const send = useMutation({
    mutationFn: () => post('/owner/brief/send'),
    onSuccess: () => toast.success('Executive brief emailed to directors'),
  });

  if (isLoading || !b) return <Skeleton className="h-96" />;

  const fp = b.financialPulse;
  const hr = b.houseReadiness;
  const aa = b.alertsAndApprovals;
  const todayArrivals = b.todayArrivals ?? [];
  const todayDepartures = b.todayDepartures ?? [];
  const inHouseList = b.inHouseList ?? [];
  const forecast = b.forecast7d ?? [];

  const totalReceivablesUGX = b.promised
    .filter((p) => (p.currency ?? 'UGX') === 'UGX' && p.balanceMinor)
    .reduce((acc, p) => acc + BigInt(p.balanceMinor!), 0n);

  const exportBriefCsv = () => {
    exportToCsv(
      `reberon-owner-brief-${b.date}.csv`,
      ['Section', 'Reference / Code', 'Name / Metric', 'Status / Category', 'Details', 'Amount / Balance'],
      [
        ['Executive Summary', 'OCCUPANCY', `${b.occupancy.tonight}/${b.occupancy.total} rooms`, `${b.occupancy.percent}%`, `${b.occupancy.guestsInHouse ?? 0} guests in-house`, ''],
        ['Executive Summary', 'TODAY INFLOW (TOTAL)', 'Rooms + POS + Health Club', 'COLLECTED', b.date, fp ? money(fp.today.totalUGX, 'UGX') : money(b.clearedToday.UGX, 'UGX')],
        ['Executive Summary', 'TODAY ROOMS', `${fp?.today.roomPaymentsCount ?? b.clearedToday.count} payments`, 'ROOMS', b.date, fp ? money(fp.today.roomsUGX, 'UGX') : money(b.clearedToday.UGX, 'UGX')],
        ['Executive Summary', 'TODAY POS', `${fp?.today.posOrdersCount ?? 0} settled orders`, 'F&B / BAR', b.date, fp ? money(fp.today.posUGX, 'UGX') : 'UGX 0'],
        ['Executive Summary', 'TODAY HEALTH CLUB', `${fp?.today.healthClubPassesCount ?? 0} passes`, 'SPA / GYM', b.date, fp ? money(fp.today.healthClubUGX, 'UGX') : 'UGX 0'],
        ['Executive Summary', 'MTD GROSS COLLECTED', 'Month-to-Date Total', 'MTD', b.date.slice(0, 7), fp ? money(fp.mtd.totalUGX, 'UGX') : ''],
        ...inHouseList.map((g) => ['In-House Tonight', g.code, g.name, 'IN_HOUSE', `${g.rooms} (Rm ${(g.assignedRooms ?? []).join(', ') || 'TBD'}) · Departs ${g.departure}`, g.balance]),
        ...todayArrivals.map((a) => ['Today Arrival', a.code, a.name, a.status, `${a.rooms} (Rm ${(a.assignedRooms ?? []).join(', ') || 'Unassigned'})${a.eta ? ` · ETA ${a.eta}` : ''}`, a.balance]),
        ...(b.arrivals ?? []).map((a) => ['Tomorrow Arrival', a.code, a.name, a.status, `${a.rooms} (Rm ${(a.assignedRooms ?? []).join(', ') || 'Unassigned'})${a.eta ? ` · ETA ${a.eta}` : ''}`, a.balance]),
        ...(b.promised ?? []).map((p) => ['Receivable (7d)', p.code, p.name, p.status, `Arrives ${p.arrival}`, p.balance]),
      ],
    );
  };

  const pendingApprovalsTotal =
    (aa?.pendingRequisitions.length ?? 0) +
    (aa?.pendingGuestRequests.length ?? 0) +
    (aa?.lowStockCount ?? 0) +
    (aa?.unhandledFeedbackCount ?? 0);

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        title="Executive Owner Brief"
        description={`${dateShort(b.date)} · Live occupancy, departmental cashflow, 7-day forecast, receivables, and director approvals`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Selector */}
            <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDate((d) => shiftDate(d, -1))}
                className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
                title="Previous day"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="bg-transparent px-2 py-1 font-mono text-xs font-semibold text-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setDate((d) => shiftDate(d, 1))}
                className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
                title="Next day"
              >
                <ChevronRight className="size-3.5" />
              </button>
              {date !== today && (
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className="ml-0.5 rounded-md bg-fg px-2 py-1 text-[11px] font-semibold text-bg"
                >
                  Today
                </button>
              )}
            </div>

            <Button size="sm" variant="secondary" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
              Print Brief
            </Button>
            <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={exportBriefCsv}>
              Export CSV
            </Button>
            {can('settings:features') && (
              <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={send.isPending} onClick={() => send.mutate()}>
                Dispatch Email Now
              </Button>
            )}
          </div>
        }
      />

      {/* 6-Card Executive KPI Strip */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>Occupied Tonight</span>
            <BedDouble className="size-3.5" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular">
            {b.occupancy.tonight} <span className="text-sm font-normal text-fg-muted">/ {b.occupancy.total}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            <b className="text-fg">{b.occupancy.percent}%</b> · {b.occupancy.guestsInHouse ?? 0} pax
            {(b.occupancy.vipsInHouse ?? 0) > 0 ? ` · ${b.occupancy.vipsInHouse} VIP` : ''}
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>Today’s Total Inflow</span>
            <Coins className="size-3.5 text-success" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular text-success">
            {money(fp?.today.totalUGX ?? b.clearedToday.UGX, 'UGX')}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {BigInt(fp?.today.totalUSD ?? b.clearedToday.USD) > 0n
              ? `+ ${money(fp?.today.totalUSD ?? b.clearedToday.USD, 'USD')} · `
              : ''}
            Rooms, POS & Spa
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>MTD Collected</span>
            <TrendingUp className="size-3.5" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular">
            {money(fp?.mtd.totalUGX ?? '0', 'UGX')}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {BigInt(fp?.mtd.roomsUSD ?? '0') > 0n ? `+ ${money(fp!.mtd.roomsUSD, 'USD')} · ` : ''}
            Month-to-date cashflow
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>Today’s Movement</span>
            <Calendar className="size-3.5" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular">
            {todayArrivals.length} in <span className="text-sm font-normal text-fg-muted">· {todayDepartures.length} out</span>
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Tomorrow: <b className="text-fg">{b.arrivals.length}</b> arrival{b.arrivals.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>7-Day Receivables</span>
            <ArrowUpRight className="size-3.5 text-warning" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular text-warning">
            {money(totalReceivablesUGX, 'UGX')}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Across {b.promised.length} open booking{b.promised.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>House Readiness</span>
            <Sparkles className="size-3.5" />
          </div>
          <p className="mt-1.5 text-xl font-bold tabular">
            {hr?.ready ?? 0} <span className="text-sm font-normal text-fg-muted">ready</span>
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {hr?.dirty ?? 0} dirty · {pendingApprovalsTotal} alert{pendingApprovalsTotal === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* 7-Day Occupancy & Movement Forecast */}
      {forecast.length > 0 && (
        <Section
          title="7-Day Occupancy & Movement Forecast"
          description="Forward room demand, scheduled arrivals, and departures across the next 7 days"
          actions={<Link href="/calendar" className="text-xs font-medium text-brand hover:underline">Calendar & Rates →</Link>}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-7">
            {forecast.map((f, idx) => {
              const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                new Date(`${f.date}T12:00:00Z`),
              );
              return (
                <div
                  key={f.date}
                  className={cn(
                    'rounded-xl border p-3 transition',
                    idx === 0 ? 'border-fg bg-surface-2/50' : 'border-line bg-surface',
                  )}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-fg">{idx === 0 ? 'Tonight' : dayLabel}</span>
                    <span className="font-mono font-bold tabular text-fg">{f.percent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={cn('h-full rounded-full transition-all', f.percent >= 80 ? 'bg-success' : f.percent >= 40 ? 'bg-brand' : 'bg-fg')}
                      style={{ width: `${Math.min(100, Math.max(6, f.percent))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-fg-muted">
                    <span className="font-mono tabular">{f.occupied}/{f.total} rms</span>
                    <span className="font-mono tabular">+{f.arrivals} / -{f.departures}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Financial Pulse + Suite Readiness Breakdown */}
      <div className="grid gap-4 xl:grid-cols-2">
        {fp && (
          <Section
            title="Departmental Revenue & Payment Rails"
            description="Today's collected cashflow vs Month-to-Date totals"
            actions={<Link href="/reports" className="text-xs font-medium text-brand hover:underline">Full Reports →</Link>}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface-2/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Rooms & Stays</p>
                <p className="mt-1 font-mono text-base font-bold tabular">{money(fp.today.roomsUGX, 'UGX')}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  {fp.today.roomPaymentsCount} payment{fp.today.roomPaymentsCount === 1 ? '' : 's'} today · MTD {money(fp.mtd.roomsUGX, 'UGX')}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">POS: Kitchen & Bar</p>
                <p className="mt-1 font-mono text-base font-bold tabular">{money(fp.today.posUGX, 'UGX')}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  {fp.today.posOrdersCount} paid · {fp.today.posOpenTabsCount} open tab{fp.today.posOpenTabsCount === 1 ? '' : 's'} ({money(fp.today.posOpenTabsUGX, 'UGX')})
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Health Club & Spa</p>
                <p className="mt-1 font-mono text-base font-bold tabular">{money(fp.today.healthClubUGX, 'UGX')}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  {fp.today.healthClubPassesCount} pass{fp.today.healthClubPassesCount === 1 ? '' : 'es'} issued today
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5 text-xs">
              <span className="font-semibold text-fg-muted">Room Collections by Payment Method (Today):</span>
              <div className="flex flex-wrap items-center gap-3 font-mono">
                <span>MoMo: <b>{money(fp.today.byMethod?.MOBILE_MONEY ?? '0', 'UGX')}</b></span>
                <span>Cash: <b>{money(fp.today.byMethod?.CASH ?? '0', 'UGX')}</b></span>
                <span>Card: <b>{money(fp.today.byMethod?.CARD ?? '0', 'UGX')}</b></span>
                <span>Bank: <b>{money(fp.today.byMethod?.BANK ?? '0', 'UGX')}</b></span>
              </div>
            </div>
          </Section>
        )}

        {hr && (
          <Section
            title="Suite Inventory & Housekeeping Readiness"
            description={`${hr.ready} ready (${hr.inspected} inspected, ${hr.vacantClean} clean) · ${hr.occupied} occupied · ${hr.dirty} dirty · ${hr.outOfOrder} blocked`}
            actions={<Link href="/rack" className="text-xs font-medium text-brand hover:underline">Open Room Rack →</Link>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="pb-2">Suite Category</th>
                    <th className="pb-2 text-center">Units</th>
                    <th className="pb-2 text-center">Occupied</th>
                    <th className="pb-2 text-center">Ready</th>
                    <th className="pb-2 text-center">Dirty</th>
                    <th className="pb-2 text-right">Blocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(hr.roomTypes ?? []).map((rt) => (
                    <tr key={rt.id}>
                      <td className="py-2 font-semibold text-fg">{rt.name}</td>
                      <td className="py-2 text-center font-mono tabular text-fg-muted">{rt.total}</td>
                      <td className="py-2 text-center font-mono font-semibold tabular text-info">{rt.occupied}</td>
                      <td className="py-2 text-center font-mono font-semibold tabular text-success">{rt.ready}</td>
                      <td className="py-2 text-center font-mono font-semibold tabular text-warning">{rt.dirty}</td>
                      <td className="py-2 text-right font-mono tabular text-fg-muted">{rt.outOfOrder ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>

      {/* Owner Approvals & Operational Alerts */}
      {aa && (aa.pendingRequisitions.length > 0 || aa.pendingGuestRequests.length > 0 || aa.lowStockCount > 0 || aa.unhandledFeedbackCount > 0) && (
        <Section
          title="Director Approvals & Live Operational Alerts"
          description="Items requiring owner/manager sign-off or immediate front-of-house attention"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Pending Purchase Requisitions */}
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <ClipboardCheck className="size-3.5 text-warning" /> Requisitions Awaiting Approval ({aa.pendingRequisitions.length})
                </span>
                <Link href="/requisitions" className="text-xs font-medium text-brand hover:underline">
                  Review All →
                </Link>
              </div>
              {aa.pendingRequisitions.length === 0 ? (
                <p className="text-xs text-fg-muted">No pending requisitions awaiting sign-off.</p>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {aa.pendingRequisitions.map((req) => (
                    <li key={req.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <Link href="/requisitions" className="font-semibold text-fg hover:underline">
                          {req.number} · {req.title}
                        </Link>
                        <p className="text-[11px] text-fg-muted">
                          {req.department} · Requested by {req.requestedBy}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono font-semibold tabular">{money(req.totalAmountMinor ?? '0', req.currency ?? 'UGX')}</span>
                        <Pill tone={req.priority === 'URGENT' ? 'red' : 'amber'}>{(req.status ?? 'PENDING').replace(/_/g, ' ')}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Guest Requests + Stock/Feedback Alerts */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <Link href="/inventory" className="rounded-xl border border-line p-2.5 hover:border-line-strong">
                  <div className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span>Low Stock</span>
                    <Package className="size-3.5 text-warning" />
                  </div>
                  <p className="mt-1 font-mono text-base font-bold tabular">{aa.lowStockCount} items</p>
                </Link>
                <Link href="/feedback" className="rounded-xl border border-line p-2.5 hover:border-line-strong">
                  <div className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span>Alert Feedback</span>
                    <AlertTriangle className="size-3.5 text-danger" />
                  </div>
                  <p className="mt-1 font-mono text-base font-bold tabular">{aa.unhandledFeedbackCount} open</p>
                </Link>
                <Link href="/hr" className="rounded-xl border border-line p-2.5 hover:border-line-strong">
                  <div className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span>Active Staff</span>
                    <Users className="size-3.5 text-info" />
                  </div>
                  <p className="mt-1 font-mono text-base font-bold tabular">{aa.activeStaffCount} team</p>
                </Link>
              </div>

              {aa.pendingGuestRequests.length > 0 && (
                <div className="rounded-xl border border-line p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <BellRing className="size-3.5 text-warning" /> Open Guest Service Requests ({aa.pendingGuestRequests.length})
                    </span>
                    <Link href="/desk" className="text-xs font-medium text-brand hover:underline">
                      Front Desk →
                    </Link>
                  </div>
                  <ul className="divide-y divide-line text-xs">
                    {aa.pendingGuestRequests.map((gr) => (
                      <li key={gr.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span className="truncate">
                          <b>{gr.guestName}</b> ({gr.code}) · {gr.kind.replace(/_/g, ' ')}
                          {gr.note ? ` — “${gr.note}”` : ''}
                        </span>
                        <Pill tone="amber">{gr.status}</Pill>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Arrivals (Today / Tomorrow) & In-House Guests Tonight */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title={arrivalView === 'today' ? `Today's Arrivals (${todayArrivals.length})` : `Tomorrow's Arrivals (${b.arrivals.length})`}
          description={arrivalView === 'today' ? `Scheduled check-ins for ${dateShort(b.date)}` : `Scheduled check-ins for ${dateShort(b.tomorrow)}`}
          actions={
            <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setArrivalView('today')}
                className={cn('rounded-md px-2.5 py-1 transition', arrivalView === 'today' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                Today ({todayArrivals.length})
              </button>
              <button
                type="button"
                onClick={() => setArrivalView('tomorrow')}
                className={cn('rounded-md px-2.5 py-1 transition', arrivalView === 'tomorrow' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                Tomorrow ({b.arrivals.length})
              </button>
            </div>
          }
        >
          {(arrivalView === 'today' ? todayArrivals : b.arrivals).length === 0 ? (
            <Empty title={arrivalView === 'today' ? 'No arrivals scheduled for today' : 'No arrivals scheduled for tomorrow'} />
          ) : (
            <ul className="-my-1 divide-y divide-line text-xs">
              {(arrivalView === 'today' ? todayArrivals : b.arrivals).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/reservations/${a.id}`} className="font-mono font-semibold text-fg-muted hover:underline">
                        {a.code}
                      </Link>
                      <Link href={`/reservations/${a.id}`} className="font-semibold text-fg hover:underline">
                        {a.name}
                      </Link>
                      {a.isVip && (
                        <Pill tone="dark">
                          <Star className="size-2.5 fill-current text-warning" /> VIP
                        </Pill>
                      )}
                      {a.assignedRooms && a.assignedRooms.length > 0 ? (
                        <span className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                          Rm {a.assignedRooms.join(', ')}
                        </span>
                      ) : (
                        <Link href="/desk" className="rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] text-fg-muted hover:border-fg hover:text-fg">
                          Assign Rm #
                        </Link>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
                      <span>{a.rooms}</span>
                      {a.eta && <span>· ETA {a.eta}</span>}
                      {a.phone && (
                        <a
                          href={whatsappLink(a.phone, `Hello ${a.name.split(' ')[0]}, we look forward to welcoming you to Reberon Hotel (${a.code}).`)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-fg hover:underline"
                        >
                          <Phone className="size-2.5" /> {a.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold tabular">{a.balance} due</span>
                    <Status value={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`In-House Guests Tonight (${inHouseList.length})`}
          description={`${b.occupancy.guestsInHouse ?? 0} guests occupying ${b.occupancy.tonight} rooms`}
          actions={<Link href="/desk" className="text-xs font-medium text-brand hover:underline">Front Desk →</Link>}
        >
          {!inHouseList.length ? (
            <Empty title="No guests checked in for tonight yet" />
          ) : (
            <ul className="-my-1 divide-y divide-line text-xs">
                  {inHouseList.map((g) => {
                    const rmNums = g.assignedRooms ?? [];
                    return (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rmNums.length > 0 && (
                            <span className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                              Rm {rmNums.join(', ')}
                            </span>
                          )}
                          <Link href={`/reservations/${g.id}`} className="font-semibold text-fg hover:underline">
                            {g.name}
                          </Link>
                          {g.isVip && (
                            <Pill tone="dark">
                              <Star className="size-2.5 fill-current text-warning" /> VIP
                            </Pill>
                          )}
                          <span className="font-mono text-[11px] text-fg-muted">{g.code}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-fg-muted">
                          {g.rooms} · {g.guests ?? 1} pax · Departs {dateShort(g.departure)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-mono font-semibold tabular', BigInt(g.balanceMinor ?? '0') > 0n ? 'text-warning' : 'text-success')}>
                          {BigInt(g.balanceMinor ?? '0') > 0n ? `${g.balance} due` : 'Settled'}
                        </span>
                        <Button size="sm" variant="ghost" href={`/reservations/${g.id}`}>
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                  })}
            </ul>
          )}
        </Section>
      </div>

      {/* Receivables Due (Next 7 Days) */}
      <Section
        title={`Receivables Due — Next 7 Days (${b.promised.length})`}
        description="Confirmed and in-house reservations with an unpaid balance arriving within 7 days"
        actions={<span className="font-mono text-xs font-bold text-warning">Total Due: {money(totalReceivablesUGX, 'UGX')}</span>}
      >
        {!b.promised.length ? (
          <Empty title="No outstanding receivables for the next 7 days" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="pb-2">Booking</th>
                  <th className="pb-2">Guest</th>
                  <th className="pb-2">Suites</th>
                  <th className="pb-2">Arrival</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {b.promised.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/40">
                    <td className="py-2 font-mono font-semibold">
                      <Link href={`/reservations/${p.id}`} className="hover:underline">
                        {p.code}
                      </Link>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Link href={`/reservations/${p.id}`} className="font-semibold text-fg hover:underline">
                          {p.name}
                        </Link>
                        {p.phone && (
                          <a
                            href={whatsappLink(p.phone, `Hello ${p.name.split(' ')[0]}, greetings from Reberon Hotel regarding booking ${p.code}.`)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-fg-muted hover:text-fg"
                          >
                            <Phone className="inline size-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-fg-muted">{p.rooms ?? '—'}</td>
                    <td className="py-2 text-fg-muted">Arrives {dateShort(p.arrival)}</td>
                    <td className="py-2">
                      <Status value={p.status} />
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular text-warning">{p.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
