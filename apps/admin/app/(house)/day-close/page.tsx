'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Download, ExternalLink, LockKeyhole, MoonStar, Printer, RotateCcw, UserX,
} from 'lucide-react';
import type { DayCheckDTO, DayCloseDTO, DayCloseHistoryDTO, DayFiguresDTO, MoneyByCurrency } from '@reberon/contracts';
import { ApiError, del, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { downloadDoc, printDoc } from '@/lib/documents';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { TextArea } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { useScreenActions } from '@/components/os/screen-actions';

const plus = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const longDate = (d: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const shortDate = (d: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date(iso));
const mm = (x: MoneyByCurrency) => {
  const parts = [BigInt(x.UGX) !== 0n ? money(x.UGX, 'UGX') : null, BigInt(x.USD) !== 0n ? money(x.USD, 'USD') : null].filter(Boolean);
  return parts.length ? parts.join(' + ') : money('0', 'UGX');
};

/**
 * Close the day (night audit). The checks a hotel settles before it sleeps, the day's
 * figures, and one sign-off — then a printed end-of-day report for the file.
 */
export default function DayClosePage() {
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const params = useSearchParams();
  const date = params.get('date') ?? '';
  const [notes, setNotes] = useState('');
  const [anyway, setAnyway] = useState(false);

  const q = useQuery({ queryKey: ['day-close', date], queryFn: () => get<DayCloseDTO>(`/day-close${date ? `?date=${date}` : ''}`), refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ['day-close-history'], queryFn: () => get<DayCloseHistoryDTO>('/day-close/history?days=14') });
  const d = q.data;
  const current = d?.date ?? date;
  const go = (to: string) => router.replace(to === d?.today ? '/day-close' : `/day-close?date=${to}`);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['day-close'] });
    void qc.invalidateQueries({ queryKey: ['day-close-history'] });
    void qc.invalidateQueries({ queryKey: ['admin-pulse'] });
  };
  const err = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong');

  const close = useMutation({
    mutationFn: () => post<DayCloseDTO>('/day-close', { date: current, notes: notes.trim() || undefined, override: anyway || undefined }),
    onSuccess: (res) => {
      toast.success(`${shortDate(res.date)} is closed`, { description: 'The end-of-day report is ready to print.' });
      setNotes('');
      setAnyway(false);
      qc.setQueryData(['day-close', date], res);
      refresh();
    },
    onError: err,
  });
  const reopen = useMutation({ mutationFn: () => del<DayCloseDTO>(`/day-close/${current}`), onSuccess: () => { toast.success('The day is open again'); refresh(); }, onError: err });
  const noShow = useMutation({
    mutationFn: (id: string) => post(`/desk/reservations/${id}/no-show`, { note: 'Marked at close of day' }),
    onSuccess: () => { toast.success('Marked as a no-show — the room is back on sale'); refresh(); },
    onError: err,
  });

  const view = d?.closed ?? (d ? { checks: d.checks, figures: d.figures } : null);
  const must = (d?.checks ?? []).filter((c) => c.level === 'must');
  const should = (d?.checks ?? []).filter((c) => c.level === 'should');
  const ready = must.length === 0;
  const printUrl = `/v1/admin/day-close/${current}/print`;

  useScreenActions('Close the day', [
    ...(d && !d.closed ? [{ label: `Close ${shortDate(current)}`, icon: LockKeyhole, key: 'c', disabled: !ready && !anyway, onSelect: () => close.mutate() }] : []),
    { label: 'Print the report', icon: Printer, key: 'p', onSelect: () => void printDoc(printUrl) },
    { label: 'Download PDF', icon: Download, onSelect: () => void downloadDoc(`${printUrl}?purpose=pdf`, `End-of-day-${current}`) },
    { kind: 'separator' },
    { label: 'Previous day', icon: ChevronLeft, key: 'j', onSelect: () => current && go(plus(current, -1)) },
    { label: 'Next day', icon: ChevronRight, key: 'k', disabled: !d || current >= d.today, onSelect: () => current && go(plus(current, 1)) },
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <MoonStar className="size-5 text-accent" /> Close the day
          </span>
        }
        description="Settle what must not wait until tomorrow, look over the day's figures, then sign the day off. The report keeps everything as it stood."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-line bg-surface">
              <button type="button" aria-label="Previous day" className="grid size-9 place-items-center rounded-l-xl hover:bg-surface-2" onClick={() => current && go(plus(current, -1))}>
                <ChevronLeft className="size-4" />
              </button>
              <label className="flex items-center gap-1.5 px-2 text-[13px] font-semibold">
                <CalendarDays className="size-4 text-fg-muted" />
                <input type="date" value={current} max={d?.today} onChange={(e) => e.target.value && go(e.target.value)} className="bg-transparent outline-none" aria-label="Business date" />
              </label>
              <button type="button" aria-label="Next day" disabled={!d || current >= d.today} className="grid size-9 place-items-center rounded-r-xl hover:bg-surface-2 disabled:opacity-40" onClick={() => current && go(plus(current, 1))}>
                <ChevronRight className="size-4" />
              </button>
            </div>
            <Button icon={<Printer className="size-4" />} onClick={() => void printDoc(printUrl)}>Print</Button>
            <Button icon={<Download className="size-4" />} onClick={() => void downloadDoc(`${printUrl}?purpose=pdf`, `End-of-day-${current}`)}>PDF</Button>
          </div>
        }
      />

      {d && d.unclosed.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--warning)_9%,var(--surface))] px-4 py-3 text-[13px]">
          <AlertTriangle className="size-4 text-warning" />
          <span className="flex-1">
            {d.unclosed.length === 1 ? `${longDate(d.unclosed[0]!)} was never closed.` : `${d.unclosed.length} earlier days were never closed.`}
          </span>
          {d.unclosed.slice(0, 4).map((u) => (
            <Button key={u} size="sm" onClick={() => go(u)}>Close {shortDate(u)}</Button>
          ))}
        </div>
      )}

      {!d ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          {/* Checks */}
          <section className="space-y-3">
            <StatusBanner d={d} mustCount={must.length} shouldCount={should.length} />
            {(view?.checks ?? []).map((c) => (
              <CheckCard key={c.key} check={c} live={!d.closed} onNoShow={async (id, name) => {
                if (await confirm({ title: `Mark ${name} as a no-show?`, body: 'The room goes back on sale. Anything already paid is kept as the no-show charge.', confirm: 'Mark no-show', danger: true })) noShow.mutate(id);
              }} busy={noShow.isPending} />
            ))}
          </section>

          {/* Figures + sign-off */}
          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            {view && <Figures f={view.figures} />}
            {d.closed ? (
              <div className="card space-y-2 p-4 text-[13px]">
                <p className="flex items-center gap-2 font-semibold text-success">
                  <Check className="size-4" /> Closed by {d.closed.closedByName} at {clock(d.closed.closedAt)}
                </p>
                {d.closed.overridden && <Pill tone="amber">Closed with items still open</Pill>}
                {d.closed.notes && <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-fg-muted">{d.closed.notes}</p>}
                {can('records:delete') && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={reopen.isPending} onClick={async () => {
                    if (await confirm({ title: `Reopen ${shortDate(current)}?`, body: 'The sign-off is removed (the audit log keeps who closed and reopened it). Close it again when you are done.', confirm: 'Reopen the day' })) reopen.mutate();
                  }}>Reopen this day</Button>
                )}
              </div>
            ) : (
              <div className="card space-y-3 p-4">
                <p className="text-[13px] font-semibold">Sign off {shortDate(current)}</p>
                <TextArea
                  label="Notes for the morning"
                  placeholder={ready ? 'Anything the next shift should know (optional)' : 'Why the day closes with items open (required)'}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                {!ready && (
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} className="mt-0.5" />
                    <span>Close anyway — I have explained the open items in the notes.</span>
                  </label>
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<LockKeyhole className="size-4" />}
                  loading={close.isPending}
                  disabled={(!ready && (!anyway || notes.trim().length < 5)) || current > d.today}
                  onClick={() => close.mutate()}
                >
                  Close {shortDate(current)}
                </Button>
                <p className="text-[11.5px] text-fg-subtle">
                  {ready ? 'Everything that must be settled is settled.' : `${must.length} check${must.length > 1 ? 's' : ''} must be settled first — or explained.`} Closing keeps the figures and checks as they stand now.
                </p>
              </div>
            )}
            <HistoryStrip days={history.data?.days ?? []} current={current} onPick={go} />
          </aside>
        </div>
      )}
    </div>
  );
}

function StatusBanner({ d, mustCount, shouldCount }: { d: DayCloseDTO; mustCount: number; shouldCount: number }) {
  if (d.closed)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,var(--surface))] px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-success text-white"><LockKeyhole className="size-4" /></span>
        <div className="text-[13px]">
          <p className="font-semibold">{longDate(d.date)} is closed</p>
          <p className="text-fg-muted">Below is how the day stood when it was signed off.</p>
        </div>
      </div>
    );
  const allClear = mustCount === 0 && shouldCount === 0;
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', mustCount ? 'border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,var(--surface))]' : 'border-line bg-surface')}>
      <span className={cn('grid size-9 place-items-center rounded-xl text-white', mustCount ? 'bg-danger' : allClear ? 'bg-success' : 'bg-warning')}>
        {mustCount ? <CircleAlert className="size-4" /> : <Check className="size-4" />}
      </span>
      <div className="text-[13px]">
        <p className="font-semibold">{longDate(d.date)}{d.date === d.today ? ' · today' : ''}</p>
        <p className="text-fg-muted">
          {mustCount ? `${mustCount} thing${mustCount > 1 ? 's' : ''} to settle before closing` : allClear ? 'All clear — ready to close' : `Ready to close · ${shouldCount} thing${shouldCount > 1 ? 's' : ''} worth a look`}
        </p>
      </div>
    </div>
  );
}

const ICON: Record<DayCheckDTO['level'], { box: string; Icon: typeof Check }> = {
  must: { box: 'bg-danger text-white', Icon: CircleAlert },
  should: { box: 'bg-warning text-white', Icon: AlertTriangle },
  ok: { box: 'bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success', Icon: Check },
};

function CheckCard({ check, live, onNoShow, busy }: { check: DayCheckDTO; live: boolean; onNoShow: (id: string, name: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(check.level === 'must');
  const { box, Icon } = ICON[check.level];
  const items = open ? check.items : [];
  return (
    <div className={cn('card overflow-hidden', check.level === 'ok' && 'opacity-80')}>
      <button type="button" onClick={() => check.items.length && setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', box)}><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{check.title}</span>
          {check.level !== 'ok' && <span className="block text-[12px] text-fg-muted">{check.hint}</span>}
        </span>
        {check.items.length > 0 && <ChevronRight className={cn('size-4 text-fg-subtle transition-transform', open && 'rotate-90')} />}
      </button>
      {items.length > 0 && (
        <ul className="border-t border-line">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{i.label}</span>
                <span className="block truncate text-[11.5px] text-fg-muted">{i.detail}</span>
              </span>
              {live && check.key === 'arrivals' && i.reservationId && (
                <>
                  <Button size="sm" href="/desk?tab=arrivals" icon={<ArrowRight className="size-3.5" />}>Check in</Button>
                  <Button size="sm" variant="ghost" className="text-danger" icon={<UserX className="size-3.5" />} disabled={busy} onClick={() => onNoShow(i.reservationId!, i.label)}>No-show</Button>
                </>
              )}
              {live && check.key === 'departures' && <Button size="sm" href="/desk?tab=departures" icon={<ArrowRight className="size-3.5" />}>Check out</Button>}
              {live && check.key === 'openBills' && <Button size="sm" href="/pos" icon={<ArrowRight className="size-3.5" />}>Settle</Button>}
              <Link href={i.href} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={`Open ${i.label}`} title="Open">
                <ExternalLink className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figures({ f }: { f: DayFiguresDTO }) {
  const rows = useMemo(
    () => [
      { label: 'Revenue', value: mm(f.grossRevenue), sub: `Rooms ${mm(f.roomRevenue)} · Food & drink ${mm(f.fnbRevenue)}` },
      { label: 'Money in', value: mm(f.collected), sub: BigInt(f.refunds.UGX) || BigInt(f.refunds.USD) ? `after ${mm(f.refunds)} refunded` : `${f.rails.reduce((n, r) => n + r.count, 0)} payments` },
      { label: 'Occupancy', value: `${Math.round(f.occupancy * 100)}%`, sub: `${f.roomNightsSold} of ${f.roomNightsAvailable} rooms · ADR ${mm(f.adr)}` },
      { label: 'Guests', value: `${f.inHouse} in house`, sub: `${f.arrivals} arrived · ${f.departures} left · ${f.noShows} no-show` },
    ],
    [f],
  );
  return (
    <div className="card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">The day in figures</p>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[11.5px] text-fg-muted">{r.label}</dt>
            <dd className="text-[15px] font-semibold tabular">{r.value}</dd>
            <dd className="text-[11px] leading-snug text-fg-subtle">{r.sub}</dd>
          </div>
        ))}
      </dl>
      {f.rails.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          {f.rails.map((r) => (
            <div key={r.method} className="flex items-center justify-between py-0.5 text-[12.5px]">
              <span className="text-fg-muted">{r.label} <span className="text-fg-subtle">× {r.count}</span></span>
              <span className="font-semibold tabular">{mm(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {(BigInt(f.expenses.UGX) > 0n || BigInt(f.expenses.USD) > 0n) && <p className="mt-2 text-[12px] text-fg-muted">Expenses paid: {mm(f.expenses)}</p>}
    </div>
  );
}

function HistoryStrip({ days, current, onPick }: { days: DayCloseHistoryDTO['days']; current: string; onPick: (d: string) => void }) {
  if (!days.length) return null;
  return (
    <div className="card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Last two weeks</p>
      <div className="grid grid-cols-7 gap-1.5">
        {[...days].reverse().map((x) => (
          <button
            key={x.date}
            type="button"
            onClick={() => onPick(x.date)}
            title={`${shortDate(x.date)} — ${x.closed ? `closed by ${x.closed.closedByName}` : 'not closed'}`}
            className={cn(
              'flex flex-col items-center rounded-lg border py-1 text-[11px] transition',
              x.date === current ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-line hover:bg-surface-2',
              x.closed ? (x.closed.overridden ? 'bg-[color-mix(in_oklab,var(--warning)_10%,transparent)]' : 'bg-[color-mix(in_oklab,var(--success)_10%,transparent)]') : '',
            )}
          >
            <span className="text-fg-subtle">{new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${x.date}T00:00:00Z`))}</span>
            <span className="font-semibold">{Number(x.date.slice(8))}</span>
            <span className={cn('mt-0.5 size-1.5 rounded-full', x.closed ? (x.closed.overridden ? 'bg-warning' : 'bg-success') : 'bg-line-strong')} />
          </button>
        ))}
      </div>
    </div>
  );
}
