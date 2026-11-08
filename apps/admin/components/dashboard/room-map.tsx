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

/**
 * The whole house in one strip: a chip per room, coloured by state. A dirty room
 * is a button that marks it clean; every other chip opens the rack.
 */
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

  return (
    <div className="space-y-2">
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

      <div className="flex flex-wrap gap-1.5">
        {active.map((r) => {
          const look = LOOK[r.hkStatus];
          const arrivingNotReady = r.arriving && !['VACANT_CLEAN', 'INSPECTED', 'OCCUPIED'].includes(r.hkStatus);
          const who = r.occupant?.guestName ?? r.arriving?.guestName;
          const tip = [
            `Room ${r.number} · ${r.roomType.name}`,
            arrivingNotReady ? 'Guest due — not ready' : look.label,
            who,
            r.occupant?.departsToday ? 'Departs today' : null,
            r.arriving ? `Arriving: ${r.arriving.guestName}` : null,
            r.block ? (r.block.note ?? r.block.reason) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const clean = canClean && r.hkStatus === 'VACANT_DIRTY';
          const body = (
            <>
              <span className={cn('size-1.5 shrink-0 rounded-full', look.chip)} />
              <span className="font-display text-[13px] font-extrabold tabular">{r.number}</span>
              {r.occupant?.departsToday && <LogOut className="size-3 text-warning" />}
              {r.arriving && <LogIn className="size-3 text-sky-600 dark:text-sky-400" />}
              {r.block && <Wrench className="size-3 text-fg-muted" />}
              {clean && <BrushCleaning className="size-3 text-warning" />}
            </>
          );
          const cls = cn(
            'inline-flex h-8 items-center gap-1 rounded-lg border px-2 transition hover:border-line-strong',
            look.tile,
            arrivingNotReady && 'ring-2 ring-rose-500/60',
          );
          return clean ? (
            <button
              key={r.id}
              type="button"
              disabled={busyId === r.id}
              onClick={() => onMarkClean(r)}
              title={`${tip} · tap to mark clean`}
              aria-label={`Mark room ${r.number} clean`}
              className={cn(cls, 'disabled:opacity-60')}
            >
              {body}
            </button>
          ) : (
            <Link key={r.id} href="/rack" title={tip} aria-label={tip} className={cls}>
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
