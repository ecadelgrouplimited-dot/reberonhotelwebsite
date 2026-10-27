'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BrushCleaning, CheckCheck, CircleCheck, LayoutGrid, List, Lock, Search, SlidersHorizontal, Unlock } from 'lucide-react';
import type { HkStatus, RackRoomDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateRange } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { BLOCK_REASON, HK, HkBadge, RackGrid, TASK_KIND } from '@/components/house/hk';

type Block = { id: string; room: { id: string; number: string }; fromDate: string; toDate: string; reason: string; note: string | null };
const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const err = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Could not save');

function Rack() {
  const qc = useQueryClient();
  const can = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const rack = useQuery({ queryKey: ['rack'], queryFn: () => get<RackRoomDTO[]>('/rack'), refetchInterval: 20_000 });
  const blocks = useQuery({ queryKey: ['room-blocks'], queryFn: () => get<Block[]>('/room-blocks') });

  const [roomId, setRoomId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | HkStatus>('ALL');
  const [floorFilter, setFloorFilter] = useState<'ALL' | number>('ALL');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [q, setQ] = useState('');

  useEffect(() => setRoomId(params.get('room')), [params]);
  const rooms = rack.data ?? [];
  const room = rooms.find((r) => r.id === roomId) ?? null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rack'] });
    qc.invalidateQueries({ queryKey: ['room-blocks'] });
    qc.invalidateQueries({ queryKey: ['desk'] });
    qc.invalidateQueries({ queryKey: ['housekeeping'] });
  };
  const close = () => { setRoomId(null); router.replace('/rack'); };

  const quickStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HkStatus }) => patch(`/rack/${id}/status`, { status }),
    onSuccess: () => { toast.success('Room status updated'); refresh(); },
    onError: err,
  });

  const bulkInspect = useMutation({
    mutationFn: async (cleanRooms: RackRoomDTO[]) => {
      await Promise.all(cleanRooms.map((r) => patch(`/rack/${r.id}/status`, { status: 'INSPECTED' })));
    },
    onSuccess: (_, cleanRooms) => { toast.success(`Inspected ${cleanRooms.length} room(s)`); refresh(); },
    onError: err,
  });

  const cleanUninspected = rooms.filter((r) => r.hkStatus === 'VACANT_CLEAN');
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const term = q.trim().toLowerCase();

  const filteredRooms = rooms.filter((r) => {
    if (statusFilter !== 'ALL' && r.hkStatus !== statusFilter) return false;
    if (floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
    if (term) {
      const hay = `${r.number} ${r.roomType.name} ${r.occupant?.guestName ?? ''} ${r.arriving?.guestName ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const counts = {
    ALL: rooms.length,
    INSPECTED: rooms.filter((r) => r.hkStatus === 'INSPECTED').length,
    VACANT_CLEAN: rooms.filter((r) => r.hkStatus === 'VACANT_CLEAN').length,
    VACANT_DIRTY: rooms.filter((r) => r.hkStatus === 'VACANT_DIRTY').length,
    OCCUPIED: rooms.filter((r) => r.hkStatus === 'OCCUPIED').length,
    BLOCKED: rooms.filter((r) => r.hkStatus === 'BLOCKED' || r.hkStatus === 'OUT_OF_ORDER').length,
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Room Rack"
        description={`${rooms.length} rooms · Real-time housekeeping, occupancy, and off-sale blocks`}
        actions={
          <>
            {can('rooms:inspect') && cleanUninspected.length > 0 && (
              <Button
                size="sm"
                variant="primary"
                icon={<CheckCheck className="size-3.5" />}
                loading={bulkInspect.isPending}
                onClick={() => bulkInspect.mutate(cleanUninspected)}
              >
                Inspect All Clean ({cleanUninspected.length})
              </Button>
            )}
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition', view === 'grid' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                <LayoutGrid className="size-3.5" /> Grid
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition', view === 'table' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                <List className="size-3.5" /> Table
              </button>
            </div>
          </>
        }
      />

      {/* Interactive Status KPI Strip */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {([
          { k: 'ALL', label: 'All Rooms', count: counts.ALL, cls: 'text-fg' },
          { k: 'INSPECTED', label: 'Inspected Ready', count: counts.INSPECTED, cls: 'text-success' },
          { k: 'VACANT_CLEAN', label: 'Vacant Clean', count: counts.VACANT_CLEAN, cls: 'text-success' },
          { k: 'VACANT_DIRTY', label: 'Vacant Dirty', count: counts.VACANT_DIRTY, cls: 'text-warning' },
          { k: 'OCCUPIED', label: 'Occupied', count: counts.OCCUPIED, cls: 'text-info' },
          { k: 'BLOCKED', label: 'Blocked / OOO', count: counts.BLOCKED, cls: 'text-fg-muted' },
        ] as const).map((item) => (
          <button
            key={item.k}
            type="button"
            onClick={() => setStatusFilter(item.k as 'ALL' | HkStatus)}
            className={cn(
              'card flex flex-col items-start justify-between p-2.5 text-left transition',
              statusFilter === item.k ? '!border-fg ring-1 ring-fg bg-surface-2/40' : 'hover:border-line-strong',
            )}
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">{item.label}</span>
            <span className={cn('mt-1 text-lg font-bold leading-none tabular', item.cls)}>{item.count}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-52 pl-8 text-xs"
                placeholder="Room #, type, or guest..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFloorFilter('ALL')}
                className={cn('rounded-md px-2 py-0.5 font-medium transition', floorFilter === 'ALL' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                All Floors
              </button>
              {floors.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFloorFilter(f)}
                  className={cn('rounded-md px-2 py-0.5 font-medium transition', floorFilter === f ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  Floor {f}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] font-medium text-fg-muted">{filteredRooms.length} room{filteredRooms.length === 1 ? '' : 's'} shown</span>
        </div>

        {/* Grid or Table View */}
        {rack.isLoading ? (
          <div className="p-4"><Skeleton className="h-64" /></div>
        ) : !filteredRooms.length ? (
          <Empty title="No rooms match filter" />
        ) : view === 'grid' ? (
          <div className="p-4">
            <RackGrid rooms={filteredRooms} onPick={(r) => setRoomId(r.id)} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Occupant / Arrival</th>
                  <th className="px-3 py-2">Housekeeping Task</th>
                  <th className="px-3 py-2 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredRooms.map((r) => {
                  const vacant = !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(r.hkStatus);
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-3 py-2 font-mono text-sm font-bold tabular">
                        <button type="button" onClick={() => setRoomId(r.id)} className="hover:underline">{r.number}</button>
                      </td>
                      <td className="px-3 py-2 text-fg-muted">Floor {r.floor}</td>
                      <td className="px-3 py-2 font-medium">{r.roomType.name}</td>
                      <td className="px-3 py-2"><HkBadge status={r.hkStatus} /></td>
                      <td className="px-3 py-2">
                        {r.occupant && (
                          <div>
                            <Link href={`/reservations/${r.occupant.reservationId}`} className="font-semibold hover:underline">{r.occupant.guestName}</Link>
                            <span className="ml-1.5 text-[11px] text-fg-muted">{r.occupant.departsToday ? '· Out today' : `· → ${r.occupant.departure}`}</span>
                          </div>
                        )}
                        {r.arriving && (
                          <div className="text-info">
                            ↘ <Link href={`/reservations/${r.arriving.reservationId}`} className="font-semibold hover:underline">{r.arriving.guestName}</Link> arriving
                          </div>
                        )}
                        {r.block && (
                          <div className="text-fg-muted">
                            {BLOCK_REASON[r.block.reason]} ({dateRange(r.block.fromDate, r.block.toDate)})
                          </div>
                        )}
                        {!r.occupant && !r.arriving && !r.block && <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.task ? (
                          <Pill tone={r.task.status === 'IN_PROGRESS' ? 'blue' : r.task.status === 'DONE' || r.task.status === 'INSPECTED' ? 'green' : 'amber'}>
                            {TASK_KIND[r.task.kind]} · {r.task.status}
                          </Pill>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {vacant && (
                            <>
                              {r.hkStatus !== 'VACANT_DIRTY' && (
                                <Button size="sm" variant="ghost" onClick={() => quickStatus.mutate({ id: r.id, status: 'VACANT_DIRTY' })}>Dirty</Button>
                              )}
                              {r.hkStatus !== 'VACANT_CLEAN' && (
                                <Button size="sm" variant="secondary" onClick={() => quickStatus.mutate({ id: r.id, status: 'VACANT_CLEAN' })}>Clean</Button>
                              )}
                              {can('rooms:inspect') && r.hkStatus !== 'INSPECTED' && (
                                <Button size="sm" variant="primary" onClick={() => quickStatus.mutate({ id: r.id, status: 'INSPECTED' })}>Inspect</Button>
                              )}
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setRoomId(r.id)} title="Manage Room">
                            <SlidersHorizontal className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compact Off-Sale / Blocked Rooms Table */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5 text-fg-subtle" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-fg">Off-Sale & Blocked Rooms</h2>
          </div>
          <span className="text-[11px] text-fg-muted">{blocks.data?.length ?? 0} active block(s)</span>
        </div>
        {!blocks.data?.length ? (
          <p className="px-3.5 py-3 text-xs text-fg-muted">No rooms currently blocked off-sale.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/30 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3.5 py-2">Room</th>
                  <th className="px-3.5 py-2">Blocked Dates</th>
                  <th className="px-3.5 py-2">Reason</th>
                  <th className="px-3.5 py-2">Note</th>
                  <th className="px-3.5 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {blocks.data.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-2/40">
                    <td className="px-3.5 py-2 font-mono font-bold tabular">Room {b.room.number}</td>
                    <td className="px-3.5 py-2">{dateRange(b.fromDate, b.toDate)}</td>
                    <td className="px-3.5 py-2"><Pill>{BLOCK_REASON[b.reason] ?? b.reason}</Pill></td>
                    <td className="px-3.5 py-2 text-fg-muted">{b.note || '—'}</td>
                    <td className="px-3.5 py-2 text-right">
                      {can('rooms:manage') && <ReleaseButton block={b} onDone={refresh} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RoomDrawer room={room} onClose={close} onChange={refresh} />
    </div>
  );
}

function ReleaseButton({ block, onDone }: { block: Block; onDone: () => void }) {
  const confirm = useConfirm();
  const m = useMutation({
    mutationFn: () => del(`/room-blocks/${block.id}`),
    onSuccess: () => { toast.success(`Room ${block.room.number} released back on sale`); onDone(); },
    onError: err,
  });
  return (
    <Button
      size="sm"
      icon={<Unlock className="size-3.5" />}
      loading={m.isPending}
      onClick={async () => {
        if (await confirm({ title: `Release Room ${block.room.number}?`, body: 'Remaining blocked nights become bookable immediately.', confirm: 'Release' })) m.mutate();
      }}
    >
      Release
    </Button>
  );
}

function RoomDrawer({ room, onClose, onChange }: { room: RackRoomDTO | null; onClose: () => void; onChange: () => void }) {
  const can = useCan();
  const setStatus = useMutation({
    mutationFn: (status: HkStatus) => patch(`/rack/${room!.id}/status`, { status }),
    onSuccess: () => { toast.success('Updated'); onChange(); },
    onError: err,
  });
  const today = kampalaToday();
  const [block, setBlock] = useState({ fromDate: today, toDate: plus(today, 1), reason: 'MAINTENANCE', note: '' });
  useEffect(() => { if (room) setBlock({ fromDate: today, toDate: plus(today, 1), reason: 'MAINTENANCE', note: '' }); }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const makeBlock = useMutation({
    mutationFn: () => post('/room-blocks', { roomId: room!.id, ...block, note: block.note || undefined }),
    onSuccess: () => { toast.success(`Room ${room!.number} blocked`); onChange(); },
    onError: err,
  });

  const vacant = room && !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(room.hkStatus);
  return (
    <Dialog open={!!room} onClose={onClose} drawer title={room ? `Room ${room.number}` : ''} description={room?.roomType.name}>
      {room && (
        <div className="grid gap-5">
          <div className={`rounded-xl border p-3.5 ${HK[room.hkStatus].tile}`}>
            <HkBadge status={room.hkStatus} className="text-xs" />
            {room.occupant && (
              <p className="mt-1.5 text-xs">
                <Link className="font-semibold hover:underline" href={`/reservations/${room.occupant.reservationId}`}>{room.occupant.guestName}</Link> · {room.occupant.code} · {room.occupant.departsToday ? 'departs today' : `until ${room.occupant.departure}`}
              </p>
            )}
            {room.arriving && (
              <p className="mt-1.5 text-xs">
                Arriving today: <Link className="font-semibold hover:underline" href={`/reservations/${room.arriving.reservationId}`}>{room.arriving.guestName}</Link>
              </p>
            )}
            {room.block && <p className="mt-1.5 text-xs">{BLOCK_REASON[room.block.reason]} · {dateRange(room.block.fromDate, room.block.toDate)}{room.block.note && ` — ${room.block.note}`}</p>}
            {room.task && <p className="mt-1.5 text-xs text-fg-muted">Task: {TASK_KIND[room.task.kind]} ({room.task.status})</p>}
          </div>

          {vacant && (
            <section className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Set Housekeeping State</p>
              <div className="grid grid-cols-3 gap-2">
                <Button size="md" icon={<BrushCleaning className="size-4" />} disabled={room.hkStatus === 'VACANT_DIRTY'} loading={setStatus.isPending && setStatus.variables === 'VACANT_DIRTY'} onClick={() => setStatus.mutate('VACANT_DIRTY')}>Dirty</Button>
                <Button size="md" icon={<CircleCheck className="size-4" />} disabled={room.hkStatus === 'VACANT_CLEAN'} loading={setStatus.isPending && setStatus.variables === 'VACANT_CLEAN'} onClick={() => setStatus.mutate('VACANT_CLEAN')}>Clean</Button>
                {can('rooms:inspect') && <Button size="md" icon={<CheckCheck className="size-4" />} disabled={room.hkStatus === 'INSPECTED'} loading={setStatus.isPending && setStatus.variables === 'INSPECTED'} onClick={() => setStatus.mutate('INSPECTED')}>Inspected</Button>}
              </div>
            </section>
          )}

          {can('rooms:manage') && !room.block && (
            <section className="grid gap-3 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Place Off-Sale Block</p>
              <div className="grid grid-cols-2 gap-2.5">
                <TextInput label="From" type="date" min={today} value={block.fromDate} onChange={(e) => setBlock({ ...block, fromDate: e.target.value })} />
                <TextInput label="Until" type="date" min={plus(block.fromDate, 1)} value={block.toDate} onChange={(e) => setBlock({ ...block, toDate: e.target.value })} />
                <SelectInput label="Reason" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })}>{Object.entries(BLOCK_REASON).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
                <TextInput label="Note" value={block.note} onChange={(e) => setBlock({ ...block, note: e.target.value })} placeholder="Maintenance detail..." />
              </div>
              <Button variant="dark" icon={<Lock className="size-3.5" />} loading={makeBlock.isPending} disabled={block.toDate <= block.fromDate} onClick={() => makeBlock.mutate()}>Block Room {room.number}</Button>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function Page() {
  return <Suspense><Rack /></Suspense>;
}
