'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ConciergeBell,
  Pause,
  Play,
  Radio,
  Settings2,
  SprayCan,
  Tv,
  UtensilsCrossed,
  Volume2,
} from 'lucide-react';
import { get } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  triggerManualLiveAlert,
  type LiveConsoleDTO,
  type PriorityStreamItem,
} from '@/components/shell/live-alerts';

type ConsoleChannel = 'ALL' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'POS' | 'AUDIT_STREAM';

export function LiveOperationsConsole() {
  const [channel, setChannel] = useState<ConsoleChannel>('ALL');
  const [autoCycle, setAutoCycle] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [compactMode, setCompactMode] = useState(false);

  const { data } = useQuery({
    queryKey: ['live-console'],
    queryFn: () => get<LiveConsoleDTO>('/live-console'),
    refetchInterval: 12_000,
  });

  const filteredPriority = useMemo(() => {
    const list = data?.priorityStream ?? [];
    if (channel === 'ALL' || channel === 'AUDIT_STREAM') return list;
    return list.filter((item) => item.category === channel);
  }, [data?.priorityStream, channel]);

  // Auto-cycle spotlight every 5 seconds unless paused or hovered
  useEffect(() => {
    if (!autoCycle || filteredPriority.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % filteredPriority.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [autoCycle, filteredPriority.length]);

  const spotlight: PriorityStreamItem | undefined =
    filteredPriority[activeIndex % Math.max(1, filteredPriority.length)];

  const liveStream = data?.liveAlertStream ?? [];

  const toneBadgeStyles: Record<PriorityStreamItem['tone'], string> = {
    red: 'bg-rose-500 text-white border-rose-400',
    amber: 'bg-[#D76E1B] text-white border-[#E88432]',
    sky: 'bg-sky-500 text-white border-sky-400',
    green: 'bg-emerald-500 text-white border-emerald-400',
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
            <span>Dynamic Priority Display & Activity Monitor</span>
          </span>
          <span className="hidden text-[11px] text-white/55 md:inline">
            — Auto-ranked by live urgency ({filteredPriority.length} active queues)
          </span>
        </div>

        {/* Channel Switcher & Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['ALL', 'Priority Queue'],
              ['FRONT_DESK', 'Front Desk'],
              ['HOUSEKEEPING', 'Housekeeping'],
              ['POS', 'POS & Tabs'],
              ['AUDIT_STREAM', 'Live Log'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setChannel(id);
                setActiveIndex(0);
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

          <button
            type="button"
            onClick={() => setAutoCycle((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            title={autoCycle ? 'Pause auto-cycling spotlight' : 'Resume auto-cycling spotlight'}
          >
            {autoCycle ? <Pause className="size-3" /> : <Play className="size-3" />}
            <span className="hidden sm:inline">{autoCycle ? 'Live Cycle' : 'Paused'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerManualLiveAlert({
                ruleLabel: 'Front Desk & Housekeeping Live Test',
                summary:
                  'Live pop-up alert & audio chime verified on your console.',
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

          <Link
            href="/settings/notifications"
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            title="Configure important notifications, recipients & sound chimes"
          >
            <Settings2 className="size-3" />
            <span className="hidden md:inline">Recipients</span>
          </Link>

          <button
            type="button"
            onClick={() => setCompactMode((v) => !v)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-white/75 hover:text-white"
          >
            {compactMode ? 'Expand TV' : 'Ticker Only'}
          </button>
        </div>
      </div>

      {/* Compact Single-Line Ticker Mode vs Split-Screen Interactive Console */}
      {compactMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
          {spotlight ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className={cn(
                  'shrink-0 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
                  toneBadgeStyles[spotlight.tone],
                )}
              >
                {spotlight.badge}
              </span>
              <span className="truncate font-bold text-white">{spotlight.title}</span>
              <span className="hidden truncate text-white/70 sm:inline">
                — {spotlight.subtitle}
              </span>
            </div>
          ) : (
            <span className="text-emerald-300 font-semibold">
              All operational queues clear — watching live bookings, check-outs & POS activity.
            </span>
          )}
          {spotlight && (
            <Link
              href={spotlight.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#D76E1B] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#E88432]"
            >
              <span>{spotlight.ctaLabel}</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      ) : (
        <div
          className="grid gap-0 lg:grid-cols-12"
          onMouseEnter={() => setAutoCycle(false)}
          onMouseLeave={() => setAutoCycle(true)}
        >
          {/* Left 7 Cols: Priority Operational Queue (Dynamically ordered by what's happening right now) */}
          <div className="border-b border-white/10 p-3.5 lg:col-span-7 lg:border-b-0 lg:border-r">
            {channel === 'AUDIT_STREAM' ? (
              <div className="space-y-2">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#E88432]">
                  Live House Activity Stream (Real-Time Bookings, Check-Outs & POS)
                </p>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto pr-1">
                  {liveStream.map((ev) => (
                    <Link
                      key={ev.id}
                      href={ev.href}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs transition hover:border-[#D76E1B]/60 hover:bg-white/[0.08]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#D76E1B]/25 px-1.5 py-0.2 text-[9.5px] font-bold uppercase text-[#F3A257]">
                            {ev.ruleLabel}
                          </span>
                          <span className="truncate font-semibold text-white">{ev.summary}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[10.5px] text-white/60">
                        {ago(ev.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : filteredPriority.length === 0 ? (
              <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
                <CheckCircle2 className="size-6 text-emerald-400" />
                <p className="mt-1.5 text-sm font-bold text-white">
                  Zero Immediate Queues in This Channel
                </p>
                <p className="text-xs text-white/70">
                  New bookings, check-outs, dirty rooms, and unpaid POS tabs appear here automatically by priority.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Active Spotlight Banner */}
                {spotlight && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D76E1B]/45 bg-gradient-to-r from-[#1A1E43] to-[#232958] p-3 shadow-inner">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
                            toneBadgeStyles[spotlight.tone],
                          )}
                        >
                          {spotlight.badge}
                        </span>
                        <span className="font-mono text-[10.5px] text-white/60">
                          Priority #{ (activeIndex % filteredPriority.length) + 1 } of {filteredPriority.length}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[15px] font-extrabold text-white">
                        {spotlight.title}
                      </p>
                      <p className="truncate text-xs text-white/75">{spotlight.subtitle}</p>
                    </div>
                    <Link
                      href={spotlight.href}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D76E1B] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#E88432]"
                    >
                      <span>{spotlight.ctaLabel}</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                )}

                {/* Interactive Priority Strip Pills */}
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {filteredPriority.slice(0, 6).map((item, idx) => {
                    const isFocused = idx === activeIndex % filteredPriority.length;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveIndex(idx)}
                        className={cn(
                          'group flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition',
                          isFocused
                            ? 'border-[#D76E1B] bg-white/12 text-white'
                            : 'border-white/8 bg-white/[0.03] text-white/80 hover:border-white/20 hover:bg-white/[0.07]',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-2 shrink-0 rounded-full',
                                item.tone === 'red'
                                  ? 'bg-rose-500 animate-pulse'
                                  : item.tone === 'amber'
                                    ? 'bg-[#D76E1B]'
                                    : item.tone === 'sky'
                                      ? 'bg-sky-400'
                                      : 'bg-emerald-400',
                              )}
                            />
                            <span className="truncate font-bold">{item.title}</span>
                          </div>
                          <p className="truncate pl-3.5 text-[10.5px] text-white/60">
                            {item.badge} · {item.subtitle}
                          </p>
                        </div>
                        <Link
                          href={item.href}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-white hover:bg-[#D76E1B]"
                        >
                          {item.ctaLabel} →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Cols: Real-Time Event Feed (Check-Ins, Check-Outs, Bookings, Housekeeping & POS) */}
          <div className="flex flex-col justify-between p-3.5 lg:col-span-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-[#F3A257]">
                  <Activity className="size-3.5" />
                  Live Feed (Bookings · Check-Outs · POS)
                </span>
                <Link
                  href="/settings/notifications"
                  className="text-[10.5px] font-semibold text-white/60 hover:text-white underline"
                >
                  Alert Rules →
                </Link>
              </div>

              <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {liveStream.slice(0, 6).map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={ev.href}
                      className="flex items-start justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="mr-1.5 inline-block rounded bg-white/10 px-1.5 py-0.2 text-[9.5px] font-bold uppercase text-[#F3A257]">
                          {ev.category}
                        </span>
                        <span className="font-medium text-white/90">{ev.summary}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-white/55">
                        {ago(ev.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
                {liveStream.length === 0 && (
                  <li className="py-6 text-center text-xs text-white/50">
                    Waiting for live activity…
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
