'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ConciergeBell,
  KeyRound,
  LogOut,
  Printer,
  Settings2,
  ShieldCheck,
  SprayCan,
  Trash2,
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

export type DashboardLens = 'ALL' | 'EXECUTIVE' | 'DESK' | 'HOUSEKEEPING' | 'OPERATIONS' | 'HR_COMMS';

export interface LiveOperationsConsoleProps {
  lens?: DashboardLens;
  onLensChange?: (lens: DashboardLens) => void;
}

// 1. Sleek SVG Circular Progress Ring (Used strictly for ratios like Room Readiness: 6/10)
interface LiveProgressCircleProps {
  label: string;
  value: string;
  sub: string;
  percent: number;
  tone: 'red' | 'amber' | 'emerald' | 'sky';
  active?: boolean;
  icon: LucideIcon;
  onClick: () => void;
}

function LiveProgressCircle({
  label,
  value,
  sub,
  percent,
  tone,
  active = false,
  icon: Icon,
  onClick,
}: LiveProgressCircleProps) {
  const strokeColors: Record<LiveProgressCircleProps['tone'], string> = {
    red: '#F43F5E',
    amber: '#D76E1B',
    emerald: '#10B981',
    sky: '#0284C7',
  };

  const bgToneGlow: Record<LiveProgressCircleProps['tone'], string> = {
    red: 'shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-rose-500/50',
    amber: 'shadow-[0_0_15px_rgba(215,110,27,0.35)] ring-[#D76E1B]/60',
    emerald: 'shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-emerald-500/50',
    sky: 'shadow-[0_0_15px_rgba(2,132,199,0.35)] ring-sky-500/50',
  };

  const circumference = 175.93; // 2 * PI * 28
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-1 min-w-[105px] max-w-[150px] min-h-[110px] flex-col items-center justify-between rounded-2xl border p-2 text-center transition-all duration-200',
        active
          ? cn('border-white/40 bg-white/12 ring-2 ring-offset-2 ring-offset-[#131633]', bgToneGlow[tone])
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]',
      )}
    >
      <div className="relative size-12 shrink-0 sm:size-14">
        <svg className="size-full -rotate-90" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r="28" className="stroke-white/10 fill-none" strokeWidth="4" />
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

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[12px] font-extrabold leading-none text-white tabular sm:text-[13px]">
            {value}
          </span>
        </div>
      </div>

      <div className="w-full min-w-0">
        <span className="flex items-center justify-center gap-1 truncate text-[11px] font-bold text-white leading-tight">
          <Icon className="size-3 shrink-0 opacity-80" />
          <span className="truncate">{label}</span>
        </span>
        <span className="block truncate text-[9.5px] font-medium text-white/60 leading-tight mt-0.5">
          {sub}
        </span>
      </div>
    </button>
  );
}

// 2. Bold Typography Status Pod (Used for raw integer counts with status dots)
interface LiveCountPodProps {
  label: string;
  value: string | number;
  sub: string;
  tone: 'red' | 'amber' | 'emerald' | 'sky' | 'teal';
  pulse?: boolean;
  active?: boolean;
  icon: LucideIcon;
  onClick: () => void;
}

function LiveCountPod({
  label,
  value,
  sub,
  tone,
  pulse = false,
  active = false,
  icon: Icon,
  onClick,
}: LiveCountPodProps) {
  const dotColor: Record<LiveCountPodProps['tone'], string> = {
    red: 'bg-rose-500',
    amber: 'bg-[#D76E1B]',
    emerald: 'bg-emerald-400',
    sky: 'bg-sky-400',
    teal: 'bg-teal-400',
  };

  const bgToneGlow: Record<LiveCountPodProps['tone'], string> = {
    red: 'shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-rose-500/50',
    amber: 'shadow-[0_0_15px_rgba(215,110,27,0.35)] ring-[#D76E1B]/60',
    emerald: 'shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-emerald-500/50',
    sky: 'shadow-[0_0_15px_rgba(2,132,199,0.35)] ring-sky-500/50',
    teal: 'shadow-[0_0_15px_rgba(20,184,166,0.35)] ring-teal-500/50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-1 min-w-[105px] max-w-[150px] min-h-[110px] flex-col justify-between rounded-2xl border p-2.5 text-left transition-all duration-200',
        active
          ? cn('border-white/40 bg-white/12 ring-2 ring-offset-2 ring-offset-[#131633]', bgToneGlow[tone])
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]',
      )}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          {pulse ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
            </span>
          ) : (
            <span className={cn('size-2 rounded-full', dotColor[tone])} />
          )}
        </div>
        <Icon className="size-3.5 text-white/60 transition-opacity group-hover:text-white group-hover:opacity-100" />
      </div>

      <div className="my-1">
        <span className="font-display text-2xl font-black text-white tabular tracking-tight leading-none">
          {value}
        </span>
      </div>

      <div className="w-full min-w-0">
        <span className="block truncate text-[11px] font-bold text-white leading-tight">
          {label}
        </span>
        <span className="block truncate text-[9.5px] font-medium text-white/60 leading-tight mt-0.5">
          {sub}
        </span>
      </div>
    </button>
  );
}

// 3. Human-Formatted Activity Feed Parsing & Grouping
function formatShortDateRange(startStr: string, endStr: string): string {
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${startStr} → ${endStr}`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sMonth = months[s.getUTCMonth()];
    const eMonth = months[e.getUTCMonth()];
    const sDay = s.getUTCDate();
    const eDay = e.getUTCDate();
    if (sMonth === eMonth) {
      return `${sMonth} ${sDay}–${eDay}`;
    }
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
  } catch {
    return `${startStr} → ${endStr}`;
  }
}

interface ParsedActivity {
  id: string;
  actionType: 'delete' | 'print' | 'checkin' | 'checkout' | 'pos' | 'hk' | 'user' | 'general';
  actionLabel: string;
  primarySubject: string;
  detail?: string;
  actor: string;
  createdAt: string;
  href: string;
}

function parseActivityItem(ev: {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  href: string;
  createdAt: string;
}): ParsedActivity {
  const sum = ev.summary || '';
  const act = ev.action || '';
  const lower = (act + ' ' + sum).toLowerCase();

  // Deleted reservation RB-XXXX (Name, YYYY-MM-DD - YYYY-MM-DD): Actor
  const delMatch = sum.match(/deleted reservation ([^\s(]+)(?:\s*\(([^,]+),\s*([0-9-]+)\s*-\s*([0-9-]+)\))?(?::\s*(.*))?/i);
  if (delMatch || lower.includes('deleted reservation') || lower.includes('cancelled reservation')) {
    const code = delMatch?.[1] || '';
    const guest = delMatch?.[2]?.trim() || 'Reservation';
    const d1 = delMatch?.[3];
    const d2 = delMatch?.[4];
    const dateRange = d1 && d2 ? formatShortDateRange(d1, d2) : undefined;
    const actor = delMatch?.[5]?.trim() || ev.actorName || 'Staff';
    return {
      id: ev.id,
      actionType: 'delete',
      actionLabel: 'Deleted Reservation',
      primarySubject: guest !== 'Reservation' ? guest : code,
      detail: dateRange ? `${dateRange} · ${code}` : code,
      actor,
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  // Printed RCT-XXXX (copy X)
  const printMatch = sum.match(/printed\s+(rct-[0-9-]+)(?:\s*\(([^)]+)\))?/i);
  if (printMatch || lower.includes('printed rct') || lower.includes('receipt')) {
    const rct = printMatch?.[1]?.toUpperCase() || 'Receipt';
    const copy = printMatch?.[2]?.trim();
    return {
      id: ev.id,
      actionType: 'print',
      actionLabel: 'Printed Receipt',
      primarySubject: rct,
      detail: copy ? copy.toUpperCase() : undefined,
      actor: ev.actorName || 'Staff',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  // Check-In / Check-Out
  if (lower.includes('check_in') || lower.includes('check in') || lower.includes('checked in')) {
    return {
      id: ev.id,
      actionType: 'checkin',
      actionLabel: 'Check-In',
      primarySubject: sum.replace(/check-?in:?/i, '').trim() || 'Guest Arrived',
      actor: ev.actorName || 'Front Desk',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  if (lower.includes('check_out') || lower.includes('check out') || lower.includes('checked out')) {
    return {
      id: ev.id,
      actionType: 'checkout',
      actionLabel: 'Check-Out',
      primarySubject: sum.replace(/check-?out:?/i, '').trim() || 'Guest Departed',
      actor: ev.actorName || 'Front Desk',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  // POS / Dining
  if (lower.includes('order ord-') || lower.includes('pos') || lower.includes('kitchen') || lower.includes('bar')) {
    return {
      id: ev.id,
      actionType: 'pos',
      actionLabel: 'POS Order',
      primarySubject: sum.replace(/(order\s+|pos\s+)/i, '').trim(),
      actor: ev.actorName || 'Staff',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  // User / Password
  if (lower.includes('password') || lower.includes('credential') || lower.includes('user')) {
    const userMatch = sum.match(/password for ([^and]+)/i);
    return {
      id: ev.id,
      actionType: 'user',
      actionLabel: 'Security Update',
      primarySubject: userMatch ? userMatch[1].trim() : 'Staff Account',
      detail: 'Password & Credentials',
      actor: ev.actorName || 'Admin',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  // Housekeeping / Room
  if (lower.includes('housekeeping') || lower.includes('room') || lower.includes('dirty') || lower.includes('clean')) {
    return {
      id: ev.id,
      actionType: 'hk',
      actionLabel: 'Room Status',
      primarySubject: sum,
      actor: ev.actorName || 'Housekeeping',
      createdAt: ev.createdAt,
      href: ev.href,
    };
  }

  return {
    id: ev.id,
    actionType: 'general',
    actionLabel: 'Activity',
    primarySubject: sum,
    actor: ev.actorName || 'System',
    createdAt: ev.createdAt,
    href: ev.href,
  };
}

type GroupedActivity =
  | { kind: 'single'; item: ParsedActivity }
  | {
      kind: 'group';
      key: string;
      actionType: ParsedActivity['actionType'];
      actionLabel: string;
      actor: string;
      latestTime: string;
      count: number;
      items: ParsedActivity[];
    };

function groupConsecutiveActivities(items: ParsedActivity[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  let currentGroup: ParsedActivity[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev = currentGroup[0];

    if (prev && prev.actionType === item.actionType && prev.actor === item.actor) {
      currentGroup.push(item);
    } else {
      if (currentGroup.length === 1) {
        groups.push({ kind: 'single', item: currentGroup[0] });
      } else if (currentGroup.length > 1) {
        groups.push({
          kind: 'group',
          key: `${currentGroup[0].actionType}-${currentGroup[0].actor}-${currentGroup[0].id}`,
          actionType: currentGroup[0].actionType,
          actionLabel: currentGroup[0].actionLabel,
          actor: currentGroup[0].actor,
          latestTime: currentGroup[0].createdAt,
          count: currentGroup.length,
          items: currentGroup,
        });
      }
      currentGroup = [item];
    }
  }

  if (currentGroup.length === 1) {
    groups.push({ kind: 'single', item: currentGroup[0] });
  } else if (currentGroup.length > 1) {
    groups.push({
      kind: 'group',
      key: `${currentGroup[0].actionType}-${currentGroup[0].actor}-${currentGroup[0].id}`,
      actionType: currentGroup[0].actionType,
      actionLabel: currentGroup[0].actionLabel,
      actor: currentGroup[0].actor,
      latestTime: currentGroup[0].createdAt,
      count: currentGroup.length,
      items: currentGroup,
    });
  }

  return groups;
}

const ACTION_ANCHORS: Record<
  ParsedActivity['actionType'],
  { icon: LucideIcon; badge: string; iconColor: string }
> = {
  delete: {
    icon: Trash2,
    badge: 'bg-rose-500/20 text-rose-300 ring-rose-500/35',
    iconColor: 'text-rose-400',
  },
  print: {
    icon: Printer,
    badge: 'bg-sky-500/20 text-sky-200 ring-sky-500/35',
    iconColor: 'text-sky-400',
  },
  checkin: {
    icon: KeyRound,
    badge: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/35',
    iconColor: 'text-emerald-400',
  },
  checkout: {
    icon: LogOut,
    badge: 'bg-amber-500/20 text-amber-200 ring-amber-500/35',
    iconColor: 'text-amber-400',
  },
  pos: {
    icon: UtensilsCrossed,
    badge: 'bg-[#D76E1B]/25 text-[#F3A257] ring-[#D76E1B]/40',
    iconColor: 'text-[#F3A257]',
  },
  hk: {
    icon: SprayCan,
    badge: 'bg-purple-500/20 text-purple-200 ring-purple-500/35',
    iconColor: 'text-purple-300',
  },
  user: {
    icon: ShieldCheck,
    badge: 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/35',
    iconColor: 'text-indigo-300',
  },
  general: {
    icon: Activity,
    badge: 'bg-white/10 text-white/70 ring-white/15',
    iconColor: 'text-white/70',
  },
};

export function LiveOperationsConsole({
  lens = 'ALL',
  onLensChange,
}: LiveOperationsConsoleProps) {
  const me = useMe();
  const can = useCan();

  const isExec = me.role === 'OWNER' || me.role === 'MANAGER';
  const canDesk = isExec || can('desk:operate') || can('bookings:read');
  const canRooms = isExec || can('rooms:status');
  const canPos = isExec || can('pos:operate');
  const canReq = isExec || can('requisitions:request') || can('requisitions:approve');
  const canAudit = isExec || can('audit:read');

  // Channel is directly derived from page lens, removing redundant second navigation tier
  const channel = useMemo(() => {
    if (lens === 'DESK') return 'FRONT_DESK';
    if (lens === 'HOUSEKEEPING') return 'HOUSEKEEPING';
    if (lens === 'OPERATIONS') return 'POS';
    if (lens === 'HR_COMMS') return 'OPERATIONS';
    return 'ALL';
  }, [lens]);

  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showDials, setShowDials] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { data } = useQuery({
    queryKey: ['live-console'],
    queryFn: () => get<LiveConsoleDTO>('/live-console'),
    refetchInterval: 12_000,
  });

  // Strict client-side permission filtering
  const filteredPriority = useMemo(() => {
    const list = (data?.priorityStream ?? []).filter((item) => {
      if (isExec) return true;
      if (item.category === 'FRONT_DESK' && !canDesk) return false;
      if (item.category === 'HOUSEKEEPING' && !canRooms) return false;
      if (item.category === 'POS' && !canPos) return false;
      if (item.category === 'OPERATIONS' && !canReq) return false;
      return true;
    });

    if (channel === 'ALL') return list;
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

  const parsedActivities = useMemo(() => {
    return liveStream.map(parseActivityItem);
  }, [liveStream]);

  const groupedActivities = useMemo(() => {
    return groupConsecutiveActivities(parsedActivities);
  }, [parsedActivities]);

  const circles = data?.circles;
  const activeSpotlight = filteredPriority[spotlightIndex % Math.max(1, filteredPriority.length)];

  const toneBadgeStyles: Record<PriorityStreamItem['tone'], string> = {
    red: 'bg-rose-500 text-white',
    amber: 'bg-[#D76E1B] text-white',
    sky: 'bg-sky-500 text-white',
    green: 'bg-emerald-500 text-white',
  };

  const activeChannelLabel =
    channel === 'FRONT_DESK'
      ? 'Front Desk'
      : channel === 'HOUSEKEEPING'
        ? 'Housekeeping'
        : channel === 'POS'
          ? 'POS & Operations'
          : channel === 'OPERATIONS'
            ? 'Operations'
            : 'All House';

  const urgentCount =
    (circles?.deskOverdue ?? 0) + (circles?.urgentReqs ?? 0) ||
    filteredPriority.filter((p) => p.tone === 'red').length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1A1E43]/25 bg-[#131633] text-white shadow-lg dark:border-white/15">
      {/* Top TV Console Bar — Clean, Single-Tier Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#1A1E43] px-3.5 py-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/40">
            <span className="size-1.5 rounded-full bg-rose-400 animate-ping" />
            LIVE CONSOLE
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-tight text-white">
            <Tv className="size-3.5 text-[#E88432]" />
            <span>Priority Action Queue & Live Stream</span>
          </span>
          <span className="hidden text-[11px] text-white/55 md:inline">
            — {filteredPriority.length} active task{filteredPriority.length === 1 ? '' : 's'} in {activeChannelLabel} scope
          </span>
        </div>

        {/* Action Controls (Eliminated redundant second tab row) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!compactMode && !showAuditLog && (
            <button
              type="button"
              onClick={() => setShowDials((v) => !v)}
              className={cn(
                'rounded-md px-2 py-1 text-[10.5px] font-bold transition',
                showDials
                  ? 'bg-white/20 text-white'
                  : 'bg-white/6 text-white/70 hover:bg-white/12 hover:text-white',
              )}
            >
              {showDials ? 'Hide Dials' : 'Show Dials'}
            </button>
          )}

          {canAudit && (
            <button
              type="button"
              onClick={() => setShowAuditLog((v) => !v)}
              className={cn(
                'rounded-md px-2 py-1 text-[10.5px] font-bold transition',
                showAuditLog
                  ? 'bg-[#D76E1B] text-white shadow-2xs'
                  : 'bg-white/6 text-white/70 hover:bg-white/12 hover:text-white',
              )}
            >
              {showAuditLog ? 'Priority Queue' : 'Full Audit Log'}
            </button>
          )}

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
          {/* Left Column (7 cols): Operational Dials Hub & Focused Action Spotlight */}
          <div className="border-b border-white/10 p-3.5 lg:col-span-7 lg:border-b-0 lg:border-r">
            {showAuditLog ? (
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
                {/* 1. Optional Interactive Metric Hub (Hidden by default to keep workspace clutter-free) */}
                {showDials && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Pod A: Urgent Tasks (Raw Count with Status Dot) */}
                    {(canDesk || canReq || filteredPriority.some((p) => p.tone === 'red')) && (
                      <LiveCountPod
                        label="Urgent Tasks"
                        value={urgentCount}
                        sub={urgentCount > 0 ? `${urgentCount} to Resolve` : 'Zero Overdue'}
                        tone={urgentCount > 0 ? 'red' : 'emerald'}
                        pulse={urgentCount > 0}
                        active={channel === 'ALL'}
                        icon={AlertTriangle}
                        onClick={() => {
                          onLensChange?.('ALL');
                          setSpotlightIndex(0);
                        }}
                      />
                    )}

                    {/* Dial B: Room Readiness (Circular Progress Ring strictly for ratio) */}
                    {canRooms && (
                      <LiveProgressCircle
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
                          onLensChange?.('HOUSEKEEPING');
                          setSpotlightIndex(0);
                        }}
                      />
                    )}

                    {/* Pod C: Front Desk Stays (Raw Count with Status Dot) */}
                    {canDesk && (
                      <LiveCountPod
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
                        tone={(circles?.deskOverdue ?? 0) > 0 ? 'red' : 'sky'}
                        active={channel === 'FRONT_DESK'}
                        icon={ConciergeBell}
                        onClick={() => {
                          onLensChange?.('DESK');
                          setSpotlightIndex(0);
                        }}
                      />
                    )}

                    {/* Pod D: POS & Tabs (Raw Count with Status Dot) */}
                    {canPos && (
                      <LiveCountPod
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
                        tone={(circles?.posOpenOrders ?? 0) > 0 ? 'amber' : 'emerald'}
                        active={channel === 'POS'}
                        icon={UtensilsCrossed}
                        onClick={() => {
                          onLensChange?.('OPERATIONS');
                          setSpotlightIndex(0);
                        }}
                      />
                    )}

                    {/* Pod E: Supply Requisitions (Raw Count with Status Dot) */}
                    {canReq && (
                      <LiveCountPod
                        label="Supply Reqs"
                        value={circles?.urgentReqs ?? 0}
                        sub={(circles?.urgentReqs ?? 0) > 0 ? 'Urgent Reqs' : 'Stock Stable'}
                        tone={(circles?.urgentReqs ?? 0) > 0 ? 'red' : 'teal'}
                        active={channel === 'OPERATIONS'}
                        icon={ClipboardCheck}
                        onClick={() => {
                          onLensChange?.('OPERATIONS');
                          setSpotlightIndex(0);
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 2. Focused Action Spotlight Card (Zero Clutter — Highest Priority First) */}
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
                            Queue #{(spotlightIndex % filteredPriority.length) + 1} of {filteredPriority.length}
                          </span>

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

          {/* Right Column (5 cols): Live Activity Feed (Visual Anchors, Human Formatted, Grouped) */}
          <div className="flex flex-col justify-between p-3.5 lg:col-span-5">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
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
                {groupedActivities.slice(0, 6).map((entry) => {
                  if (entry.kind === 'group') {
                    const isExpanded = !!expandedGroups[entry.key];
                    const anchor = ACTION_ANCHORS[entry.actionType];
                    const AnchorIcon = anchor.icon;

                    return (
                      <li key={entry.key} className="rounded-lg border border-white/8 bg-white/[0.03] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleGroup(entry.key)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] transition hover:bg-white/[0.05]"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className={cn('grid size-5 shrink-0 place-items-center rounded-md ring-1', anchor.badge)}>
                              <AnchorIcon className={cn('size-3', anchor.iconColor)} />
                            </span>
                            <span className="truncate text-white/90">
                              <span className="font-bold text-white">
                                {entry.count} {entry.actionLabel.toLowerCase()}s
                              </span>{' '}
                              <span className="text-white/60">by {entry.actor}</span>
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-white/80">
                              ×{entry.count}
                            </span>
                            <span className="font-mono text-[10px] text-white/50">
                              {ago(entry.latestTime)}
                            </span>
                            <ChevronDown
                              className={cn('size-3 text-white/50 transition-transform', isExpanded && 'rotate-180')}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-white/5 bg-black/20 p-1.5 space-y-1">
                            {entry.items.map((subItem) => (
                              <Link
                                key={subItem.id}
                                href={subItem.href}
                                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[10.5px] hover:bg-white/[0.05]"
                              >
                                <span className="truncate text-white/80">
                                  <span className="font-semibold text-white">{subItem.primarySubject}</span>
                                  {subItem.detail && (
                                    <span className="ml-1 text-white/50">({subItem.detail})</span>
                                  )}
                                </span>
                                <span className="shrink-0 font-mono text-[9.5px] text-white/40">
                                  {ago(subItem.createdAt)}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  }

                  const { item } = entry;
                  const anchor = ACTION_ANCHORS[item.actionType];
                  const AnchorIcon = anchor.icon;

                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px] transition hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={cn('grid size-5 shrink-0 place-items-center rounded-md ring-1', anchor.badge)}>
                            <AnchorIcon className={cn('size-3', anchor.iconColor)} />
                          </span>
                          <div className="truncate text-white/90">
                            <span className="font-bold text-white">{item.actionLabel}</span>
                            <span className="mx-1 text-white/40">·</span>
                            <span className="font-semibold text-white/95">{item.primarySubject}</span>
                            {item.detail && (
                              <span className="ml-1 text-white/55">({item.detail})</span>
                            )}
                            <span className="ml-1 text-white/50 text-[10px]">by {item.actor}</span>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-white/50">
                          {ago(item.createdAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {groupedActivities.length === 0 && (
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
