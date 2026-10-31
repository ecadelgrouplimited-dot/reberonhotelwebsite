'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BedDouble,
  BrushCleaning,
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Edit3,
  ExternalLink,
  LayoutGrid,
  List,
  Lock,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
} from 'lucide-react';
import type { DeskBoardDTO, HkStatus, HkTaskKind, RackRoomDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { dateRange, dateShort } from '@/lib/format';
import { exportToCsv } from '@/lib/export-csv';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { BLOCK_REASON, HK, HkBadge, RackGrid, TASK_KIND } from '@/components/house/hk';

type Block = { id: string; room: { id: string; number: string }; fromDate: string; toDate: string; reason: string; note: string | null };
type RoomTypeOption = {
  id: string;
  slug: string;
  name: string;
  activeRoomsCount: number;
  rooms: { id: string; number: string; floor: number; isActive: boolean; hkStatus: HkStatus }[];
};

const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const err = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Could not save');

function Rack() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const confirm = useConfirm();
  const router = useRouter();
  const params = useSearchParams();

  const today = kampalaToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | HkStatus | 'INACTIVE'>('ALL');
  const [floorFilter, setFloorFilter] = useState<'ALL' | number>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [view, setView] = useState<'grid' | 'table' | 'manage'>('grid');
  const [q, setQ] = useState('');
  const [addRoomOpen, setAddRoomOpen] = useState(false);

  const rack = useQuery({
    queryKey: ['rack', selectedDate],
    queryFn: () => get<RackRoomDTO[]>(`/rack?date=${selectedDate}`),
    refetchInterval: 20_000,
  });
  const blocks = useQuery({ queryKey: ['room-blocks'], queryFn: () => get<Block[]>('/room-blocks') });
  const roomTypesQuery = useQuery({
    queryKey: ['room-types-list'],
    queryFn: () => get<RoomTypeOption[]>('/room-types-list'),
  });
  const deskQuery = useQuery({
    queryKey: ['desk', selectedDate],
    queryFn: () => get<DeskBoardDTO>(`/desk?date=${selectedDate}`),
    enabled: can('desk:operate'),
  });

  useEffect(() => setRoomId(params.get('room')), [params]);
  const rooms = rack.data ?? [];
  const roomTypes = roomTypesQuery.data ?? [];
  const room = rooms.find((r) => r.id === roomId) ?? null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rack'] });
    qc.invalidateQueries({ queryKey: ['room-blocks'] });
    qc.invalidateQueries({ queryKey: ['room-types-list'] });
    qc.invalidateQueries({ queryKey: ['desk'] });
    qc.invalidateQueries({ queryKey: ['housekeeping'] });
  };
  const close = () => {
    setRoomId(null);
    router.replace('/rack');
  };

  const quickStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HkStatus }) => patch(`/rack/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Room status updated');
      refresh();
    },
    onError: err,
  });

  const bulkInspect = useMutation({
    mutationFn: async (cleanRooms: RackRoomDTO[]) => {
      await Promise.all(cleanRooms.map((r) => patch(`/rack/${r.id}/status`, { status: 'INSPECTED' })));
    },
    onSuccess: (_, cleanRooms) => {
      toast.success(`Inspected ${cleanRooms.length} room(s)`);
      refresh();
    },
    onError: err,
  });

  const deleteRoomMut = useMutation({
    mutationFn: (id: string) => del(`/rooms/${id}`),
    onSuccess: () => {
      toast.success('Room number deleted');
      refresh();
    },
    onError: err,
  });

  const cleanUninspected = rooms.filter((r) => r.isActive && r.hkStatus === 'VACANT_CLEAN');
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const term = q.trim().toLowerCase();

  const filteredRooms = rooms.filter((r) => {
    if (statusFilter === 'INACTIVE') {
      if (r.isActive) return false;
    } else if (statusFilter !== 'ALL') {
      if (statusFilter === 'BLOCKED') {
        if (r.hkStatus !== 'BLOCKED' && r.hkStatus !== 'OUT_OF_ORDER') return false;
      } else if (r.hkStatus !== statusFilter) {
        return false;
      }
    }
    if (floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
    if (typeFilter !== 'ALL' && r.roomType.id !== typeFilter) return false;
    if (term) {
      const hay = `${r.number} ${r.roomType.name} ${r.occupant?.guestName ?? ''} ${r.arriving?.guestName ?? ''} ${r.notes ?? ''}`.toLowerCase();
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

  // Unassigned arrivals for selectedDate
  const unassignedArrivals = (deskQuery.data?.arrivals ?? []).filter(
    (s) =>
      ['CONFIRMED', 'HELD'].includes(s.status) &&
      s.rooms.some((rm) => rm.assigned.length < rm.quantity),
  );

  return (
    <div className="fade-in">
      <PageHeader
        title="Room Rack & Room Numbers"
        description={`${rooms.length} physical rooms across ${floors.length} floor(s) · Live occupancy, housekeeping, room numbers & off-sale blocks`}
        actions={
          <>
            {/* Date Picker */}
            <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDate((d) => plus(d, -1))}
                className="rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
                title="Previous day"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent px-1.5 py-0.5 font-mono text-xs font-medium text-fg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSelectedDate((d) => plus(d, 1))}
                className="rounded px-1.5 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
                title="Next day"
              >
                <ChevronRight className="size-3.5" />
              </button>
              {selectedDate !== today && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="ml-1 rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg hover:bg-line"
                >
                  Today
                </button>
              )}
            </div>

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

            {can('rooms:manage') && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={() => setAddRoomOpen(true)}
              >
                Add Room #
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              disabled={!filteredRooms.length}
              icon={<Download className="size-3.5" />}
              onClick={() =>
                exportToCsv(
                  `reberon-room-rack-${selectedDate}.csv`,
                  ['Room #', 'Floor', 'Room Type', 'Status', 'Active', 'Occupant', 'Arriving Guest', 'Active Task', 'Room Notes'],
                  filteredRooms.map((r) => [
                    r.number,
                    r.floor,
                    r.roomType.name,
                    r.hkStatus,
                    r.isActive ? 'Yes' : 'No',
                    r.occupant ? `${r.occupant.guestName} (${r.occupant.code})` : '',
                    r.arriving ? `${r.arriving.guestName} (${r.arriving.code})` : '',
                    r.task ? `${r.task.kind} (${r.task.status})` : '',
                    r.notes ?? '',
                  ]),
                )
              }
            >
              Export CSV
            </Button>

            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                  view === 'grid' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                <LayoutGrid className="size-3.5" /> Grid
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                  view === 'table' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                <List className="size-3.5" /> Table
              </button>
              {can('rooms:manage') && (
                <button
                  type="button"
                  onClick={() => setView('manage')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition',
                    view === 'manage' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Settings2 className="size-3.5" /> Room Numbers
                </button>
              )}
            </div>
          </>
        }
      />

      {/* Interactive Status KPI Strip */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(
          [
            { k: 'ALL', label: 'All Rooms', count: counts.ALL, cls: 'text-fg' },
            { k: 'INSPECTED', label: 'Inspected Ready', count: counts.INSPECTED, cls: 'text-success' },
            { k: 'VACANT_CLEAN', label: 'Vacant Clean', count: counts.VACANT_CLEAN, cls: 'text-success' },
            { k: 'VACANT_DIRTY', label: 'Vacant Dirty', count: counts.VACANT_DIRTY, cls: 'text-warning' },
            { k: 'OCCUPIED', label: 'Occupied', count: counts.OCCUPIED, cls: 'text-info' },
            { k: 'BLOCKED', label: 'Blocked / OOO', count: counts.BLOCKED, cls: 'text-fg-muted' },
          ] as const
        ).map((item) => (
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

      {/* Unassigned Arrivals Banner (if any arrivals need room numbers assigned) */}
      {unassignedArrivals.length > 0 && (
        <div className="card mb-4 border-warning/40 bg-warning/[0.04] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <BedDouble className="size-4 text-warning" />
              <span className="font-semibold text-fg">
                {unassignedArrivals.length} Arriving Guest{unassignedArrivals.length > 1 ? 's' : ''} Need a Room Number Assigned ({dateShort(selectedDate)})
              </span>
              <span className="text-fg-muted">Click a ready room below or assign directly:</span>
            </div>
            <Link href="/desk" className="text-xs font-semibold text-fg hover:underline">
              Open Front Desk →
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {unassignedArrivals.map((s) => (
              <div
                key={s.id}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono font-bold">{s.code}</span>
                <span className="font-semibold">{s.guest.name}</span>
                <span className="text-fg-muted">({s.roomSummary})</span>
                <Link
                  href={`/desk?assign=${s.id}`}
                  className="rounded bg-fg px-2 py-0.5 text-[11px] font-semibold text-bg hover:opacity-90"
                >
                  Assign Room #
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
                className={cn(
                  'rounded-md px-2 py-0.5 font-medium transition',
                  floorFilter === 'ALL' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                All Floors
              </button>
              {floors.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFloorFilter(f)}
                  className={cn(
                    'rounded-md px-2 py-0.5 font-medium transition',
                    floorFilter === f ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  Floor {f}
                </button>
              ))}
            </div>
            {roomTypes.length > 0 && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by Suite Type"
                className="h-7 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-fg focus:border-fg focus:outline-none"
              >
                <option value="ALL">All Suite Categories ({rooms.length})</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({rt.activeRoomsCount})
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="text-[11px] font-medium text-fg-muted">
            {filteredRooms.length} room{filteredRooms.length === 1 ? '' : 's'} shown
          </span>
        </div>

        {/* Grid, Table, or Manage Room Numbers View */}
        {rack.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-64" />
          </div>
        ) : !filteredRooms.length ? (
          <Empty title="No rooms match filter" />
        ) : view === 'grid' ? (
          <div className="p-4">
            <RackGrid rooms={filteredRooms} onPick={(r) => setRoomId(r.id)} />
          </div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Room #</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Suite Category</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Occupant / Arrival</th>
                  <th className="px-3 py-2">Housekeeping Task</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredRooms.map((r) => {
                  const vacant = !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(r.hkStatus);
                  return (
                    <tr key={r.id} className={cn('hover:bg-surface-2/40 transition-colors', !r.isActive && 'opacity-55')}>
                      <td className="px-3 py-2 font-mono text-sm font-bold tabular">
                        <button type="button" onClick={() => setRoomId(r.id)} className="hover:underline">
                          {r.number}
                        </button>
                        {!r.isActive && <Pill className="ml-1.5">Inactive</Pill>}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">Floor {r.floor}</td>
                      <td className="px-3 py-2 font-medium">{r.roomType.name}</td>
                      <td className="px-3 py-2">
                        <HkBadge status={r.hkStatus} />
                      </td>
                      <td className="px-3 py-2">
                        {r.occupant && (
                          <div>
                            <Link href={`/reservations/${r.occupant.reservationId}`} className="font-semibold hover:underline">
                              {r.occupant.guestName}
                            </Link>
                            <span className="ml-1.5 font-mono text-[11px] text-fg-muted">({r.occupant.code})</span>
                            <span className="ml-1.5 text-[11px] text-fg-muted">
                              {r.occupant.departsToday ? '· Out today' : `· → ${r.occupant.departure}`}
                            </span>
                          </div>
                        )}
                        {r.arriving && (
                          <div className="text-info">
                            ↘{' '}
                            <Link href={`/reservations/${r.arriving.reservationId}`} className="font-semibold hover:underline">
                              {r.arriving.guestName}
                            </Link>{' '}
                            arriving ({r.arriving.code})
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
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[12rem] truncate text-fg-muted">{r.notes || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {vacant && r.isActive && (
                            <>
                              {r.hkStatus !== 'VACANT_DIRTY' && (
                                <Button size="sm" variant="ghost" onClick={() => quickStatus.mutate({ id: r.id, status: 'VACANT_DIRTY' })}>
                                  Dirty
                                </Button>
                              )}
                              {r.hkStatus !== 'VACANT_CLEAN' && (
                                <Button size="sm" variant="secondary" onClick={() => quickStatus.mutate({ id: r.id, status: 'VACANT_CLEAN' })}>
                                  Clean
                                </Button>
                              )}
                              {can('rooms:inspect') && r.hkStatus !== 'INSPECTED' && (
                                <Button size="sm" variant="primary" onClick={() => quickStatus.mutate({ id: r.id, status: 'INSPECTED' })}>
                                  Inspect
                                </Button>
                              )}
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setRoomId(r.id)} title="Manage Room & Number">
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
        ) : (
          /* Manage Room Numbers View (Grouped by Suite Type) */
          <div className="p-4 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Physical Room Numbers Directory</h3>
                <p className="text-xs text-fg-muted">
                  Each room number below is linked to a Suite Category (`RoomType`). Adding or activating a room number automatically updates live booking inventory.
                </p>
              </div>
              {can('rooms:manage') && (
                <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAddRoomOpen(true)}>
                  Add New Room Number
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {roomTypes.map((rt) => {
                const rtRooms = rooms.filter((r) => r.roomType.id === rt.id);
                return (
                  <div key={rt.id} className="rounded-xl border border-line bg-surface overflow-hidden">
                    <div className="flex items-center justify-between border-b border-line bg-surface-2/50 px-3.5 py-2.5">
                      <div>
                        <h4 className="font-semibold text-sm text-fg">{rt.name}</h4>
                        <span className="text-[11px] text-fg-muted">
                          {rtRooms.filter((r) => r.isActive).length} active room(s) · {rtRooms.length} total units
                        </span>
                      </div>
                      <Link href="/website/rooms" className="text-[11px] font-medium text-fg-muted hover:text-fg hover:underline">
                        Suite Info →
                      </Link>
                    </div>
                    {!rtRooms.length ? (
                      <p className="p-3.5 text-xs text-fg-muted">No room numbers assigned to this suite category yet.</p>
                    ) : (
                      <div className="divide-y divide-line text-xs">
                        {rtRooms.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-surface-2/30">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="inline-flex items-center rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-sm font-bold tabular">
                                {r.number}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-fg">Floor {r.floor}</span>
                                  <HkBadge status={r.hkStatus} short />
                                  {!r.isActive && <Pill tone="amber">Inactive</Pill>}
                                </div>
                                {r.notes && <p className="text-[11px] text-fg-muted truncate max-w-[16rem]">{r.notes}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="secondary" icon={<Edit3 className="size-3" />} onClick={() => setRoomId(r.id)}>
                                Edit
                              </Button>
                              {['OWNER', 'MANAGER'].includes(me.role) && !r.occupant && !r.arriving && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Trash2 className="size-3.5 text-danger" />}
                                  title="Delete Room Number"
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        title: `Delete Room ${r.number}?`,
                                        body: `This removes physical Room ${r.number} (${rt.name}) and reduces bookable inventory for ${rt.name} by 1.`,
                                        confirm: `Delete Room ${r.number}`,
                                        danger: true,
                                      })
                                    ) {
                                      deleteRoomMut.mutate(r.id);
                                    }
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                    <td className="px-3.5 py-2">
                      <Pill>{BLOCK_REASON[b.reason] ?? b.reason}</Pill>
                    </td>
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

      <RoomDrawer
        room={room}
        roomTypes={roomTypes}
        unassignedArrivals={unassignedArrivals}
        onClose={close}
        onChange={refresh}
      />

      <AddRoomDialog
        open={addRoomOpen}
        roomTypes={roomTypes}
        onClose={() => setAddRoomOpen(false)}
        onDone={() => {
          setAddRoomOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function ReleaseButton({ block, onDone }: { block: Block; onDone: () => void }) {
  const confirm = useConfirm();
  const m = useMutation({
    mutationFn: () => del(`/room-blocks/${block.id}`),
    onSuccess: () => {
      toast.success(`Room ${block.room.number} released back on sale`);
      onDone();
    },
    onError: err,
  });
  return (
    <Button
      size="sm"
      icon={<Unlock className="size-3.5" />}
      loading={m.isPending}
      onClick={async () => {
        if (
          await confirm({
            title: `Release Room ${block.room.number}?`,
            body: 'Remaining blocked nights become bookable immediately.',
            confirm: 'Release',
          })
        )
          m.mutate();
      }}
    >
      Release
    </Button>
  );
}

function AddRoomDialog({
  open,
  roomTypes,
  onClose,
  onDone,
}: {
  open: boolean;
  roomTypes: RoomTypeOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    number: '',
    floor: 1,
    roomTypeId: '',
    hkStatus: 'VACANT_CLEAN' as 'VACANT_CLEAN' | 'VACANT_DIRTY' | 'INSPECTED',
    isActive: true,
    notes: '',
  });

  useEffect(() => {
    if (open && roomTypes.length > 0 && !form.roomTypeId) {
      setForm((prev) => ({ ...prev, roomTypeId: roomTypes[0]!.id }));
    }
  }, [open, roomTypes, form.roomTypeId]);

  const m = useMutation({
    mutationFn: () =>
      post('/rooms', {
        number: form.number.trim().toUpperCase(),
        floor: Number(form.floor),
        roomTypeId: form.roomTypeId,
        hkStatus: form.hkStatus,
        isActive: form.isActive,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Room ${form.number.trim().toUpperCase()} added to Room Rack`);
      setForm((prev) => ({ ...prev, number: '', notes: '' }));
      onDone();
    },
    onError: err,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Physical Room Number"
      description="Create a numbered room unit and link it to a Suite Category. Bookable inventory updates automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            loading={m.isPending}
            disabled={!form.number.trim() || !form.roomTypeId}
            onClick={() => m.mutate()}
          >
            Create Room {form.number.trim().toUpperCase()}
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Room Number *"
            placeholder="e.g. 106, 206, 301"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value.toUpperCase() })}
          />
          <TextInput
            label="Floor *"
            type="number"
            min={0}
            max={20}
            value={String(form.floor)}
            onChange={(e) => setForm({ ...form, floor: Number(e.target.value) || 1 })}
          />
        </div>
        <SelectInput
          label="Suite Category (Room Type) *"
          value={form.roomTypeId}
          onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}
        >
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name} ({rt.activeRoomsCount} active rooms)
            </option>
          ))}
        </SelectInput>
        <SelectInput
          label="Initial Housekeeping State"
          value={form.hkStatus}
          onChange={(e) => setForm({ ...form, hkStatus: e.target.value as 'VACANT_CLEAN' | 'VACANT_DIRTY' | 'INSPECTED' })}
        >
          <option value="VACANT_CLEAN">Vacant Clean</option>
          <option value="INSPECTED">Inspected Ready</option>
          <option value="VACANT_DIRTY">Vacant Dirty (needs turnaround)</option>
        </SelectInput>
        <TextInput
          label="Permanent Room Notes (optional)"
          placeholder="e.g. Corner balcony overlooking Sipi ridge, king bed..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <Switch
          label="Room active & open for sale"
          hint="Active rooms count toward your total bookable suite inventory."
          checked={form.isActive}
          onChange={(v) => setForm({ ...form, isActive: v })}
        />
      </div>
    </Dialog>
  );
}

function RoomDrawer({
  room,
  roomTypes,
  unassignedArrivals,
  onClose,
  onChange,
}: {
  room: RackRoomDTO | null;
  roomTypes: RoomTypeOption[];
  unassignedArrivals: DeskBoardDTO['arrivals'];
  onClose: () => void;
  onChange: () => void;
}) {
  const can = useCan();
  const me = useMe();
  const confirm = useConfirm();
  const [drawerTab, setDrawerTab] = useState<'ops' | 'edit'>('ops');

  const setStatus = useMutation({
    mutationFn: (status: HkStatus) => patch(`/rack/${room!.id}/status`, { status }),
    onSuccess: () => {
      toast.success('Housekeeping status updated');
      onChange();
    },
    onError: err,
  });

  const today = kampalaToday();
  const [block, setBlock] = useState({ fromDate: today, toDate: plus(today, 1), reason: 'MAINTENANCE', note: '' });
  const [taskForm, setTaskForm] = useState<{ kind: HkTaskKind; priority: number; notes: string }>({
    kind: 'DEPARTURE',
    priority: 1,
    notes: '',
  });
  const [editForm, setEditForm] = useState({
    number: '',
    floor: 1,
    roomTypeId: '',
    isActive: true,
    notes: '',
  });

  useEffect(() => {
    if (room) {
      setDrawerTab('ops');
      setBlock({ fromDate: today, toDate: plus(today, 1), reason: 'MAINTENANCE', note: '' });
      setTaskForm({
        kind: room.hkStatus === 'OCCUPIED' ? 'STAYOVER' : 'DEPARTURE',
        priority: 1,
        notes: '',
      });
      setEditForm({
        number: room.number,
        floor: room.floor,
        roomTypeId: room.roomType.id,
        isActive: room.isActive,
        notes: room.notes ?? '',
      });
    }
  }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeBlock = useMutation({
    mutationFn: () => post('/room-blocks', { roomId: room!.id, ...block, note: block.note || undefined }),
    onSuccess: () => {
      toast.success(`Room ${room!.number} blocked`);
      onChange();
    },
    onError: err,
  });

  const createTaskMut = useMutation({
    mutationFn: () =>
      post('/housekeeping/tasks', {
        roomId: room!.id,
        date: today,
        kind: taskForm.kind,
        priority: taskForm.priority,
        notes: taskForm.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Dispatched ${TASK_KIND[taskForm.kind]} task for Room ${room!.number}`);
      setTaskForm((prev) => ({ ...prev, notes: '' }));
      onChange();
    },
    onError: err,
  });

  const updateRoomMut = useMutation({
    mutationFn: () =>
      patch(`/rooms/${room!.id}`, {
        number: editForm.number.trim().toUpperCase(),
        floor: Number(editForm.floor),
        roomTypeId: editForm.roomTypeId,
        isActive: editForm.isActive,
        notes: editForm.notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success(`Room ${editForm.number.trim().toUpperCase()} settings saved`);
      onChange();
    },
    onError: err,
  });

  const deleteRoomMut = useMutation({
    mutationFn: () => del(`/rooms/${room!.id}`),
    onSuccess: () => {
      toast.success(`Room ${room!.number} deleted`);
      onClose();
      onChange();
    },
    onError: err,
  });

  const assignToBookingMut = useMutation({
    mutationFn: async (stayId: string) => {
      const stay = unassignedArrivals.find((s) => s.id === stayId);
      if (!stay || !room) throw new Error('Booking not found');
      const matchingRr = stay.rooms.find((rm) => rm.roomTypeId === room.roomType.id);
      if (!matchingRr) throw new Error(`Booking requires a different suite type`);
      const existingAssigns = stay.rooms.flatMap((rm) =>
        rm.assigned.map((a) => ({ reservationRoomId: rm.reservationRoomId, roomId: a.roomId })),
      );
      const nextAssigns = [
        ...existingAssigns.filter((a) => a.reservationRoomId !== matchingRr.reservationRoomId),
        ...matchingRr.assigned.slice(0, matchingRr.quantity - 1).map((a) => ({
          reservationRoomId: matchingRr.reservationRoomId,
          roomId: a.roomId,
        })),
        { reservationRoomId: matchingRr.reservationRoomId, roomId: room.id },
      ];
      return post(`/desk/reservations/${stay.id}/assign`, { assignments: nextAssigns, allowDirty: true });
    },
    onSuccess: () => {
      toast.success(`Assigned guest to Room ${room?.number}`);
      onChange();
    },
    onError: err,
  });

  const vacant = room && !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(room.hkStatus);
  const matchingArrivals = room
    ? unassignedArrivals.filter((s) =>
        s.rooms.some((rm) => rm.roomTypeId === room.roomType.id && rm.assigned.length < rm.quantity),
      )
    : [];

  return (
    <Dialog
      open={!!room}
      onClose={onClose}
      drawer
      title={room ? `Room ${room.number} · Floor ${room.floor}` : ''}
      description={room?.roomType.name}
    >
      {room && (
        <div className="grid gap-5">
          {can('rooms:manage') && (
            <div className="flex rounded-lg border border-line bg-surface-2/50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDrawerTab('ops')}
                className={cn(
                  'flex-1 rounded-md py-1.5 font-semibold transition',
                  drawerTab === 'ops' ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                )}
              >
                Operations & Housekeeping
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('edit')}
                className={cn(
                  'flex-1 rounded-md py-1.5 font-semibold transition',
                  drawerTab === 'edit' ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                )}
              >
                Edit Room Number & Details
              </button>
            </div>
          )}

          {drawerTab === 'ops' ? (
            <>
              <div className={`rounded-xl border p-3.5 ${HK[room.hkStatus].tile}`}>
                <div className="flex items-center justify-between">
                  <HkBadge status={room.hkStatus} className="text-xs" />
                  {!room.isActive && <Pill tone="amber">Deactivated</Pill>}
                </div>
                {room.notes && <p className="mt-1.5 text-xs text-fg-muted">Note: {room.notes}</p>}
                {room.occupant && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle block">In-House Guest</span>
                      <Link className="font-semibold text-fg hover:underline" href={`/reservations/${room.occupant.reservationId}`}>
                        {room.occupant.guestName}
                      </Link>{' '}
                      <span className="font-mono text-fg-muted">({room.occupant.code})</span>
                      <div className="text-[11px] text-fg-muted">
                        {room.occupant.departsToday ? 'Departs today' : `Staying until ${room.occupant.departure}`}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" href={`/reservations/${room.occupant.reservationId}`} icon={<ExternalLink className="size-3" />}>
                      Folio
                    </Button>
                  </div>
                )}
                {room.arriving && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-info block">Arriving Today</span>
                      <Link className="font-semibold text-fg hover:underline" href={`/reservations/${room.arriving.reservationId}`}>
                        {room.arriving.guestName}
                      </Link>{' '}
                      <span className="font-mono text-fg-muted">({room.arriving.code})</span>
                    </div>
                    <Button size="sm" variant="primary" href="/desk">
                      Check In
                    </Button>
                  </div>
                )}
                {room.block && (
                  <p className="mt-1.5 text-xs">
                    {BLOCK_REASON[room.block.reason]} · {dateRange(room.block.fromDate, room.block.toDate)}
                    {room.block.note && ` — ${room.block.note}`}
                  </p>
                )}
                {room.task && (
                  <p className="mt-1.5 text-xs text-fg-muted">
                    Active Housekeeping Task: <b>{TASK_KIND[room.task.kind]}</b> ({room.task.status})
                  </p>
                )}
              </div>

              {/* Quick-Assign Unassigned Arrival of this Suite Type */}
              {vacant && !room.arriving && matchingArrivals.length > 0 && can('desk:operate') && (
                <section className="grid gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                    Assign Arriving Guest to Room {room.number}
                  </p>
                  <div className="space-y-1.5">
                    {matchingArrivals.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 text-xs">
                        <div>
                          <div className="font-semibold text-fg">{s.guest.name}</div>
                          <div className="text-[11px] text-fg-muted">
                            {s.code} · {s.nights} night(s)
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<UserCheck className="size-3.5" />}
                          loading={assignToBookingMut.isPending}
                          onClick={() => assignToBookingMut.mutate(s.id)}
                        >
                          Assign {room.number}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {vacant && (
                <section className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Set Housekeeping State</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="md"
                      icon={<BrushCleaning className="size-4" />}
                      disabled={room.hkStatus === 'VACANT_DIRTY'}
                      loading={setStatus.isPending && setStatus.variables === 'VACANT_DIRTY'}
                      onClick={() => setStatus.mutate('VACANT_DIRTY')}
                    >
                      Dirty
                    </Button>
                    <Button
                      size="md"
                      icon={<CircleCheck className="size-4" />}
                      disabled={room.hkStatus === 'VACANT_CLEAN'}
                      loading={setStatus.isPending && setStatus.variables === 'VACANT_CLEAN'}
                      onClick={() => setStatus.mutate('VACANT_CLEAN')}
                    >
                      Clean
                    </Button>
                    {can('rooms:inspect') && (
                      <Button
                        size="md"
                        icon={<CheckCheck className="size-4" />}
                        disabled={room.hkStatus === 'INSPECTED'}
                        loading={setStatus.isPending && setStatus.variables === 'INSPECTED'}
                        onClick={() => setStatus.mutate('INSPECTED')}
                      >
                        Inspected
                      </Button>
                    )}
                  </div>
                </section>
              )}

              {/* Dispatch Housekeeping Task */}
              <section className="grid gap-2.5 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Dispatch Housekeeping / Maintenance Task
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <SelectInput
                    label="Service Type"
                    value={taskForm.kind}
                    onChange={(e) => setTaskForm({ ...taskForm, kind: e.target.value as HkTaskKind })}
                  >
                    {Object.entries(TASK_KIND).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </SelectInput>
                  <SelectInput
                    label="Priority"
                    value={String(taskForm.priority)}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: Number(e.target.value) })}
                  >
                    <option value="0">Standard</option>
                    <option value="1">High Priority</option>
                    <option value="2">VIP / Urgent Arrival</option>
                  </SelectInput>
                </div>
                <TextInput
                  label="Task Instructions / Note"
                  placeholder="e.g. Extra bath towels, baby cot, check shower pressure..."
                  value={taskForm.notes}
                  onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                />
                <Button
                  variant="secondary"
                  icon={<Sparkles className="size-3.5" />}
                  loading={createTaskMut.isPending}
                  onClick={() => createTaskMut.mutate()}
                >
                  Queue Task for Room {room.number}
                </Button>
              </section>

              {can('rooms:manage') && !room.block && (
                <section className="grid gap-3 border-t border-line pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Place Off-Sale Block</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <TextInput
                      label="From"
                      type="date"
                      min={today}
                      value={block.fromDate}
                      onChange={(e) => setBlock({ ...block, fromDate: e.target.value })}
                    />
                    <TextInput
                      label="Until"
                      type="date"
                      min={plus(block.fromDate, 1)}
                      value={block.toDate}
                      onChange={(e) => setBlock({ ...block, toDate: e.target.value })}
                    />
                    <SelectInput
                      label="Reason"
                      value={block.reason}
                      onChange={(e) => setBlock({ ...block, reason: e.target.value })}
                    >
                      {Object.entries(BLOCK_REASON).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </SelectInput>
                    <TextInput
                      label="Note"
                      value={block.note}
                      onChange={(e) => setBlock({ ...block, note: e.target.value })}
                      placeholder="Maintenance detail..."
                    />
                  </div>
                  <Button
                    variant="dark"
                    icon={<Lock className="size-3.5" />}
                    loading={makeBlock.isPending}
                    disabled={block.toDate <= block.fromDate}
                    onClick={() => makeBlock.mutate()}
                  >
                    Block Room {room.number}
                  </Button>
                </section>
              )}
            </>
          ) : (
            /* Edit Physical Room Number & Details Tab */
            <section className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Room Number *"
                  value={editForm.number}
                  onChange={(e) => setEditForm({ ...editForm, number: e.target.value.toUpperCase() })}
                />
                <TextInput
                  label="Floor *"
                  type="number"
                  min={0}
                  max={20}
                  value={String(editForm.floor)}
                  onChange={(e) => setEditForm({ ...editForm, floor: Number(e.target.value) || 1 })}
                />
              </div>
              <SelectInput
                label="Suite Category (Room Type) *"
                value={editForm.roomTypeId}
                onChange={(e) => setEditForm({ ...editForm, roomTypeId: e.target.value })}
              >
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </SelectInput>
              <TextInput
                label="Permanent Room Notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="e.g. Ground floor accessible, sunrise ridge view..."
              />
              <Switch
                label="Room active & open for sale"
                hint="Uncheck to decommission this room from bookable inventory without deleting its history."
                checked={editForm.isActive}
                onChange={(v) => setEditForm({ ...editForm, isActive: v })}
              />
              <Button
                variant="primary"
                loading={updateRoomMut.isPending}
                disabled={!editForm.number.trim() || !editForm.roomTypeId}
                onClick={() => updateRoomMut.mutate()}
              >
                Save Room {editForm.number.trim().toUpperCase()} Settings
              </Button>

              {['OWNER', 'MANAGER'].includes(me.role) && (
                <div className="mt-4 rounded-xl border border-danger/30 bg-danger/[0.04] p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-danger">Delete Physical Room Unit</p>
                  <p className="text-[11.5px] text-fg-muted">
                    Permanently remove Room {room.number} from the hotel rack and decrease bookable inventory for {room.roomType.name}.
                  </p>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-3.5" />}
                    loading={deleteRoomMut.isPending}
                    disabled={!!room.occupant || !!room.arriving}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Permanently delete Room ${room.number}?`,
                          body: 'This removes the room number and adjusts suite inventory.',
                          confirm: `Delete Room ${room.number}`,
                          danger: true,
                        })
                      ) {
                        deleteRoomMut.mutate();
                      }
                    }}
                  >
                    Delete Room {room.number}
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Rack />
    </Suspense>
  );
}
