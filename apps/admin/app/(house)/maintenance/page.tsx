'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlarmClock, BedDouble, CheckCircle2, CircleSlash, Hammer, MapPin, MessageSquarePlus, Pause, Play, Plus, RotateCcw, Search, UserRound, Wrench } from 'lucide-react';
import {
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_CATEGORY_LABEL,
  WORK_ORDER_PRIORITIES,
  type WorkOrderCategory,
  type WorkOrderDTO,
  type WorkOrderListDTO,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateTime } from '@/lib/format';
import { money, toMinorStr } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { useScreenActions } from '@/components/os/screen-actions';

const PRIORITY: Record<WorkOrderPriority, { label: string; bar: string; tone: 'red' | 'amber' | 'neutral' | 'blue' }> = {
  URGENT: { label: 'Urgent', bar: 'bg-rose-500', tone: 'red' },
  HIGH: { label: 'High', bar: 'bg-amber-500', tone: 'amber' },
  NORMAL: { label: 'Normal', bar: 'bg-sky-500', tone: 'blue' },
  LOW: { label: 'Low', bar: 'bg-slate-400', tone: 'neutral' },
};
const STATUS: Record<WorkOrderStatus, { label: string; tone: 'red' | 'amber' | 'neutral' | 'blue' | 'green' }> = {
  OPEN: { label: 'Waiting', tone: 'amber' },
  IN_PROGRESS: { label: 'Being fixed', tone: 'blue' },
  ON_HOLD: { label: 'On hold', tone: 'neutral' },
  DONE: { label: 'Fixed', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const PRIORITY_HINT: Record<WorkOrderPriority, string> = {
  URGENT: 'Guest affected or unsafe — fix within 4 hours',
  HIGH: 'Fix today',
  NORMAL: 'Within 3 days',
  LOW: 'When there is time',
};
type View = 'open' | 'mine' | 'hold' | 'done' | 'all';
const isOpen = (s: WorkOrderStatus) => s === 'OPEN' || s === 'IN_PROGRESS' || s === 'ON_HOLD';
const where = (w: WorkOrderDTO) => (w.room ? `Room ${w.room.number}` : (w.location ?? '—'));
const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

function MaintenanceInner() {
  const me = useMe();
  const can = useCan();
  const manage = can('maintenance:manage');
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [reporting, setReporting] = useState(false);
  const openId = params.get('open');
  const { data, isLoading } = useQuery({ queryKey: ['maintenance'], queryFn: () => get<WorkOrderListDTO>('/maintenance'), refetchInterval: 60_000 });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const byView = all.filter((w) =>
      view === 'open' ? isOpen(w.status) && w.status !== 'ON_HOLD' : view === 'mine' ? isOpen(w.status) && w.assignedToId === me.id : view === 'hold' ? w.status === 'ON_HOLD' : view === 'done' ? !isOpen(w.status) : true,
    );
    const needle = q.trim().toLowerCase();
    return needle ? byView.filter((w) => [w.number, w.title, w.details, where(w), w.assignedToName, w.reportedByName].some((x) => x?.toLowerCase().includes(needle))) : byView;
  }, [data, view, q, me.id]);

  const show = (id: string | null) => router.replace(id ? `/maintenance?open=${id}` : '/maintenance', { scroll: false });

  useScreenActions('Maintenance', [
    { label: 'Report a fault', icon: Plus, key: 'n', onSelect: () => setReporting(true) },
    { kind: 'separator' },
    { label: 'Open jobs', icon: Wrench, key: 'o', onSelect: () => setView('open') },
    { label: 'Jobs for me', icon: UserRound, key: 'm', onSelect: () => setView('mine') },
    { label: 'Fixed', icon: CheckCircle2, onSelect: () => setView('done') },
  ]);

  const c = data?.counts;
  const tiles: { key: View; label: string; value: number | undefined; tone?: string; hint?: string }[] = [
    { key: 'open', label: 'Open', value: c?.open, hint: c?.urgent ? `${c.urgent} urgent` : undefined, tone: c?.urgent ? 'text-rose-600' : undefined },
    { key: 'open', label: 'Overdue', value: c?.overdue, tone: c?.overdue ? 'text-amber-600' : undefined },
    { key: 'mine', label: 'For me', value: c?.mine },
    { key: 'open', label: 'Rooms out of service', value: c?.outOfService },
    { key: 'done', label: 'Fixed this week', value: c?.doneThisWeek, tone: 'text-emerald-600' },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Maintenance"
        description="Report anything broken, follow it until it is fixed. Rooms under repair come off sale and go back to housekeeping when done."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setReporting(true)}>
            Report a fault
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {tiles.map((t) => (
          <button key={t.label} type="button" onClick={() => setView(t.key)} className="card p-3 text-left transition hover:border-fg/30">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{t.label}</p>
            <p className={cn('mt-1 text-[22px] font-semibold tabular-nums', t.tone)}>{t.value ?? '–'}</p>
            {t.hint && <p className="text-[11.5px] text-rose-600">{t.hint}</p>}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              ['open', 'Open'],
              ['mine', `For me${c?.mine ? ` · ${c.mine}` : ''}`],
              ['hold', 'On hold'],
              ['done', 'Fixed & closed'],
              ['all', 'All'],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-semibold', view === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search room, fault, person…" aria-label="Search jobs" className="input h-8 pl-8 text-[12.5px]" />
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !items.length ? (
        <div className="card">
          <Empty
            icon={<Wrench className="size-4" />}
            title={view === 'mine' ? 'No jobs for you right now' : view === 'done' ? 'Nothing fixed in the last 30 days' : 'Nothing broken — or nobody has said so yet'}
            body="Spotted a dripping tap, a dead bulb or a broken lock? Report it so it gets fixed."
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setReporting(true)}>
                Report a fault
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => show(w.id)} className="flex w-full items-stretch gap-3 px-3 py-3 text-left hover:bg-surface-2/60">
                <span className={cn('w-1 shrink-0 rounded-full', isOpen(w.status) ? PRIORITY[w.priority].bar : 'bg-line')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11.5px] text-fg-subtle">{w.number}</span>
                    <span className={cn('truncate text-[13.5px] font-semibold', !isOpen(w.status) && 'text-fg-muted line-through decoration-fg-subtle/40')}>{w.title}</span>
                    {isOpen(w.status) && w.priority !== 'NORMAL' && <Pill tone={PRIORITY[w.priority].tone}>{PRIORITY[w.priority].label}</Pill>}
                    {w.overdue && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-600">
                        <AlarmClock className="size-3" /> overdue
                      </span>
                    )}
                    {w.outOfService && <Pill tone="red">Off sale until {new Date(`${w.outOfService.until}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</Pill>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      {w.room ? <BedDouble className="size-3" /> : <MapPin className="size-3" />} {where(w)}
                    </span>
                    <span>{WORK_ORDER_CATEGORY_LABEL[w.category]}</span>
                    <span>
                      Reported {ago(w.createdAt)} by {w.reportedByName.split(' ')[0]}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end justify-center gap-1">
                  <Pill tone={STATUS[w.status].tone} dot>
                    {STATUS[w.status].label}
                  </Pill>
                  <span className="text-[11.5px] text-fg-subtle">{w.assignedToName ? w.assignedToName : isOpen(w.status) ? 'Not assigned' : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ReportDialog open={reporting} onClose={() => setReporting(false)} list={data} manage={manage} onCreated={(id) => show(id)} />
      {openId && <WorkOrderDialog id={openId} list={data} onClose={() => show(null)} />}
    </div>
  );
}

function ReportDialog({ open, onClose, list, manage, onCreated }: { open: boolean; onClose: () => void; list?: WorkOrderListDTO; manage: boolean; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const blank = { title: '', details: '', category: 'OTHER' as WorkOrderCategory, priority: 'NORMAL' as WorkOrderPriority, inRoom: true, roomId: '', location: '', offSale: false, until: plusDays(kampalaToday(), 1) };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setF(blank);
      setErr({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const m = useMutation({
    mutationFn: () =>
      post<WorkOrderDTO>('/maintenance', {
        title: f.title,
        details: f.details,
        category: f.category,
        priority: f.priority,
        ...(f.inRoom ? { roomId: f.roomId || undefined } : { location: f.location }),
        ...(manage && f.inRoom && f.offSale && f.roomId ? { outOfServiceUntil: f.until } : {}),
      }),
    onSuccess: (w) => {
      toast.success(`${w.number} reported`, { description: w.priority === 'URGENT' ? 'Managers have been alerted.' : 'It is on the maintenance list.' });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      onClose();
      onCreated(w.id);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not report it');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report a fault"
      description="Say what is wrong and where. The right person picks it up from here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={f.title.trim().length < 3 || (f.inRoom ? !f.roomId : f.location.trim().length < 2)} onClick={() => m.mutate()}>
            Report it
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextInput label="What is wrong?" placeholder="e.g. No hot water in the shower" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={err.title} autoFocus />
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-semibold">Where?</span>
          <div className="flex gap-1.5">
            {[
              [true, 'A guest room'],
              [false, 'Somewhere else'],
            ].map(([v, label]) => (
              <button key={String(v)} type="button" onClick={() => setF({ ...f, inRoom: v as boolean })} className={cn('rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold', f.inRoom === v ? 'border-fg bg-fg text-bg' : 'border-line-strong text-fg-muted hover:text-fg')}>
                {label as string}
              </button>
            ))}
          </div>
          {f.inRoom ? (
            <SelectInput aria-label="Room" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
              <option value="">Pick the room…</option>
              {list?.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Room {r.number}
                </option>
              ))}
            </SelectInput>
          ) : (
            <TextInput aria-label="Place" placeholder="e.g. Kitchen, lobby toilets, car park" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} error={err.location} />
          )}
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-semibold">What kind?</span>
          <div className="flex flex-wrap gap-1.5">
            {WORK_ORDER_CATEGORIES.map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, category: k })} className={cn('rounded-full border px-2.5 py-1 text-[12px] font-medium', f.category === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-muted hover:text-fg')}>
                {WORK_ORDER_CATEGORY_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-semibold">How soon?</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {WORK_ORDER_PRIORITIES.slice()
              .reverse()
              .map((p) => (
                <button key={p} type="button" onClick={() => setF({ ...f, priority: p })} className={cn('rounded-lg border p-2 text-left', f.priority === p ? 'border-fg ring-1 ring-fg' : 'border-line hover:border-fg/40')}>
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <span className={cn('size-2 rounded-full', PRIORITY[p].bar)} /> {PRIORITY[p].label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">{PRIORITY_HINT[p]}</span>
                </button>
              ))}
          </div>
        </div>
        <TextArea label="Anything else? (optional)" rows={2} placeholder="What you noticed, what you already tried…" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
        {manage && f.inRoom && f.roomId && (
          <label className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px]">
            <input type="checkbox" checked={f.offSale} onChange={(e) => setF({ ...f, offSale: e.target.checked })} />
            <span className="font-semibold">Take the room off sale until</span>
            <input type="date" className="input h-8 w-40" min={plusDays(kampalaToday(), 1)} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value, offSale: true })} aria-label="Off sale until" />
            <span className="basis-full text-fg-muted">Nobody can book or be given this room until then. It goes back to housekeeping when the job is fixed.</span>
          </label>
        )}
      </div>
    </Dialog>
  );
}

function WorkOrderDialog({ id, list, onClose }: { id: string; list?: WorkOrderListDTO; onClose: () => void }) {
  const me = useMe();
  const can = useCan();
  const manage = can('maintenance:manage');
  const qc = useQueryClient();
  const { data: w } = useQuery({ queryKey: ['work-order', id], queryFn: () => get<WorkOrderDTO>(`/maintenance/${id}`) });
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState<null | 'DONE' | 'ON_HOLD' | 'CANCELLED'>(null);
  const [why, setWhy] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState<'UGX' | 'USD'>('UGX');
  const [until, setUntil] = useState(plusDays(kampalaToday(), 1));

  const refresh = (d: WorkOrderDTO) => {
    qc.setQueryData(['work-order', id], d);
    qc.invalidateQueries({ queryKey: ['maintenance'] });
    qc.invalidateQueries({ queryKey: ['admin-pulse'] });
    qc.invalidateQueries({ queryKey: ['rack'] });
  };
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not save');
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => post<WorkOrderDTO>(`/maintenance/${id}/status`, body),
    onSuccess: (d) => {
      refresh(d);
      setClosing(null);
      setWhy('');
      setCost('');
      toast.success(`${d.number}: ${STATUS[d.status].label.toLowerCase()}`, d.status === 'DONE' && d.room ? { description: `Room ${d.room.number} goes to housekeeping for cleaning.` } : undefined);
    },
    onError: fail,
  });
  const edit = useMutation({ mutationFn: (body: Record<string, unknown>) => patch<WorkOrderDTO>(`/maintenance/${id}`, body), onSuccess: refresh, onError: fail });
  const addNote = useMutation({
    mutationFn: () => post<WorkOrderDTO>(`/maintenance/${id}/notes`, { body: note }),
    onSuccess: (d) => {
      refresh(d);
      setNote('');
    },
    onError: fail,
  });
  const offSale = useMutation({
    mutationFn: () => post<WorkOrderDTO>(`/maintenance/${id}/out-of-service`, { until }),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`Room ${d.room?.number} is off sale`);
    },
    onError: fail,
  });
  const onSale = useMutation({
    mutationFn: () => del<WorkOrderDTO>(`/maintenance/${id}/out-of-service`),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`Room ${d.room?.number} is back in service`, { description: 'Sent to housekeeping for cleaning.' });
    },
    onError: fail,
  });

  const open = w ? isOpen(w.status) : false;
  const assignee = w?.assignedToId === me.id;
  const canWork = manage || assignee;

  return (
    <Dialog open onClose={onClose} drawer size="lg" title={w ? `${w.number} · ${w.title}` : 'Loading…'} description={w ? `${where(w)} · ${WORK_ORDER_CATEGORY_LABEL[w.category]}` : undefined}>
      {!w ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS[w.status].tone} dot>
              {STATUS[w.status].label}
            </Pill>
            <Pill tone={PRIORITY[w.priority].tone}>{PRIORITY[w.priority].label}</Pill>
            {w.overdue && <Pill tone="amber">Overdue</Pill>}
            {w.dueAt && open && <span className="text-[12px] text-fg-muted">Target {dateTime(w.dueAt)}</span>}
          </div>
          {w.details && <p className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-3 text-[13px]">{w.details}</p>}
          {w.status === 'DONE' && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-[13px]">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Fixed {w.completedAt ? dateTime(w.completedAt) : ''}</p>
              {w.resolution && <p className="mt-1">{w.resolution}</p>}
              {w.costMinor && w.currency && <p className="mt-1 text-fg-muted">Cost: {money(w.costMinor, w.currency)}</p>}
            </div>
          )}

          {/* Who and how soon */}
          <div className="grid gap-3 sm:grid-cols-2">
            {manage && open ? (
              <SelectInput label="Assigned to" value={w.assignedToId ?? ''} onChange={(e) => edit.mutate({ assignedToId: e.target.value || null })}>
                <option value="">Nobody yet</option>
                {list?.assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.jobTitle ? ` — ${a.jobTitle}` : ''}
                  </option>
                ))}
              </SelectInput>
            ) : (
              <div className="text-[13px]">
                <p className="text-[12px] font-semibold text-fg-subtle">Assigned to</p>
                <p>{w.assignedToName ?? 'Nobody yet'}</p>
              </div>
            )}
            {manage && open ? (
              <SelectInput label="Priority" value={w.priority} onChange={(e) => edit.mutate({ priority: e.target.value })}>
                {WORK_ORDER_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label} — {PRIORITY_HINT[p]}
                  </option>
                ))}
              </SelectInput>
            ) : (
              <div className="text-[13px]">
                <p className="text-[12px] font-semibold text-fg-subtle">Reported</p>
                <p>
                  {w.reportedByName} · {dateTime(w.createdAt)}
                </p>
              </div>
            )}
          </div>

          {/* Room off sale */}
          {w.room && open && (manage || w.outOfService) && (
            <div className={cn('rounded-xl border p-3 text-[12.5px]', w.outOfService ? 'border-rose-500/30 bg-rose-500/5' : 'border-line')}>
              {w.outOfService ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CircleSlash className="size-4 text-rose-600" />
                  <span className="font-semibold">
                    Room {w.room.number} is off sale until {new Date(`${w.outOfService.until}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                  {manage && (
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                      <input type="date" className="input h-7 w-36 text-[12px]" min={plusDays(kampalaToday(), 1)} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Change off-sale date" />
                      <Button size="sm" variant="secondary" loading={offSale.isPending} onClick={() => offSale.mutate()}>
                        Change date
                      </Button>
                      <Button size="sm" variant="ghost" loading={onSale.isPending} onClick={() => onSale.mutate()}>
                        Back in service
                      </Button>
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <BedDouble className="size-4 text-fg-subtle" />
                  <span>Room {w.room.number} can still be sold.</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span className="text-fg-muted">Off sale until</span>
                    <input type="date" className="input h-7 w-36 text-[12px]" min={plusDays(kampalaToday(), 1)} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Off sale until" />
                    <Button size="sm" variant="danger" loading={offSale.isPending} onClick={() => offSale.mutate()}>
                      Take off sale
                    </Button>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status actions */}
          {(canWork || (w.reportedById === me.id && w.status === 'OPEN')) && (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                {open && canWork && w.status !== 'IN_PROGRESS' && (
                  <Button variant="primary" icon={<Play className="size-3.5" />} loading={act.isPending && !closing} onClick={() => act.mutate({ status: 'IN_PROGRESS' })}>
                    {w.status === 'ON_HOLD' ? 'Resume' : w.assignedToId ? 'Start work' : 'Take it & start'}
                  </Button>
                )}
                {open && canWork && (
                  <Button variant={w.status === 'IN_PROGRESS' ? 'primary' : 'secondary'} icon={<CheckCircle2 className="size-3.5" />} onClick={() => setClosing('DONE')}>
                    Mark fixed
                  </Button>
                )}
                {open && canWork && w.status !== 'ON_HOLD' && (
                  <Button variant="secondary" icon={<Pause className="size-3.5" />} onClick={() => setClosing('ON_HOLD')}>
                    On hold
                  </Button>
                )}
                {open && (manage || (w.reportedById === me.id && w.status === 'OPEN')) && (
                  <Button variant="ghost" onClick={() => setClosing('CANCELLED')}>
                    Cancel job
                  </Button>
                )}
                {!open && manage && (
                  <Button variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={act.isPending} onClick={() => act.mutate({ status: 'OPEN' })}>
                    Reopen
                  </Button>
                )}
              </div>
              {closing && (
                <div className="grid gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3">
                  <TextArea
                    label={closing === 'DONE' ? 'What was done?' : closing === 'ON_HOLD' ? 'Why is it waiting?' : 'Why cancel?'}
                    placeholder={closing === 'DONE' ? 'e.g. Replaced the heater element and tested' : closing === 'ON_HOLD' ? 'e.g. Waiting for a part from Mbale' : 'e.g. Reported twice'}
                    rows={2}
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    autoFocus
                  />
                  {closing === 'DONE' && (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <TextInput label="Cost of parts & labour (optional)" inputMode="decimal" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} />
                      <SelectInput label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as 'UGX' | 'USD')}>
                        <option value="UGX">UGX</option>
                        <option value="USD">USD</option>
                      </SelectInput>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      loading={act.isPending}
                      disabled={!why.trim()}
                      onClick={() => {
                        const minor = cost.trim() ? toMinorStr(cost, currency) : null;
                        if (cost.trim() && !minor) return toast.error('The cost does not look like an amount');
                        act.mutate({ status: closing, note: why, ...(minor ? { costMinor: minor, currency } : {}) });
                      }}
                    >
                      {closing === 'DONE' ? (w.outOfService ? 'Fixed — put the room back' : 'Mark fixed') : closing === 'ON_HOLD' ? 'Put on hold' : 'Cancel the job'}
                    </Button>
                    <Button variant="ghost" onClick={() => setClosing(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">History</p>
            <ol className="grid gap-2.5 border-l border-line pl-4">
              {w.notes?.map((n) => (
                <li key={n.id} className="relative text-[12.5px]">
                  <span className={cn('absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface', n.kind === 'NOTE' ? 'bg-accent' : 'bg-fg-subtle')} />
                  {n.kind === 'NOTE' ? (
                    <div className="rounded-lg bg-surface-2/70 px-3 py-2">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-fg-subtle">
                        {n.authorName} · {ago(n.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-fg-muted">
                      {n.body} <span className="text-[11px] text-fg-subtle">· {ago(n.createdAt)}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) addNote.mutate();
              }}
            >
              <input className="input h-9 flex-1 text-[12.5px]" placeholder="Add a note — parts ordered, guest informed…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Add a note" />
              <Button type="submit" variant="secondary" icon={<MessageSquarePlus className="size-3.5" />} loading={addNote.isPending} disabled={!note.trim()}>
                Add
              </Button>
            </form>
          </section>
          {!manage && !assignee && open && (
            <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
              <Hammer className="size-3.5" /> A maintenance manager assigns and closes jobs; you can follow it here and add notes.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense>
      <MaintenanceInner />
    </Suspense>
  );
}
