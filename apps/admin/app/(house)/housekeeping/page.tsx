'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BellOff,
  Boxes,
  BrushCleaning,
  CheckCheck,
  CircleCheck,
  Download,
  Edit3,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { HkBoardDTO, HkStatus, HkTaskDTO, HkTaskKind, HkTaskStatus, RackRoomDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { HkBadge, TASK_KIND } from '@/components/house/hk';

type Filter = 'open' | 'mine' | 'inspect' | 'all' | 'rooms';
type LinenItem = { sku: string; name: string; onHand: number; inLaundry: number };

export default function HousekeepingPage() {
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const supervisor = can('rooms:inspect');
  const [filter, setFilter] = useState<Filter>(supervisor ? 'open' : 'mine');
  const [floorFilter, setFloorFilter] = useState<'ALL' | number>('ALL');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [preselectedRoomId, setPreselectedRoomId] = useState<string>('');
  const [editNoteTask, setEditNoteTask] = useState<HkTaskDTO | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['housekeeping'],
    queryFn: () => get<HkBoardDTO>('/housekeeping'),
    refetchInterval: 20_000,
  });
  const { data: rackRoomsFallback = [] } = useQuery({
    queryKey: ['rack'],
    queryFn: () => get<RackRoomDTO[]>('/rack'),
    enabled: !data?.rooms,
  });
  const { data: roomLinen = [] } = useQuery({
    queryKey: ['operations', 'inventory', 'LINEN_ROOM'],
    queryFn: () => get<LinenItem[]>('/operations/inventory?category=LINEN_ROOM'),
    enabled: can('inventory:manage') || supervisor,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['housekeeping'] });
    qc.invalidateQueries({ queryKey: ['rack'] });
    qc.invalidateQueries({ queryKey: ['desk'] });
  };

  const act = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => patch(`/housekeeping/tasks/${id}`, body),
    onSuccess: () => {
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => del(`/housekeeping/tasks/${id}`),
    onSuccess: () => {
      toast.success('Task removed');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove task'),
  });

  const syncQueueMut = useMutation({
    mutationFn: () => post('/housekeeping/sync', {}),
    onSuccess: () => {
      toast.success('Housekeeping queue synchronized with live room states');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not sync queue'),
  });

  const quickRoomStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HkStatus }) => patch(`/rack/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Room status updated');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update room status'),
  });

  const bulkInspect = useMutation({
    mutationFn: async (doneTasks: HkTaskDTO[]) => {
      await Promise.all(doneTasks.map((t) => patch(`/housekeeping/tasks/${t.id}`, { status: 'INSPECTED' })));
    },
    onSuccess: (_, doneTasks) => {
      toast.success(`Inspected ${doneTasks.length} room(s)`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not inspect'),
  });

  const tasks = data?.tasks ?? [];
  const allRooms = data?.rooms ?? rackRoomsFallback;
  const staff = data?.staff ?? [];
  const open = (t: HkTaskDTO) => t.status === 'TODO' || t.status === 'IN_PROGRESS';
  const doneTasks = tasks.filter((t) => t.status === 'DONE');
  const priorityArrivals = tasks.filter((t) => t.arrivalToday && !['DONE', 'INSPECTED', 'SKIPPED'].includes(t.status));
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const finished = tasks.filter((t) => ['DONE', 'INSPECTED', 'SKIPPED'].includes(t.status)).length;
  const pct = tasks.length ? Math.round((finished / tasks.length) * 100) : 100;

  const floors = [...new Set([...tasks.map((t) => t.room.floor), ...allRooms.map((r) => r.floor)])].sort((a, b) => a - b);
  const term = q.trim().toLowerCase();

  const shown = tasks.filter((t) => {
    if (filter === 'open' && !(open(t) || (supervisor && t.status === 'DONE'))) return false;
    if (filter === 'mine' && !((open(t) || t.status === 'DONE') && (!t.assignee || t.assignee.id === me.id))) return false;
    if (filter === 'inspect' && t.status !== 'DONE') return false;
    if (floorFilter !== 'ALL' && t.room.floor !== floorFilter) return false;
    if (term) {
      const hay = `${t.room.number} ${t.room.roomTypeName} ${t.assignee?.name ?? ''} ${t.notes ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const filteredRooms = allRooms.filter((r) => {
    if (floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
    if (term) {
      const hay = `${r.number} ${r.roomType.name} ${r.occupant?.guestName ?? ''} ${r.arriving?.guestName ?? ''} ${r.notes ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const date =
    data &&
    new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${data.date}T12:00:00Z`),
    );
  const bathTowels = roomLinen.find((i) => i.sku === 'LIN-RM-BATH');

  return (
    <div className="fade-in">
      <PageHeader
        title="Housekeeping Dispatch"
        description={
          date
            ? `${date} · Room turnaround queue, staff assignments, supervisor inspection & full room status`
            : 'Daily room turnaround & inspection'
        }
        actions={
          <>
            {supervisor && doneTasks.length > 0 && (
              <Button
                size="sm"
                variant="primary"
                icon={<CheckCheck className="size-3.5" />}
                loading={bulkInspect.isPending}
                onClick={() => bulkInspect.mutate(doneTasks)}
              >
                Inspect All Clean ({doneTasks.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                setPreselectedRoomId(allRooms[0]?.id ?? '');
                setCreateOpen(true);
              }}
            >
              Dispatch Task
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="size-3.5" />}
              loading={syncQueueMut.isPending}
              onClick={() => syncQueueMut.mutate()}
              title="Scan all dirty & occupied rooms and generate missing daily tasks"
            >
              Sync Daily Queue
            </Button>
            {can('inventory:manage') && (
              <Button size="sm" variant="secondary" href="/inventory" icon={<Boxes className="size-3.5" />}>
                Linen Store
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={filter === 'rooms' ? !filteredRooms.length : !shown.length}
              icon={<Download className="size-3.5" />}
              onClick={() => {
                if (filter === 'rooms') {
                  exportToCsv(
                    `reberon-housekeeping-rooms-${data?.date ?? 'today'}.csv`,
                    ['Room #', 'Floor', 'Room Type', 'Status', 'Occupant', 'Arriving Today', 'Active Task', 'Notes'],
                    filteredRooms.map((r) => [
                      r.number,
                      r.floor,
                      r.roomType.name,
                      r.hkStatus,
                      r.occupant?.guestName ?? '',
                      r.arriving?.guestName ?? '',
                      r.task ? `${r.task.kind} (${r.task.status})` : '',
                      r.notes ?? '',
                    ]),
                  );
                } else {
                  exportToCsv(
                    `reberon-housekeeping-${data?.date ?? 'today'}.csv`,
                    ['Room Number', 'Floor', 'Room Type', 'Room Status', 'Task Kind', 'Task Status', 'Assignee', 'Arrival Today', 'Notes'],
                    shown.map((t) => [
                      t.room.number,
                      t.room.floor,
                      t.room.roomTypeName,
                      t.room.hkStatus,
                      t.kind,
                      t.status,
                      t.assignee?.name ?? 'Unassigned',
                      t.arrivalToday ? 'Yes' : 'No',
                      t.notes ?? '',
                    ]),
                  );
                }
              }}
            >
              Export CSV
            </Button>
          </>
        }
      />

      {/* Compact 5-KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="card p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <span>Turnaround</span>
            <span className="font-mono text-fg">{pct}%</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular">
              {finished}/{tasks.length}
            </span>
            <span className="text-[11px] text-fg-muted">completed</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilter('open')}
          className={cn(
            'card flex flex-col items-start justify-between p-3 text-left transition',
            priorityArrivals.length > 0 && 'border-danger/50',
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Priority Arrivals</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className={cn('text-lg font-bold tabular', priorityArrivals.length > 0 ? 'text-danger' : 'text-fg')}>
              {priorityArrivals.length}
            </span>
            <span className="text-[11px] text-fg-muted">guest due today</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilter('open')}
          className="card flex flex-col items-start justify-between p-3 text-left transition hover:border-line-strong"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Cleaning Now</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular text-info">{inProgressCount}</span>
            <span className="text-[11px] text-fg-muted">in progress</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilter('inspect')}
          className={cn(
            'card flex flex-col items-start justify-between p-3 text-left transition',
            filter === 'inspect' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">To Inspect</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular text-success">{doneTasks.length}</span>
            <span className="text-[11px] text-fg-muted">awaiting check</span>
          </span>
        </button>

        <Link href="/inventory" className="card flex flex-col items-start justify-between p-3 text-left transition hover:border-line-strong">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Room Bath Towels</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular">{bathTowels ? bathTowels.onHand : '—'}</span>
            <span className="text-[11px] text-fg-muted">{bathTowels ? `${bathTowels.inLaundry} in laundry` : 'room linen'}</span>
          </span>
        </Link>
      </div>

      {/* Main Dispatch Table Card */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]" role="tablist">
              {(
                [
                  ['open', 'Active Queue'],
                  ['mine', 'My Rooms'],
                  ['inspect', `To Inspect (${doneTasks.length})`],
                  ['all', `All Tasks (${tasks.length})`],
                  ['rooms', `All Rooms Status (${allRooms.length})`],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={filter === v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition',
                    filter === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFloorFilter('ALL')}
                className={cn(
                  'rounded-md px-2 py-1 font-medium transition',
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
                    'rounded-md px-2 py-1 font-medium transition',
                    floorFilter === f ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  F{f}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-48 pl-8 text-xs"
                placeholder="Room #, type, staff..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <span className="text-[11px] font-medium text-fg-muted">
            {filter === 'rooms' ? `${filteredRooms.length} rooms` : `${shown.length} task${shown.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-48" />
          </div>
        ) : filter === 'rooms' ? (
          /* ALL ROOMS STATUS VIEW IN HOUSEKEEPING */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Room Type</th>
                  <th className="px-3 py-2">Cleanliness / Status</th>
                  <th className="px-3 py-2">Guest / Arrival</th>
                  <th className="px-3 py-2">Today&apos;s Task</th>
                  <th className="px-3 py-2 text-right">Quick Housekeeping Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredRooms.map((r) => {
                  const vacant = !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(r.hkStatus);
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-sm font-bold tabular">
                          {r.number}
                        </span>
                        <span className="ml-1.5 text-[11px] text-fg-subtle">F{r.floor}</span>
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.roomType.name}</td>
                      <td className="px-3 py-2.5">
                        <HkBadge status={r.hkStatus} />
                      </td>
                      <td className="px-3 py-2.5">
                        {r.occupant && (
                          <span>
                            In-House: <b>{r.occupant.guestName}</b>{' '}
                            <span className="text-[11px] text-fg-muted">
                              ({r.occupant.departsToday ? 'Out today' : `→ ${r.occupant.departure}`})
                            </span>
                          </span>
                        )}
                        {r.arriving && (
                          <span className="text-info font-medium">↘ Arriving: {r.arriving.guestName}</span>
                        )}
                        {!r.occupant && !r.arriving && <span className="text-fg-subtle">Vacant</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.task ? (
                          <Pill tone={r.task.status === 'IN_PROGRESS' ? 'blue' : r.task.status === 'DONE' || r.task.status === 'INSPECTED' ? 'green' : 'amber'}>
                            {TASK_KIND[r.task.kind]} · {r.task.status}
                          </Pill>
                        ) : (
                          <span className="text-fg-subtle">No task queued</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {vacant && (
                            <>
                              {r.hkStatus !== 'VACANT_DIRTY' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<BrushCleaning className="size-3" />}
                                  onClick={() => quickRoomStatus.mutate({ id: r.id, status: 'VACANT_DIRTY' })}
                                >
                                  Mark Dirty
                                </Button>
                              )}
                              {r.hkStatus !== 'VACANT_CLEAN' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<CircleCheck className="size-3" />}
                                  onClick={() => quickRoomStatus.mutate({ id: r.id, status: 'VACANT_CLEAN' })}
                                >
                                  Mark Clean
                                </Button>
                              )}
                              {supervisor && r.hkStatus !== 'INSPECTED' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<CheckCheck className="size-3" />}
                                  onClick={() => quickRoomStatus.mutate({ id: r.id, status: 'INSPECTED' })}
                                >
                                  Inspect
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Plus className="size-3" />}
                            onClick={() => {
                              setPreselectedRoomId(r.id);
                              setCreateOpen(true);
                            }}
                          >
                            Queue Task
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !shown.length ? (
          <div className="p-6 text-center space-y-3">
            <Empty
              icon={<Sparkles className="size-4" />}
              title={filter === 'mine' ? 'No rooms assigned to you' : 'Active task queue is clear'}
            />
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFilter('rooms')}>
                View All {allRooms.length} Rooms Status
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setPreselectedRoomId(allRooms[0]?.id ?? '');
                  setCreateOpen(true);
                }}
              >
                Dispatch Cleaning Task
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Room Type</th>
                  <th className="px-3 py-2">Service Type</th>
                  <th className="px-3 py-2">Room Status</th>
                  <th className="px-3 py-2">Assignee</th>
                  <th className="px-3 py-2">Task Status</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((t) => {
                  const finishedTask = ['DONE', 'INSPECTED', 'SKIPPED'].includes(t.status);
                  const busy = act.isPending && act.variables?.id === t.id;
                  const setStatus = (status: HkTaskStatus) => act.mutate({ id: t.id, body: { status } });

                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        'hover:bg-surface-2/40 transition-colors',
                        t.status === 'IN_PROGRESS' && 'bg-info/[0.04]',
                        finishedTask && 'opacity-70',
                      )}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-sm font-bold tabular">
                          {t.room.number}
                        </span>
                        <span className="ml-1.5 text-[11px] text-fg-subtle">F{t.room.floor}</span>
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        {t.room.roomTypeName}
                        {t.guestFirstName && t.kind === 'STAYOVER' && (
                          <span className="block text-[11px] text-fg-muted">Guest: {t.guestFirstName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{TASK_KIND[t.kind] ?? t.kind}</span>
                          {t.priority >= 2 && !finishedTask && <Pill tone="amber">Urgent</Pill>}
                          {t.arrivalToday && !finishedTask && (
                            <Pill tone="red" dot>
                              Arrival Today
                            </Pill>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <HkBadge status={t.room.hkStatus} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {supervisor && staff.length > 0 ? (
                          <select
                            aria-label={`Assign Room ${t.room.number}`}
                            value={t.assignee?.id ?? ''}
                            onChange={(e) => act.mutate({ id: t.id, body: { assigneeId: e.target.value || null } })}
                            className="h-7 rounded-md border border-line bg-surface px-2 text-xs font-medium text-fg focus:border-fg focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {staff.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                          </select>
                        ) : t.assignee ? (
                          <span className="font-medium">{t.assignee.id === me.id ? 'You' : t.assignee.name}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => act.mutate({ id: t.id, body: { assigneeId: me.id } })}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            + Assign me
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {t.status === 'TODO' && <Pill tone="amber">Pending</Pill>}
                        {t.status === 'IN_PROGRESS' && (
                          <Pill tone="blue" dot>
                            Cleaning
                          </Pill>
                        )}
                        {t.status === 'DONE' && <Pill tone="green">Clean · To Inspect</Pill>}
                        {t.status === 'INSPECTED' && (
                          <Pill tone="green">
                            <CheckCheck className="size-3" /> Inspected
                          </Pill>
                        )}
                        {t.status === 'SKIPPED' && <Pill>Skipped</Pill>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[14rem] truncate text-fg-muted">
                        <button
                          type="button"
                          onClick={() => {
                            setEditNoteTask(t);
                            setNoteDraft(t.notes ?? '');
                          }}
                          className="inline-flex items-center gap-1 hover:text-fg hover:underline"
                          title="Edit task note"
                        >
                          <span className="truncate max-w-[12rem]">{t.notes || 'Add note...'}</span>
                          <Edit3 className="size-3 shrink-0 opacity-60" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {t.status === 'TODO' && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<Play className="size-3" />}
                              loading={busy}
                              onClick={() => setStatus('IN_PROGRESS')}
                            >
                              Start
                            </Button>
                          )}
                          {t.status === 'IN_PROGRESS' && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<CircleCheck className="size-3.5" />}
                              loading={busy}
                              onClick={() => setStatus('DONE')}
                            >
                              Mark Clean
                            </Button>
                          )}
                          {t.status === 'DONE' && supervisor && (
                            <Button
                              size="sm"
                              variant="dark"
                              icon={<CheckCheck className="size-3.5" />}
                              loading={busy}
                              onClick={() => setStatus('INSPECTED')}
                            >
                              Inspect
                            </Button>
                          )}
                          {t.status === 'TODO' && t.kind === 'STAYOVER' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<BellOff className="size-3.5" />}
                              title="Do Not Disturb / Skip"
                              onClick={() =>
                                act.mutate({ id: t.id, body: { status: 'SKIPPED', notes: 'DND — Guest declined service' } })
                              }
                            >
                              DND
                            </Button>
                          )}
                          {(t.status === 'DONE' || t.status === 'IN_PROGRESS' || t.status === 'SKIPPED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RotateCcw className="size-3.5" />}
                              title="Undo status"
                              onClick={() => setStatus(t.status === 'DONE' ? 'IN_PROGRESS' : 'TODO')}
                            />
                          )}
                          {supervisor && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 className="size-3.5 text-fg-subtle hover:text-danger" />}
                              title="Remove task"
                              onClick={() => deleteTaskMut.mutate(t.id)}
                            />
                          )}
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

      {/* Dispatch New Task Modal */}
      <DispatchTaskDialog
        open={createOpen}
        rooms={allRooms}
        staff={staff}
        defaultRoomId={preselectedRoomId}
        onClose={() => setCreateOpen(false)}
        onDone={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      {/* Edit Task Note Modal */}
      <Dialog
        open={!!editNoteTask}
        onClose={() => setEditNoteTask(null)}
        title={editNoteTask ? `Room ${editNoteNoteTitle(editNoteTask)} · Housekeeping Note` : 'Task Note'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditNoteTask(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={act.isPending}
              onClick={() => {
                if (!editNoteTask) return;
                act.mutate(
                  { id: editNoteTask.id, body: { notes: noteDraft.trim() || null } },
                  { onSuccess: () => setEditNoteTask(null) },
                );
              }}
            >
              Save Note
            </Button>
          </>
        }
      >
        <TextInput
          label="Instructions / Inspection Note"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="e.g. Guest requested extra pillows, minibar restocked..."
        />
      </Dialog>
    </div>
  );
}

function editNoteNoteTitle(t: HkTaskDTO) {
  return `${t.room.number} (${TASK_KIND[t.kind] ?? t.kind})`;
}

function DispatchTaskDialog({
  open,
  rooms,
  staff,
  defaultRoomId,
  onClose,
  onDone,
}: {
  open: boolean;
  rooms: RackRoomDTO[];
  staff: { id: string; name: string }[];
  defaultRoomId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [kind, setKind] = useState<HkTaskKind>('DEPARTURE');
  const [priority, setPriority] = useState(1);
  const [assigneeId, setAssigneeId] = useState('');
  const [notes, setNotes] = useState('');

  if (open && !roomId && rooms[0]) {
    setRoomId(defaultRoomId || rooms[0].id);
  }

  const m = useMutation({
    mutationFn: () =>
      post('/housekeeping/tasks', {
        roomId: roomId || defaultRoomId || rooms[0]?.id,
        kind,
        priority,
        assigneeId: assigneeId || null,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Housekeeping task dispatched');
      setNotes('');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not dispatch task'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Dispatch Housekeeping Task"
      description="Assign a turnaround clean, stayover service, deep clean, or maintenance check to any room."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} loading={m.isPending} onClick={() => m.mutate()}>
            Dispatch Task
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5">
        <SelectInput
          label="Room Number *"
          value={roomId || defaultRoomId || rooms[0]?.id || ''}
          onChange={(e) => setRoomId(e.target.value)}
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              Room {r.number} · Floor {r.floor} ({r.roomType.name} — {r.hkStatus.replace('_', ' ')})
            </option>
          ))}
        </SelectInput>

        <div className="grid grid-cols-2 gap-3">
          <SelectInput label="Service Type *" value={kind} onChange={(e) => setKind(e.target.value as HkTaskKind)}>
            {Object.entries(TASK_KIND).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectInput>

          <SelectInput label="Priority" value={String(priority)} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value="0">Standard</option>
            <option value="1">High Priority</option>
            <option value="2">VIP / Urgent Arrival</option>
          </SelectInput>
        </div>

        <SelectInput label="Assign Staff (optional)" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Unassigned (Open Queue)</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectInput>

        <TextInput
          label="Instructions / Notes"
          placeholder="e.g. Guest arriving at 14:00, prepare fresh Arabica welcome tray..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
