'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ConciergeBell,
  Settings2,
  SprayCan,
  Tv,
  UtensilsCrossed,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { get } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCan, useMe } from '@/lib/providers';
import {
  triggerManualLiveAlert,
  type LiveConsoleDTO,
  type PriorityStreamItem,
} from '@/components/shell/live-alerts';

type ConsoleChannel = 'ALL' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'POS' | 'OPERATIONS' | 'AUDIT_STREAM';

interface LiveCircleProps {
  label: string;
  value: string | number;
  sub: string;
  percent: number;
  tone: 'red' | 'amber' | 'emerald' | 'sky' | 'teal';
  pulse?: boolean;
  active?: boolean;
  icon: LucideIcon;
  onClick: () => void;
}

function LiveStatusCircle({
  label,
  value,
  sub,
  percent,
  tone,
  pulse = false,
  active = false,
  icon: Icon,
  onClick,
}: LiveCircleProps) {
  const strokeColors: Record<LiveCircleProps['tone'], string> = {
    red: '#F43F5E',
    amber: '#D76E1B',
    emerald: '#10B981',
    sky: '#0284C7',
    teal: '#14B8A6',
  };

  const bgToneGlow: Record<LiveCircleProps['tone'], string> = {
    red: 'shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-rose-500/50',
    amber: 'shadow-[0_0_15px_rgba(215,110,27,0.35)] ring-[#D76E1B]/60',
    emerald: 'shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-emerald-500/50',
    sky: 'shadow-[0_0_15px_rgba(2,132,199,0.35)] ring-sky-500/50',
    teal: 'shadow-[0_0_15px_rgba(20,184,166,0.35)] ring-teal-500/50',
  };

  const circumference = 175.93; // 2 * PI * 28
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-1 min-w-[105px] max-w-[150px] flex-col items-center justify-center rounded-2xl border p-2 text-center transition-all duration-200',
        active
          ? cn('border-white/40 bg-white/12 ring-2 ring-offset-2 ring-offset-[#131633]', bgToneGlow[tone])
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]',
      )}
    >
      {/* Animated SVG Ring */}
      <div className="relative size-14 shrink-0 sm:size-16">
        <svg className="size-full -rotate-90" viewBox="0 0 68 68">
          <circle
            cx="34"
            cy="34"
            r="28"
            className="stroke-white/10 fill-none"
            strokeWidth="4"
          />
          <circle
            cx="34"
            cy="34"
            r="28"
            className="fill-none transition-all duration-700 ease-out"
            stroke={strokeColors[tone]}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Metric */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[13px] font-extrabold leading-none text-white tabular sm:text-[14px]">
            {value}
          </span>
          {pulse && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </div>
      </div>

      {/* Label and Subtitle */}
      <div className="mt-1.5 w-full min-w-0">
        <span className="flex items-center justify-center gap-1 truncate text-[11px] font-bold text-white">
          <Icon className="size-3 shrink-0 opacity-80" />
          <span className="truncate">{label}</span>
        </span>
        <span className="block truncate text-[9.5px] font-medium text-white/60">
          {sub}
        </span>
      </div>
    </button>
  );
}

export function LiveOperationsConsole() {
  const me = useMe();
  const can = useCan();

  const isExec = me.role === 'OWNER' || me.role === 'MANAGER';
  const canDesk = isExec || can('desk:operate') || can('bookings:read');
  const canRooms = isExec || can('rooms:status');
  const canPos = isExec || can('pos:operate');
  const canReq = isExec || can('requisitions:request') || can('requisitions:approve');
  const canAudit = isExec || can('audit:read');

  const [channel, setChannel] = useState<ConsoleChannel>('ALL');
  const [compactMode, setCompactMode] = useState(false);
  const [spotlightIndex, setSpotlightIndex] = useState(0);

  const { data } = useQuery({
    queryKey: ['live-console'],
    queryFn: () => get<LiveConsoleDTO>('/live-console'),
    refetchInterval: 12_000,
  });

  // Strict client-side permission filtering (limits matter!)
  const filteredPriority = useMemo(() => {
    const list = (data?.priorityStream ?? []).filter((item) => {
      if (isExec) return true;
      if (item.category === 'FRONT_DESK' && !canDesk) return false;
      if (item.category === 'HOUSEKEEPING' && !canRooms) return false;
      if (item.category === 'POS' && !canPos) return false;
      if (item.category === 'OPERATIONS' && !canReq) return false;
      return true;
    });

    if (channel === 'ALL' || channel === 'AUDIT_STREAM') return list;
    return list.filter((item) => item.category === channel);
  }, [data?.priorityStream, channel, isExec, canDesk, canRooms, canPos, canReq]);

  const liveStream = useMemo(() => {
    return (data?.liveAlertStream ?? []).filter((ev) => {
      if (isExec) return true;
      if (ev.targetedToMe) return true;
      if (ev.category === 'HOUSEKEEPING' && canRooms) return true;
      if (ev.category === 'FRONT_DESK' && canDesk) return true;
      if (ev.category === 'POS' && canPos) return true;
      if (ev.category === 'OPERATIONS' && canReq) return true;
      return false;
    });
  }, [data?.liveAlertStream, isExec, canRooms, canDesk, canPos, canReq]);

  // Channel tabs strictly filtered by user permissions
  const availableChannels: { id: ConsoleChannel; label: string }[] = useMemo(() => {
    const list: { id: ConsoleChannel; label: string }[] = [
      { id: 'ALL', label: 'Priority Hub' },
    ];
    if (canDesk) list.push({ id: 'FRONT_DESK', label: 'Front Desk' });
    if (canRooms) list.push({ id: 'HOUSEKEEPING', label: 'Housekeeping' });
    if (canPos) list.push({ id: 'POS', label: 'POS & Tabs' });
    if (canReq) list.push({ id: 'OPERATIONS', label: 'Operations' });
    if (canAudit) list.push({ id: 'AUDIT_STREAM', label: 'Live Log' });
    return list;
  }, [canDesk, canRooms, canPos, canReq, canAudit]);

  const circles = data?.circles;
  const activeSpotlight = filteredPriority[spotlightIndex % Math.max(1, filteredPriority.length)];

  const toneBadgeStyles: Record<PriorityStreamItem['tone'], string> = {
    red: 'bg-rose-500 text-white',
    amber: 'bg-[#D76E1B] text-white',
    sky: 'bg-sky-500 text-white',
    green: 'bg-emerald-500 text-white',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1A1E43]/25 bg-[#131633] text-white shadow-lg dark:border-white/15">
      {/* Top TV Console Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#1A1E43] px-3.5 py-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/40">
            <span className="size-1.5 rounded-full bg-rose-400 animate-ping" />
            LIVE CONSOLE
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-tight text-white">
            <Tv className="size-3.5 text-[#E88432]" />
            <span>Interactive Operational Dials</span>
          </span>
          <span className="hidden text-[11px] text-white/55 md:inline">
            — {filteredPriority.length} active tasks in your scope
          </span>
        </div>

        {/* Permission-Filtered Channel Switcher & Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {availableChannels.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setChannel(id);
                setSpotlightIndex(0);
              }}
              className={cn(
                'rounded-md px-2 py-1 text-[10.5px] font-bold transition',
                channel === id
                  ? 'bg-[#D76E1B] text-white shadow-2xs'
                  : 'bg-white/6 text-white/70 hover:bg-white/12 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}

          <span className="mx-0.5 h-3.5 w-px bg-white/15" />

          {canAudit && (
            <button
              type="button"
              onClick={() =>
                triggerManualLiveAlert({
                  ruleLabel: 'Live System Test',
                  summary: 'Live pop-up alert & chime verified on your console.',
                  urgency: 'HIGH',
                  soundTone: 'booking',
                })
              }
              className="inline-flex items-center gap-1 rounded-md border border-[#D76E1B]/50 bg-[#D76E1B]/15 px-2 py-1 text-[10.5px] font-semibold text-[#F3A257] hover:bg-[#D76E1B]/25"
              title="Test Live Pop-Up & Sound Alert"
            >
              <Volume2 className="size-3" />
              <span className="hidden sm:inline">Test Alert</span>
            </button>
          )}

          {can('settings:write') && (
            <Link
              href="/settings/notifications"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
              title="Configure notification recipients & alerts"
            >
              <Settings2 className="size-3" />
              <span className="hidden md:inline">Recipients</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setCompactMode((v) => !v)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-white/75 hover:text-white"
          >
            {compactMode ? 'Expand' : 'Minimal'}
          </button>
        </div>
      </div>

      {/* Ticker Mode vs Full Console */}
      {compactMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
          {activeSpotlight ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className={cn(
                  'shrink-0 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
                  toneBadgeStyles[activeSpotlight.tone],
                )}
              >
                {activeSpotlight.badge}
              </span>
              <span className="truncate font-bold text-white">{activeSpotlight.title}</span>
              <span className="hidden truncate text-white/70 sm:inline">— {activeSpotlight.subtitle}</span>
            </div>
          ) : (
            <span className="text-emerald-300 font-semibold">
              All operational queues clear in your scope.
            </span>
          )}
          {activeSpotlight && (
            <Link
              href={activeSpotlight.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#D76E1B] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#E88432]"
            >
              <span>{activeSpotlight.ctaLabel}</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-12">
          {/* Left Column (7 cols): Custom Live Circles Hub & Focused Action Spotlight */}
          <div className="border-b border-white/10 p-3.5 lg:col-span-7 lg:border-b-0 lg:border-r">
            {channel === 'AUDIT_STREAM' ? (
              <div className="space-y-2">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#E88432]">
                  Live System Log (Scoped to your permissions)
                </p>
                <div className="grid max-h-[260px] gap-1.5 overflow-y-auto pr-1">
                  {liveStream.map((ev) => (
                    <Link
                      key={ev.id}
                      href={ev.href}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs transition hover:border-[#D76E1B]/60 hover:bg-white/[0.08]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#D76E1B]/25 px-1.5 py-0.2 text-[9.5px] font-bold uppercase text-[#F3A257]">
                            {ev.category}
                          </span>
                          <span className="truncate font-semibold text-white">{ev.summary}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[10.5px] text-white/60">
                        {ago(ev.createdAt)}
                      </span>
                    </Link>
                  ))}
                  {liveStream.length === 0 && (
                    <div className="py-8 text-center text-xs text-white/50">
                      No recent activity logs for your role.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 1. Custom Live Circles Hub (Role-Gated Interactive Metric Rings) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Circle A: Urgent Alerts Ring (Shown if Desk, Reqs, or active red items exist) */}
                  {(canDesk || canReq || filteredPriority.some((p) => p.tone === 'red')) && (
                    <LiveStatusCircle
                      label="Urgent Tasks"
                      value={
                        (circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) ||
                        filteredPriority.filter((p) => p.tone === 'red').length
                      }
                      sub={
                        (circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) > 0
                          ? 'Action Needed'
                          : 'Zero Overdue'
                      }
                      percent={
                        (circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) > 0 ? 100 : 0
                      }
                      tone={(circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) > 0 ? 'red' : 'emerald'}
                      pulse={(circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) > 0}
                      active={channel === 'ALL'}
                      icon={AlertTriangle}
                      onClick={() => {
                        setChannel('ALL');
                        setSpotlightIndex(0);
                      }}
                    />
                  )}

                  {/* Circle B: Room Turnover & Readiness Ring (Strictly for Housekeeping & Management) */}
                  {canRooms && (
                    <LiveStatusCircle
                      label="Rooms Ready"
                      value={
                        circles?.roomsTotal
                          ? `${circles.roomsClean}/${circles.roomsTotal}`
                          : filteredPriority.filter((p) => p.category === 'HOUSEKEEPING').length > 0
                            ? `${filteredPriority.filter((p) => p.category === 'HOUSEKEEPING').length} Dirty`
                            : 'Ready'
                      }
                      sub={
                        (circles?.roomsDirty ?? 0) > 0
                          ? `${circles?.roomsDirty} to Turn`
                          : 'All Inspected'
                      }
                      percent={
                        circles?.roomsTotal
                          ? Math.round((circles.roomsClean / circles.roomsTotal) * 100)
                          : 70
                      }
                      tone={(circles?.roomsDirty ?? 0) > 0 ? 'amber' : 'emerald'}
                      active={channel === 'HOUSEKEEPING'}
                      icon={BedDouble}
                      onClick={() => {
                        setChannel('HOUSEKEEPING');
                        setSpotlightIndex(0);
                      }}
                    />
                  )}

                  {/* Circle C: Front Desk Stays Ring (Strictly for Front Desk & Management) */}
                  {canDesk && (
                    <LiveStatusCircle
                      label="Front Desk"
                      value={
                        (circles?.deskArrivals ?? 0) > 0
                          ? `${circles?.deskArrivals} In`
                          : `${circles?.deskDepartures ?? 0} Out`
                      }
                      sub={
                        (circles?.deskOverdue ?? 0) > 0
                          ? `${circles?.deskOverdue} Overdue`
                          : `${circles?.deskArrivals ?? 0} Arriving`
                      }
                      percent={Math.min(100, ((circles?.deskArrivals ?? 0) / 8) * 100)}
                      tone={(circles?.deskOverdue ?? 0) > 0 ? 'red' : 'sky'}
                      active={channel === 'FRONT_DESK'}
                      icon={ConciergeBell}
                      onClick={() => {
                        setChannel('FRONT_DESK');
                        setSpotlightIndex(0);
                      }}
                    />
                  )}

                  {/* Circle D: Kitchen & Bar POS Tabs Ring (Strictly for POS, Kitchen, Bar & Management) */}
                  {canPos && (
                    <LiveStatusCircle
                      label="POS & Tabs"
                      value={
                        circles?.posOpenOrders !== undefined
                          ? circles.posOpenOrders
                          : filteredPriority.filter((p) => p.category === 'POS').length
                      }
                      sub={
                        (circles?.posOpenOrders ?? 0) > 0
                          ? `${circles?.posOpenOrders} Open Bills`
                          : 'Orders Settled'
                      }
                      percent={Math.min(100, ((circles?.posOpenOrders ?? 0) / 6) * 100)}
                      tone={(circles?.posOpenOrders ?? 0) > 0 ? 'amber' : 'emerald'}
                      active={channel === 'POS'}
                      icon={UtensilsCrossed}
                      onClick={() => {
                        setChannel('POS');
                        setSpotlightIndex(0);
                      }}
                    />
                  )}

                  {/* Circle E: Supply Requisitions Ring (For Requisitions & Operations) */}
                  {canReq && (
                    <LiveStatusCircle
                      label="Supply Reqs"
                      value={circles?.urgentReqs ?? 0}
                      sub={(circles?.urgentReqs ?? 0) > 0 ? 'Urgent Reqs' : 'Stock Stable'}
                      percent={Math.min(100, ((circles?.urgentReqs ?? 0) / 4) * 100)}
                      tone={(circles?.urgentReqs ?? 0) > 0 ? 'red' : 'teal'}
                      active={channel === 'OPERATIONS'}
                      icon={ClipboardCheck}
                      onClick={() => {
                        setChannel('OPERATIONS');
                        setSpotlightIndex(0);
                      }}
                    />
                  )}
                </div>

                {/* 2. Focused Action Spotlight Card (Zero Ugly Lists — Clean, Minimal, Actionable) */}
                {activeSpotlight ? (
                  <div
                    className={cn(
                      'rounded-xl border p-3 shadow-md transition-all',
                      activeSpotlight.tone === 'red'
                        ? 'border-rose-500/50 bg-gradient-to-r from-rose-950/70 via-[#1A1E43] to-[#1E234D]'
                        : 'border-[#D76E1B]/40 bg-gradient-to-r from-[#1A1E43] to-[#222856]',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider',
                              toneBadgeStyles[activeSpotlight.tone],
                            )}
                          >
                            {activeSpotlight.badge}
                          </span>
                          <span className="font-mono text-[10.5px] text-white/60">
                            Queue #{ (spotlightIndex % filteredPriority.length) + 1 } of {filteredPriority.length}
                          </span>

                          {/* Minimal Pagination Chevrons when multiple tasks exist in scope */}
                          {filteredPriority.length > 1 && (
                            <div className="flex items-center gap-1 ml-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setSpotlightIndex(
                                    (prev) => (prev - 1 + filteredPriority.length) % filteredPriority.length,
                                  )
                                }
                                className="grid size-5 place-items-center rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
                                title="Previous task in queue"
                              >
                                <ChevronLeft className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSpotlightIndex((prev) => (prev + 1) % filteredPriority.length)
                                }
                                className="grid size-5 place-items-center rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
                                title="Next task in queue"
                              >
                                <ChevronRight className="size-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <p className="mt-1 truncate text-[14px] font-extrabold text-white">
                          {activeSpotlight.title}
                        </p>
                        <p className="truncate text-xs text-white/75">{activeSpotlight.subtitle}</p>
                      </div>

                      <Link
                        href={activeSpotlight.href}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white shadow-sm transition',
                          activeSpotlight.tone === 'red'
                            ? 'bg-rose-600 hover:bg-rose-500'
                            : 'bg-[#D76E1B] hover:bg-[#E88432]',
                        )}
                      >
                        <span>{activeSpotlight.ctaLabel}</span>
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                    <span className="font-semibold text-white">
                      All queues clear in this operational channel — everything is up to date.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column (5 cols): Live Activity Feed (Strictly Role-Scoped) */}
          <div className="flex flex-col justify-between p-3.5 lg:col-span-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#F3A257]">
                  <Activity className="size-3.5" />
                  Live Activity Feed
                </span>
                {can('settings:write') && (
                  <Link
                    href="/settings/notifications"
                    className="text-[10px] font-semibold text-white/50 hover:text-white underline"
                  >
                    Alert Rules →
                  </Link>
                )}
              </div>

              <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {liveStream.slice(0, 6).map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={ev.href}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px] transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-bold uppercase text-[#F3A257]">
                          {ev.category}
                        </span>
                        <span className="truncate font-medium text-white/90">{ev.summary}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-white/50">
                        {ago(ev.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
                {liveStream.length === 0 && (
                  <li className="py-6 text-center text-xs text-white/50">
                    Waiting for activity in your scope…
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
