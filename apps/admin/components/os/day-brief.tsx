'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, BrushCleaning, LogIn, LogOut, MessageSquareWarning, Sun, X } from 'lucide-react';
import type { AdminPulseDTO, HkBoardDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';

const kampalaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());

/**
 * “Your day” — shown on Home once a day (per person, per device) until dismissed:
 * arrivals, departures, overdue guests, and rooms not ready for someone arriving.
 */
export function DayBrief({ pulse }: { pulse?: AdminPulseDTO }) {
  const me = useMe();
  const can = useCan();
  const key = `rb-day-brief:${me.id}`;
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) === kampalaDay());
    } catch {
      setDismissed(false);
    }
  }, [key]);
  const desk = can('desk:operate');
  const rooms = can('rooms:status');
  const { data: hk } = useQuery({ queryKey: ['hk-board-today'], queryFn: () => get<HkBoardDTO>('/housekeeping'), enabled: rooms && !dismissed, staleTime: 30_000 });

  if (dismissed || !pulse || (!desk && !rooms)) return null;
  const notReady = (hk?.rooms ?? []).filter((r) => r.isActive && r.arriving && !['VACANT_CLEAN', 'INSPECTED', 'OCCUPIED'].includes(r.hkStatus));
  const lines: { icon: typeof Sun; text: string; href: string; tone?: 'red' | 'amber' }[] = [];
  if (desk) {
    const arr = pulse.desk.arrivalsToday - pulse.desk.arrivedToday;
    const dep = pulse.desk.departuresToday - pulse.desk.departedToday;
    if (arr > 0) lines.push({ icon: LogIn, text: `${arr} arrival${arr > 1 ? 's' : ''} still to check in`, href: '/desk?tab=arrivals' });
    if (dep > 0) lines.push({ icon: LogOut, text: `${dep} departure${dep > 1 ? 's' : ''} to check out`, href: '/desk?tab=departures' });
    if (pulse.desk.lateArrivals > 0) lines.push({ icon: AlarmClock, text: `${pulse.desk.lateArrivals} guest${pulse.desk.lateArrivals > 1 ? 's' : ''} overdue — arrive, or mark no-show`, href: '/desk?tab=late', tone: 'red' });
    if (pulse.desk.pendingGuestRequests > 0) lines.push({ icon: MessageSquareWarning, text: `${pulse.desk.pendingGuestRequests} guest request${pulse.desk.pendingGuestRequests > 1 ? 's' : ''} waiting`, href: '/desk', tone: 'amber' });
  }
  if (rooms && notReady.length) {
    lines.push({ icon: BrushCleaning, text: `Not ready for today’s arrivals: room ${notReady.map((r) => r.number).join(', ')}`, href: '/housekeeping', tone: 'red' });
  } else if (rooms && pulse.rooms.vacantDirty > 0) {
    lines.push({ icon: BrushCleaning, text: `${pulse.rooms.vacantDirty} room${pulse.rooms.vacantDirty > 1 ? 's' : ''} to clean`, href: '/housekeeping', tone: 'amber' });
  }
  if (!lines.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key, kampalaDay());
    } catch {
      /* private mode */
    }
    setDismissed(true);
  };

  return (
    <section aria-label="Your day" className="fade-in mx-auto mt-6 max-w-2xl rounded-2xl border border-line bg-gradient-to-br from-[color-mix(in_oklab,var(--accent)_10%,var(--surface))] to-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Sun className="size-4 text-accent" /> Your day
        </p>
        <button type="button" onClick={dismiss} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Dismiss until tomorrow">
          Got it <X className="size-3.5" />
        </button>
      </div>
      <ul className="mt-2 grid gap-1">
        {lines.map((l) => (
          <li key={l.text}>
            <Link href={l.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-surface-2">
              <l.icon className={l.tone === 'red' ? 'size-4 text-danger' : l.tone === 'amber' ? 'size-4 text-warning' : 'size-4 text-fg-muted'} />
              <span className="flex-1">{l.text}</span>
              <span className="text-[11.5px] font-semibold text-fg-subtle">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
