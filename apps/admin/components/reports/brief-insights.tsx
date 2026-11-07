'use client';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info, XCircle } from 'lucide-react';
import type { BriefInsightsDTO, FinanceKpisDTO, MoneyByCurrency } from '@reberon/contracts';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Section } from '@/components/ui/bits';
import { ColumnChart } from '@/components/charts/charts';
import { Delta, Kpi, big, fmtDay, mm } from './finance-ui';

export function BriefKpis({ x, tomorrowArrivals, todayIn, todayOut }: { x: BriefInsightsDTO; tomorrowArrivals: number; todayIn: number; todayOut: number }) {
  const t = x.today;
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
      <Kpi label="On the books tonight" value={<>{x.onBooksTonight.rooms} <span className="text-sm font-normal text-fg-muted">/ {x.onBooksTonight.total}</span></>} sub={<><b className="text-fg">{x.onBooksTonight.percent}%</b> · {x.onBooksTonight.inHouse} in · {x.onBooksTonight.arrivingStill} still arriving</>} href="/desk" />
      <Kpi label="Collected today" value={mm(t.collected)} tone={big(t.collected.UGX) > 0n ? 'good' : undefined} sub={<>{t.byRail.reduce((a, r) => a + r.count, 0)} payments · spent {mm(t.expenses)}</>} href="/reports?tab=CASH" />
      <Kpi label="Revenue month to date" value={mm(x.mtd.netRevenue)} delta={<Delta now={big(x.mtd.netRevenue.UGX)} before={big(x.mtdLastMonth.netRevenue.UGX)} label="vs same days last month" />} sub="vs last month" href="/reports" />
      <Kpi label="Occupancy MTD" value={`${x.mtd.occupancy}%`} delta={<Delta kind="pts" now={x.mtd.occupancy} before={x.mtdLastMonth.occupancy} />} sub={<>ADR {mm(x.mtd.adr, { compact: true })}</>} href="/reports?tab=ROOMS" />
      <Kpi label="Owed to the hotel" value={mm(x.receivables.total)} tone={x.receivables.overdueCount ? 'bad' : undefined} sub={x.receivables.overdueCount ? <span className="text-danger">{x.receivables.overdueCount} overdue · {mm(x.receivables.overdue, { compact: true })}</span> : 'nothing overdue'} href="/reports?tab=RECEIVABLES" />
      <Kpi label="Today’s movement" value={<>{todayIn} in <span className="text-sm font-normal text-fg-muted">· {todayOut} out</span></>} sub={<>Tomorrow <b className="text-fg">{tomorrowArrivals}</b> · {t.bookingsMade} booked today{t.cancellations ? ` · ${t.cancellations} cancelled` : ''}</>} />
    </div>
  );
}

export function AttentionList({ items }: { items: BriefInsightsDTO['attention'] }) {
  if (!items.length) return <div className="rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-[13px] text-success">All clear — nothing needs the owner’s attention right now.</div>;
  const ICON = { bad: XCircle, warn: AlertTriangle, info: Info } as const;
  return (
    <Section title={`Needs your attention (${items.length})`} description="Checked live across the desk, rooms, money and guests">
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((a) => {
          const Icon = ICON[a.tone];
          const body = (
            <>
              <Icon className={cn('mt-0.5 size-4 shrink-0', a.tone === 'bad' ? 'text-danger' : a.tone === 'warn' ? 'text-warning' : 'text-info')} aria-hidden />
              <span className="min-w-0 flex-1"><b className="block text-fg">{a.title}</b><span className="text-fg-muted">{a.detail}</span></span>
              {a.href && <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />}
            </>
          );
          const cls = cn('flex gap-2.5 rounded-xl border p-3 text-[12.5px] transition', a.tone === 'bad' ? 'border-danger/30 bg-danger/5' : a.tone === 'warn' ? 'border-warning/30 bg-warning/5' : 'border-line bg-surface-2/40', a.href && 'hover:border-line-strong');
          return <li key={a.title}>{a.href ? <Link href={a.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
        })}
      </ul>
    </Section>
  );
}

export function MtdCompare({ x }: { x: BriefInsightsDTO }) {
  const rows: { label: string; get: (k: FinanceKpisDTO) => MoneyByCurrency | number; kind?: 'pts' | 'n'; invert?: boolean; suffix?: string }[] = [
    { label: 'Net revenue', get: (k) => k.netRevenue },
    { label: 'Rooms', get: (k) => k.roomRevenue },
    { label: 'Food & drink', get: (k) => k.fnbRevenue },
    { label: 'Extras, spa & events', get: (k) => k.otherRevenue },
    { label: 'Cash collected', get: (k) => k.collected },
    { label: 'Expenses', get: (k) => k.expenses, invert: true },
    { label: 'Operating profit', get: (k) => k.gop },
    { label: 'Occupancy', get: (k) => k.occupancy, kind: 'pts', suffix: '%' },
    { label: 'ADR', get: (k) => k.adr },
    { label: 'RevPAR', get: (k) => k.revpar },
    { label: 'Room nights sold', get: (k) => k.roomNightsSold, kind: 'n' },
  ];
  const show = (v: MoneyByCurrency | number, suffix = '') => (typeof v === 'number' ? `${v}${suffix}` : mm(v));
  const num = (v: MoneyByCurrency | number) => (typeof v === 'number' ? v : big(v.UGX));
  return (
    <Section title="Month to date" description={`1–${Number(x.date.slice(8))} ${new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${x.date}T12:00:00Z`))}, against the same days last month and last year`} actions={<Link href="/reports" className="text-xs font-medium text-brand hover:underline">Full reports →</Link>}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead className="text-[10.5px] uppercase tracking-wider text-fg-subtle"><tr><th className="pb-2 text-left font-semibold" /><th className="pb-2 text-right font-semibold">This month</th><th className="pb-2 text-right font-semibold">Last month</th><th className="pb-2 text-right font-semibold" /><th className="pb-2 text-right font-semibold">Last year</th><th className="pb-2 text-right font-semibold" /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const now = r.get(x.mtd), lm = r.get(x.mtdLastMonth), ly = r.get(x.mtdLastYear);
              const k = r.kind === 'pts' ? 'pts' : 'pct';
              return (
                <tr key={r.label}>
                  <td className="py-1.5 font-medium text-fg">{r.label}</td>
                  <td className="py-1.5 text-right font-semibold">{show(now, r.suffix)}</td>
                  <td className="py-1.5 text-right text-fg-muted">{show(lm, r.suffix)}</td>
                  <td className="py-1.5 pl-1 text-right"><Delta kind={k} now={num(now)} before={num(lm)} invert={r.invert} /></td>
                  <td className="py-1.5 text-right text-fg-muted">{show(ly, r.suffix)}</td>
                  <td className="py-1.5 pl-1 text-right"><Delta kind={k} now={num(now)} before={num(ly)} invert={r.invert} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function TodayRails({ x }: { x: BriefInsightsDTO }) {
  const rails = x.today.byRail.filter((r) => r.count || big(r.amount.UGX) || big(r.amount.USD));
  return (
    <div className="mt-3 rounded-xl border border-line px-3.5 py-2.5 text-xs">
      <p className="mb-1.5 font-semibold text-fg-muted">Today by payment rail — rooms, POS and health club, after refunds</p>
      {rails.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular">
          {rails.map((r) => <span key={r.method}>{r.label}: <b>{mm(r.amount)}</b> <span className="text-fg-subtle">({r.count})</span></span>)}
        </div>
      ) : <p className="text-fg-subtle">No money taken yet today.</p>}
      {big(x.today.refunds.UGX) > 0n && <p className="mt-1 text-fg-muted">Refunds paid today: {mm(x.today.refunds)}</p>}
    </div>
  );
}

export function Forecast30({ x }: { x: BriefInsightsDTO }) {
  return (
    <Section title="Next 30 days" description={`${x.forecast30Totals.roomNights} room nights confirmed · ${x.forecast30Totals.occupancy}% average · ${mm(x.forecast30Totals.revenue)} on the books`} actions={<Link href="/calendar" className="text-xs font-medium text-brand hover:underline">Calendar & rates →</Link>}>
      <ColumnChart
        data={x.forecast30.map((d) => ({ date: d.date, count: d.percent }))}
        label="Occupancy"
        max={100}
        format={(n) => `${Math.round(n)}%`}
        endLabel="last"
        caption={<>Confirmed and in-house rooms each night, from {fmtDay(x.date)}</>}
        height={140}
      />
      <p className="mt-2 text-[11.5px] text-fg-muted">Room revenue booked for tonight: <b className="text-fg">{mm(x.today.roomRevenueTonight)}</b> · Deposits held for future stays: <b className="text-fg">{mm(x.receivables.advanceDeposits)}</b> · Busiest night: {(() => { const p = x.forecast30.reduce((a, d) => (d.percent > a.percent ? d : a), x.forecast30[0]!); return p.percent ? `${fmtDay(p.date)} (${p.percent}%, ${money(p.revenueUGX, 'UGX')})` : 'none yet'; })()}</p>
    </Section>
  );
}
