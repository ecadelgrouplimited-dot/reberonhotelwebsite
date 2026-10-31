'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellOff, Boxes, CheckCheck, CircleCheck, Download, Play, RotateCcw, Search, Sparkles } from 'lucide-react';
import type { HkBoardDTO, HkTaskDTO, HkTaskStatus } from '@reberon/contracts';
import { ApiError, get, patch } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { HkBadge, TASK_KIND } from '@/components/house/hk';

type Filter = 'open' | 'mine' | 'inspect' | 'all';
type LinenItem = { sku: string; name: string; onHand: number; inLaundry: number };

export default function HousekeepingPage() {
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const supervisor = can('rooms:inspect');
  const [filter, setFilter] = useState<Filter>(supervisor ? 'open' : 'mine');
  const [floorFilter, setFloorFilter] = useState<'ALL' | number>('ALL');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['housekeeping'], queryFn: () => get<HkBoardDTO>('/housekeeping'), refetchInterval: 20_000 });
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
    onSuccess: () => { refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const bulkInspect = useMutation({
    mutationFn: async (doneTasks: HkTaskDTO[]) => {
      await Promise.all(doneTasks.map((t) => patch(`/housekeeping/tasks/${t.id}`, { status: 'INSPECTED' })));
    },
    onSuccess: (_, doneTasks) => { toast.success(`Inspected ${doneTasks.length} room(s)`); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not inspect'),
  });

  const tasks = data?.tasks ?? [];
  const staff = data?.staff ?? [];
  const open = (t: HkTaskDTO) => t.status === 'TODO' || t.status === 'IN_PROGRESS';
  const doneTasks = tasks.filter((t) => t.status === 'DONE');
  const priorityArrivals = tasks.filter((t) => t.arrivalToday && !['DONE', 'INSPECTED', 'SKIPPED'].includes(t.status));
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const finished = tasks.filter((t) => ['DONE', 'INSPECTED', 'SKIPPED'].includes(t.status)).length;
  const pct = tasks.length ? Math.round((finished / tasks.length) * 100) : 0;

  const floors = [...new Set(tasks.map((t) => t.room.floor))].sort((a, b) => a - b);
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

  const date = data && new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`));
  const bathTowels = roomLinen.find((i) => i.sku === 'LIN-RM-BATH');

  return (
    <div className="fade-in">
      <PageHeader
        title="Housekeeping Dispatch"
        description={date ? `${date} · Room turnaround queue, staff assignments, and supervisor inspection` : 'Daily room turnaround & inspection'}
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
            {can('inventory:manage') && (
              <Button size="sm" href="/inventory" icon={<Boxes className="size-3.5" />}>Linen Store</Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!shown.length}
              icon={<Download className="size-3.5" />}
              onClick={() =>
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
                )
              }
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
            <span className="text-lg font-bold tabular">{finished}/{tasks.length}</span>
            <span className="text-[11px] text-fg-muted">completed</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilter('open')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', priorityArrivals.length > 0 && 'border-danger/50')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Priority Arrivals</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className={cn('text-lg font-bold tabular', priorityArrivals.length > 0 ? 'text-danger' : 'text-fg')}>{priorityArrivals.length}</span>
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
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'inspect' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
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
              {([
                ['open', 'Active Queue'],
                ['mine', 'My Rooms'],
                ['inspect', `To Inspect (${doneTasks.length})`],
                ['all', `All Today (${tasks.length})`],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={filter === v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', filter === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFloorFilter('ALL')}
                className={cn('rounded-md px-2 py-1 font-medium transition', floorFilter === 'ALL' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
              >
                All Floors
              </button>
              {floors.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFloorFilter(f)}
                  className={cn('rounded-md px-2 py-1 font-medium transition', floorFilter === f ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
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
          <span className="text-[11px] font-medium text-fg-muted">{shown.length} room{shown.length === 1 ? '' : 's'}</span>
        </div>

        {isLoading ? (
          <div className="p-4"><Skeleton className="h-48" /></div>
        ) : !shown.length ? (
          <Empty icon={<Sparkles className="size-4" />} title={filter === 'mine' ? 'No rooms assigned to you' : 'Queue clear'} />
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
                          {t.arrivalToday && !finishedTask && <Pill tone="red" dot>Arrival Today</Pill>}
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
                              <option key={st.id} value={st.id}>{st.name}</option>
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
                        {t.status === 'IN_PROGRESS' && <Pill tone="blue" dot>Cleaning</Pill>}
                        {t.status === 'DONE' && <Pill tone="green">Clean · To Inspect</Pill>}
                        {t.status === 'INSPECTED' && <Pill tone="green"><CheckCheck className="size-3" /> Inspected</Pill>}
                        {t.status === 'SKIPPED' && <Pill>Skipped</Pill>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[14rem] truncate text-fg-muted">
                        {t.notes || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {t.status === 'TODO' && (
                            <Button size="sm" variant="primary" icon={<Play className="size-3" />} loading={busy} onClick={() => setStatus('IN_PROGRESS')}>
                              Start
                            </Button>
                          )}
                          {t.status === 'IN_PROGRESS' && (
                            <Button size="sm" variant="primary" icon={<CircleCheck className="size-3.5" />} loading={busy} onClick={() => setStatus('DONE')}>
                              Mark Clean
                            </Button>
                          )}
                          {t.status === 'DONE' && supervisor && (
                            <Button size="sm" variant="dark" icon={<CheckCheck className="size-3.5" />} loading={busy} onClick={() => setStatus('INSPECTED')}>
                              Inspect
                            </Button>
                          )}
                          {t.status === 'TODO' && t.kind === 'STAYOVER' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<BellOff className="size-3.5" />}
                              title="Do Not Disturb / Skip"
                              onClick={() => act.mutate({ id: t.id, body: { status: 'SKIPPED', notes: 'DND — Guest declined service' } })}
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
    </div>
  );
}
