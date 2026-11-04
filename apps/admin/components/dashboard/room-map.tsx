'use client';
import Link from 'next/link';
import { BrushCleaning, LogIn, LogOut, Wrench } from 'lucide-react';
import type { HkStatus, RackRoomDTO } from '@reberon/contracts';
import { cn } from '@/lib/cn';

const LOOK: Record<HkStatus, { label: string; tile: string; chip: string }> = {
  VACANT_CLEAN: {
    label: 'Ready',
    tile: 'border-emerald-500/40 bg-emerald-500/[0.08]',
    chip: 'bg-emerald-500',
  },
  INSPECTED: {
    label: 'Inspected',
    tile: 'border-emerald-500/55 bg-emerald-500/[0.12]',
    chip: 'bg-emerald-600',
  },
  OCCUPIED: {
    label: 'Occupied',
    tile: 'border-sky-500/40 bg-sky-500/[0.08]',
    chip: 'bg-sky-500',
  },
  VACANT_DIRTY: {
    label: 'Dirty',
    tile: 'border-amber-500/50 bg-amber-500/[0.10]',
    chip: 'bg-amber-500',
  },
  BLOCKED: {
    label: 'Blocked',
    tile: 'border-line bg-surface-2/60 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(127_127_127/0.08)_6px_12px)]',
    chip: 'bg-fg-subtle',
  },
  OUT_OF_ORDER: {
    label: 'Out of order',
    tile: 'border-rose-500/40 bg-rose-500/[0.06] bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(244_63_94/0.08)_6px_12px)]',
    chip: 'bg-rose-500',
  },
};

const LEGEND: { key: HkStatus[]; label: string; dot: string }[] = [
  { key: ['VACANT_CLEAN', 'INSPECTED'], label: 'Ready', dot: 'bg-emerald-500' },
  { key: ['OCCUPIED'], label: 'Occupied', dot: 'bg-sky-500' },
  { key: ['VACANT_DIRTY'], label: 'Dirty', dot: 'bg-amber-500' },
  { key: ['BLOCKED', 'OUT_OF_ORDER'], label: 'Out of service', dot: 'bg-fg-subtle' },
];

/** The whole house at a glance: one tile per room, coloured by state, with today's movements. */
export function RoomMap({
  rooms,
  canClean,
  busyId,
  onMarkClean,
}: {
  rooms: RackRoomDTO[];
  canClean: boolean;
  busyId: string | null;
  onMarkClean: (room: RackRoomDTO) => void;
}) {
  const active = rooms.filter((r) => r.isActive).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const total = active.length || 1;

  return (
    <div className="space-y-2.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        {LEGEND.map((l) => {
          const n = active.filter((r) => l.key.includes(r.hkStatus)).length;
          return n ? <div key={l.label} className={cn('transition-all', l.dot)} style={{ width: `${(n / total) * 100}%` }} /> : null;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-fg-muted">
        {LEGEND.map((l) => {
          const n = active.filter((r) => l.key.includes(r.hkStatus)).length;
          return (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', l.dot)} />
              <span className="tabular text-fg">{n}</span> {l.label}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
        {active.map((r) => {
          const look = LOOK[r.hkStatus];
          const arrivingNotReady = r.arriving && !['VACANT_CLEAN', 'INSPECTED', 'OCCUPIED'].includes(r.hkStatus);
          const who = r.occupant?.guestName ?? r.arriving?.guestName;
          return (
            <div
              key={r.id}
              className={cn(
                'group relative flex min-h-[86px] flex-col justify-between rounded-xl border p-2.5 transition hover:shadow-md',
                look.tile,
                arrivingNotReady && 'ring-2 ring-rose-500/60',
              )}
            >
              <Link href="/rack" className="absolute inset-0 rounded-xl" aria-label={`Room ${r.number}: ${look.label}`} />
              <div className="flex items-start justify-between gap-1">
                <span className="font-display text-[17px] font-extrabold leading-none tabular">{r.number}</span>
                <span className="flex gap-0.5">
                  {r.occupant?.departsToday && (
                    <span title="Departs today" className="grid size-5 place-items-center rounded-md bg-surface text-warning shadow-2xs">
                      <LogOut className="size-3" />
                    </span>
                  )}
                  {r.arriving && (
                    <span title={`Arriving: ${r.arriving.guestName}`} className="grid size-5 place-items-center rounded-md bg-surface text-sky-600 shadow-2xs dark:text-sky-400">
                      <LogIn className="size-3" />
                    </span>
                  )}
                  {r.block && (
                    <span title={r.block.note ?? r.block.reason} className="grid size-5 place-items-center rounded-md bg-surface text-fg-muted shadow-2xs">
                      <Wrench className="size-3" />
                    </span>
                  )}
                </span>
              </div>
              <div className={cn('min-w-0', canClean && r.hkStatus === 'VACANT_DIRTY' && 'pr-8')}>
                <p className="truncate text-[10.5px] font-medium text-fg-muted">{who ? who.split(' ')[0] : r.roomType.name}</p>
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide">
                  <span className={cn('size-1.5 rounded-full', look.chip)} />
                  {arrivingNotReady ? <span className="text-danger">Guest due</span> : look.label}
                </p>
              </div>
              {canClean && r.hkStatus === 'VACANT_DIRTY' && (
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => onMarkClean(r)}
                  title="Mark clean"
                  className="absolute bottom-2 right-2 z-10 grid size-7 place-items-center rounded-lg bg-amber-500 text-white shadow-md transition hover:scale-110 hover:bg-amber-600 disabled:opacity-60"
                >
                  <BrushCleaning className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
