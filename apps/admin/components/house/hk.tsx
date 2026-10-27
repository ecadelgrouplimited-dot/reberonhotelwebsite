'use client';
import type { HkStatus, RackRoomDTO } from '@reberon/contracts';
import { BrushCleaning, CheckCheck, CircleCheck, Lock, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/components/ui/bits';

/** Room states always travel with an icon and a word — never colour alone. */
export const HK: Record<HkStatus, { label: string; short: string; icon: LucideIcon; tone: Tone; tile: string }> = {
  VACANT_CLEAN: { label: 'Clean', short: 'Clean', icon: CircleCheck, tone: 'green', tile: 'border-success/35 bg-success/[0.06]' },
  INSPECTED: { label: 'Inspected', short: 'Inspected', icon: CheckCheck, tone: 'green', tile: 'border-success/60 bg-success/[0.12]' },
  VACANT_DIRTY: { label: 'Dirty', short: 'Dirty', icon: BrushCleaning, tone: 'amber', tile: 'border-warning/50 bg-warning/[0.10]' },
  OCCUPIED: { label: 'Occupied', short: 'Occupied', icon: UserRound, tone: 'blue', tile: 'border-info/40 bg-info/[0.08]' },
  BLOCKED: { label: 'Blocked', short: 'Blocked', icon: Lock, tone: 'neutral', tile: 'border-line-strong bg-surface-2 [background-image:repeating-linear-gradient(135deg,transparent_0_8px,rgb(0_0_0/.035)_8px_9px)]' },
  OUT_OF_ORDER: { label: 'Out of order', short: 'Out', icon: Wrench, tone: 'red', tile: 'border-danger/40 bg-danger/[0.06] [background-image:repeating-linear-gradient(135deg,transparent_0_8px,rgb(0_0_0/.035)_8px_9px)]' },
};

export const TASK_KIND: Record<string, string> = { DEPARTURE: 'Full clean', STAYOVER: 'Stay-over', INSPECTION: 'Inspection', DEEP_CLEAN: 'Deep clean', MAINTENANCE: 'Maintenance' };
export const BLOCK_REASON: Record<string, string> = { MAINTENANCE: 'Maintenance', OWNER_USE: 'Owner use', STAFF: 'Staff', OUT_OF_ORDER: 'Out of order' };

export function HkBadge({ status, className, short }: { status: HkStatus; className?: string; short?: boolean }) {
  const m = HK[status];
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', { green: 'text-success', amber: 'text-warning', blue: 'text-info', red: 'text-danger', neutral: 'text-fg-muted', dark: 'text-fg' }[m.tone], className)}>
      <Icon className="size-3 shrink-0" aria-hidden /> <span className="whitespace-nowrap">{short ? m.short : m.label}</span>
    </span>
  );
}

export function RoomTile({ room, onClick, selected, compact }: { room: RackRoomDTO; onClick?: () => void; selected?: boolean; compact?: boolean }) {
  const m = HK[room.hkStatus];
  const first = (n: string) => n.split(' ')[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start rounded-xl border p-2.5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
        compact ? 'min-h-[4.25rem]' : 'min-h-[5.75rem]',
        m.tile,
        selected && 'ring-2 ring-fg',
        !room.isActive && 'opacity-50',
      )}
      aria-label={`Room ${room.number}, ${room.roomType.name}, ${m.label}${room.occupant ? `, ${room.occupant.guestName}` : ''}`}
    >
      <span className="flex w-full items-start justify-between gap-1.5">
        <span className="text-[1.15rem] font-bold leading-none tracking-tight tabular">{room.number}</span>
        <HkBadge status={room.hkStatus} short />
      </span>
      <span className="mt-1 truncate text-[11px] text-fg-muted">{room.roomType.name}</span>
      {!compact && (
        <span className="mt-auto grid w-full gap-0.5 pt-1.5 text-[11px]">
          {room.occupant && (
            <span className="truncate font-medium">
              {first(room.occupant.guestName)} {room.occupant.departsToday ? <span className="text-warning">· out today</span> : <span className="text-fg-subtle">· → {room.occupant.departure.slice(5).replace('-', '/')}</span>}
            </span>
          )}
          {room.arriving && <span className="truncate font-medium text-info">↘ {first(room.arriving.guestName)}</span>}
          {room.block && <span className="truncate text-fg-muted">{BLOCK_REASON[room.block.reason]} → {room.block.toDate.slice(5).replace('-', '/')}</span>}
          {room.task && ['TODO', 'IN_PROGRESS'].includes(room.task.status) && (
            <span className={cn('truncate', room.task.status === 'IN_PROGRESS' ? 'text-info' : 'text-fg-subtle')}>{room.task.status === 'IN_PROGRESS' ? 'Cleaning now' : TASK_KIND[room.task.kind]}</span>
          )}
        </span>
      )}
    </button>
  );
}

export function RackGrid({ rooms, onPick, compact }: { rooms: RackRoomDTO[]; onPick?: (r: RackRoomDTO) => void; compact?: boolean }) {
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => b - a);
  return (
    <div className="grid gap-3.5">
      {floors.map((f) => (
        <section key={f} aria-label={`Floor ${f}`}>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">{f === 1 ? 'Floor 1 · Ground' : f === 2 ? 'Floor 2 · Upper' : `Floor ${f}`}</p>
          <div className={cn('grid gap-2', compact ? 'grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))]')}>
            {rooms.filter((r) => r.floor === f).map((r) => <RoomTile key={r.id} room={r} compact={compact} onClick={() => onPick?.(r)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RackLegend({ rooms }: { rooms: RackRoomDTO[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
      {(Object.keys(HK) as HkStatus[]).map((s) => {
        const n = rooms.filter((r) => r.hkStatus === s).length;
        if (!n) return null;
        return <li key={s} className="flex items-center gap-1"><HkBadge status={s} /> <span className="font-semibold tabular">{n}</span></li>;
      })}
    </ul>
  );
}
