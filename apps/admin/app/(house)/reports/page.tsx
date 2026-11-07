'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Info, Plus, Printer, TrendingDown, XCircle } from 'lucide-react';
import type { FinanceReportDTO, MoneyByCurrency } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import { TextInput } from '@/components/ui/field';
import { BarList, ColumnChart } from '@/components/charts/charts';
import { ExpensesPanel } from '@/components/reports/expenses-panel';
import { DataTable, Delta, Kpi, RevenueTrend, ShareBars, big, fmtDay, fmtMonth, mm } from '@/components/reports/finance-ui';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthStart = (d: string) => `${d.slice(0, 8)}01`;
const lastMonth = () => {
  const end = plus(monthStart(today()), -1);
  return [monthStart(end), end] as const;
};

const PERIODS = {
  today: { label: 'Today', range: () => [today(), today()] },
  yesterday: { label: 'Yesterday', range: () => [plus(today(), -1), plus(today(), -1)] },
  month: { label: 'Month to date', range: () => [monthStart(today()), today()] },
  lastMonth: { label: 'Last month', range: lastMonth },
  last30: { label: 'Last 30 days', range: () => [plus(today(), -29), today()] },
  last90: { label: 'Last 90 days', range: () => [plus(today(), -89), today()] },
  ytd: { label: 'Year to date', range: () => [`${today().slice(0, 4)}-01-01`, today()] },
} as const;
type Period = keyof typeof PERIODS | 'custom';

const TABS = [
  { id: 'OVERVIEW', label: 'Overview & P&L' },
  { id: 'ROOMS', label: 'Rooms' },
  { id: 'OUTLETS', label: 'Departments & POS' },
  { id: 'CASH', label: 'Cash & rails' },
  { id: 'RECEIVABLES', label: 'Owed & deposits' },
  { id: 'ADJUSTMENTS', label: 'Discounts & refunds' },
  { id: 'EXPENSES', label: 'Expenses' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const SOURCE: Record<string, string> = { DIRECT: 'Website', WHATSAPP: 'WhatsApp', WALK_IN: 'Walk-in', PHONE: 'Phone', PORTAL: 'Portal' };
const ADJ: Record<string, { label: string; tone: 'red' | 'amber' | 'green' | 'neutral' | 'blue' }> = {
  DISCOUNT: { label: 'Discount', tone: 'amber' },
  CREDIT: { label: 'Credit', tone: 'amber' },
  WRITE_OFF: { label: 'Write-off', tone: 'red' },
  REFUND: { label: 'Refund', tone: 'neutral' },
  CANCELLATION_FEE: { label: 'Cancellation fee', tone: 'green' },
  NO_SHOW: { label: 'No-show charge', tone: 'green' },
};

function Reports() {
  const can = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'OVERVIEW') as Tab;
  const setTab = (t: Tab) => router.replace(`/reports?tab=${t}`, { scroll: false });
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState({ from: plus(today(), -30), to: today() });
  const [compare, setCompare] = useState<'prev' | 'yoy'>('prev');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : PERIODS[period].range();
  const canManageExpenses = can('expenses:manage') || can('requisitions:approve');

  const { data: r, isLoading, isFetching, error } = useQuery({
    queryKey: ['finance', from, to, compare],
    queryFn: () => get<FinanceReportDTO>(`/reports/finance?from=${from}&to=${to}&compare=${compare}`),
    enabled: from <= to,
    placeholderData: (prev) => prev,
  });

  const csv = () => {
    if (!r) return;
    const k = r.kpis;
    const c = r.compare;
    const u = (m?: MoneyByCurrency) => (m ? money(m.UGX, 'UGX') : '');
    const d = (m?: MoneyByCurrency) => (m && big(m.USD) ? money(m.USD, 'USD') : '');
    const rows: (string | number | undefined)[][] = [
      ['Section', 'Item', 'UGX', 'USD', `Comparison (${r.compareFrom} – ${r.compareTo}) UGX`, 'Notes'],
      ['Summary', 'Period', `${r.from} to ${r.to}`, '', '', ''],
      ...([
        ['Gross revenue', k.grossRevenue, c.grossRevenue],
        ['Net revenue', k.netRevenue, c.netRevenue],
        ['Room revenue', k.roomRevenue, c.roomRevenue],
        ['Food & drink', k.fnbRevenue, c.fnbRevenue],
        ['Other revenue', k.otherRevenue, c.otherRevenue],
        ['Expenses', k.expenses, c.expenses],
        ['Gross operating profit', k.gop, c.gop],
        ['Collected (net of refunds)', k.collected, c.collected],
        ['ADR', k.adr, c.adr],
        ['RevPAR', k.revpar, c.revpar],
        ['TRevPAR', k.trevpar, c.trevpar],
      ] as const).map(([l, a, b]) => ['Summary', l, u(a), d(a), u(b), '']),
      ['Summary', 'Occupancy', `${k.occupancy}%`, '', `${c.occupancy}%`, `${k.roomNightsSold}/${k.roomNightsAvailable} room nights`],
      ...(r.house.departments ?? []).map((x) => ['Department', x.label, u(x.revenue), d(x.revenue), '', x.secondaryMetric]),
      ...r.roomTypes.map((x) => ['Room type', x.name, u(x.revenue), d(x.revenue), '', `${x.roomNightsSold} nights · ${x.occupancy}% · ADR ${u(x.adr)}`]),
      ...r.ratePlans.map((x) => ['Rate plan', x.name, u(x.revenue), d(x.revenue), '', `${x.roomNights} nights · ${x.bookings} bookings`]),
      ...r.channels.map((x) => ['Channel', SOURCE[x.source] ?? x.source, u(x.revenue), d(x.revenue), '', `${x.roomNights} nights · ${x.share}%`]),
      ...r.cash.rails.map((x) => ['Cash rail', x.label, u(x.net), d(x.net), '', `in ${u(x.inflow)} · refunds ${u(x.refunds)} · out ${u(x.outflow)} · ${x.inCount} payments`]),
      ...r.receivables.debtors.map((x) => ['Owed', `${x.code} ${x.name}`, x.currency === 'UGX' ? money(x.balanceMinor, 'UGX') : '', x.currency === 'USD' ? money(x.balanceMinor, 'USD') : '', '', `${x.status} · ${x.daysPastDeparture} days after departure`]),
      ...r.adjustments.lines.map((x) => ['Adjustment', `${x.date} ${x.code} ${x.guest}`, x.currency === 'UGX' ? money(x.amountMinor, 'UGX') : '', x.currency === 'USD' ? money(x.amountMinor, 'USD') : '', '', x.description]),
      ...r.daily.map((x) => ['Daily', x.date, money(big(x.roomUGX) + big(x.fnbUGX) + big(x.otherUGX), 'UGX'), '', '', `collected ${money(x.collectedUGX, 'UGX')} · spent ${money(x.expensesUGX, 'UGX')} · ${x.occupancy}%`]),
    ];
    exportToCsv(`reberon-finance-${r.from}-to-${r.to}.csv`, rows[0] as string[], rows.slice(1).map((row) => row.map((v) => v ?? '')));
  };

  const vs = compare === 'prev' ? 'vs previous period' : 'vs last year';

  return (
    <div className="fade-in">
      <PageHeader
        title="Financial reports"
        description={r ? `${fmtDay(r.from)} – ${fmtDay(r.to)} ${r.from.slice(0, 4)} · compared with ${fmtDay(r.compareFrom)} – ${fmtDay(r.compareTo)} ${r.compareFrom.slice(0, 4)} · UGX and USD never mixed` : 'Revenue, profit, cash, receivables and costs across the hotel'}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            {canManageExpenses && <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setTab('EXPENSES'); setExpenseOpen(true); }}>Record expense</Button>}
            <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>Print</Button>
            <Button size="sm" icon={<Download className="size-3.5" />} disabled={!r} onClick={csv}>Export CSV</Button>
          </div>
        }
      />

      <div className="no-print mb-4 grid gap-3 border-b border-line pb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-xs">
            {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} className={cn('rounded-md px-2.5 py-1 font-medium transition', period === k ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>{PERIODS[k].label}</button>
            ))}
            <button type="button" onClick={() => setPeriod('custom')} className={cn('rounded-md px-2.5 py-1 font-medium transition', period === 'custom' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>Custom</button>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <TextInput type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <span className="text-xs text-fg-muted">to</span>
              <TextInput type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-fg-muted">Compare with</span>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              {([['prev', 'Previous period'], ['yoy', 'Last year']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setCompare(v)} className={cn('rounded-md px-2.5 py-1 font-medium', compare === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-xs font-semibold">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn('rounded-lg border px-3 py-1.5 transition', tab === t.id ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-muted hover:text-fg')}>
              {t.label}
              {t.id === 'RECEIVABLES' && r && r.receivables.debtors.length > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] text-white">{r.receivables.debtors.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger">{(error as Error).message}</p>}
      {isLoading || !r ? <Skeleton className="h-96" /> : (
        <div className={cn('grid gap-5 transition-opacity', isFetching && 'opacity-60')}>
          {tab === 'OVERVIEW' && <Overview r={r} vs={vs} goTab={setTab} />}
          {tab === 'ROOMS' && <Rooms r={r} vs={vs} />}
          {tab === 'OUTLETS' && <Outlets r={r} />}
          {tab === 'CASH' && <Cash r={r} vs={vs} />}
          {tab === 'RECEIVABLES' && <Receivables r={r} />}
          {tab === 'ADJUSTMENTS' && <Adjustments r={r} />}
          {tab === 'EXPENSES' && <ExpensesPanel from={from} to={to} r={r.house} canManageExpenses={canManageExpenses} modalOpen={expenseOpen} setModalOpen={setExpenseOpen} />}
          <p className="text-[11px] text-fg-subtle">{r.house.currencyNote} Generated {new Date(r.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Kampala' })} (Kampala).</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function Overview({ r, vs, goTab }: { r: FinanceReportDTO; vs: string; goTab: (t: Tab) => void }) {
  const k = r.kpis;
  const c = r.compare;
  const net = big(k.netRevenue.UGX);
  const margin = net ? Math.round((Number(big(k.gop.UGX)) / Number(net)) * 1000) / 10 : 0;
  const fs = r.house.financialSummary;
  const pctOf = (v?: string) => (net ? `${Math.round((Number(big(v)) / Number(net)) * 1000) / 10}%` : '—');
  const deps = r.house.departments ?? [];
  const pl: { label: string; now?: MoneyByCurrency; before?: MoneyByCurrency; strong?: boolean; indent?: boolean; sign?: string; invert?: boolean }[] = [
    { label: 'Rooms', now: k.roomRevenue, before: c.roomRevenue, indent: true },
    { label: 'Food & drink', now: k.fnbRevenue, before: c.fnbRevenue, indent: true },
    { label: 'Extras, spa, events & fees', now: k.otherRevenue, before: c.otherRevenue, indent: true },
    { label: 'Gross revenue', now: k.grossRevenue, before: c.grossRevenue, strong: true },
    { label: 'Less discounts, credits & write-offs', now: fs?.allowances, sign: '−', indent: true, invert: true },
    { label: 'Net revenue', now: k.netRevenue, before: c.netRevenue, strong: true },
    { label: 'Cost of sales (food & drink stock)', now: fs?.costOfSales, sign: '−', indent: true, invert: true },
    { label: 'Gross profit', now: fs?.grossProfit, strong: true },
    { label: 'Operating expenses', now: fs?.operatingExpenses, sign: '−', indent: true, invert: true },
    { label: 'Gross operating profit (GOP)', now: k.gop, before: c.gop, strong: true },
  ];
  const ICON = { good: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info } as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Net revenue" value={mm(k.netRevenue)} delta={<Delta now={big(k.netRevenue.UGX)} before={big(c.netRevenue.UGX)} label={vs} />} sub={vs} />
        <Kpi label="Operating profit (GOP)" value={mm(k.gop)} tone={big(k.gop.UGX) < 0n ? 'bad' : undefined} delta={<Delta now={big(k.gop.UGX)} before={big(c.gop.UGX)} />} sub={`${margin}% margin`} />
        <Kpi label="Cash collected" value={mm(k.collected)} delta={<Delta now={big(k.collected.UGX)} before={big(c.collected.UGX)} />} sub="after refunds" href="/reports?tab=CASH" />
        <Kpi label="Owed to the hotel" value={mm(r.receivables.total)} tone={big(r.receivables.total.UGX) > 0n ? 'bad' : 'good'} sub={`${r.receivables.debtors.length} open balance${r.receivables.debtors.length === 1 ? '' : 's'} today`} href="/reports?tab=RECEIVABLES" />
        <Kpi label="Occupancy" value={`${k.occupancy}%`} delta={<Delta kind="pts" now={k.occupancy} before={c.occupancy} />} sub={`${k.roomNightsSold}/${k.roomNightsAvailable} nights`} />
        <Kpi label="ADR" value={mm(k.adr)} delta={<Delta now={big(k.adr.UGX)} before={big(c.adr.UGX)} />} sub="per night sold" />
        <Kpi label="RevPAR" value={mm(k.revpar)} delta={<Delta now={big(k.revpar.UGX)} before={big(c.revpar.UGX)} />} sub="rooms ÷ available" />
        <Kpi label="TRevPAR" value={mm(k.trevpar)} delta={<Delta now={big(k.trevpar.UGX)} before={big(c.trevpar.UGX)} />} sub="all revenue ÷ available" />
      </div>

      {r.insights.length > 0 && (
        <Section title="What the numbers say" description="Read automatically from this period">
          <ul className="grid gap-2 sm:grid-cols-2">
            {r.insights.map((i) => {
              const Icon = ICON[i.tone];
              return (
                <li key={i.title} className={cn('flex gap-2.5 rounded-xl border p-3 text-[12.5px]', i.tone === 'bad' ? 'border-danger/30 bg-danger/5' : i.tone === 'warn' ? 'border-warning/30 bg-warning/5' : i.tone === 'good' ? 'border-success/25 bg-success/5' : 'border-line bg-surface-2/40')}>
                  <Icon className={cn('mt-0.5 size-4 shrink-0', i.tone === 'bad' ? 'text-danger' : i.tone === 'warn' ? 'text-warning' : i.tone === 'good' ? 'text-success' : 'text-info')} aria-hidden />
                  <span><b className="block text-fg">{i.title}</b><span className="text-fg-muted">{i.detail}</span></span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Revenue by day" description="Rooms on the night slept, food & drink and extras on the day sold (UGX)">
        <RevenueTrend daily={r.daily} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Section title="Profit & loss" description={`USALI-style summary · ${vs}`}>
          <table className="w-full text-xs tabular">
            <thead className="text-[10.5px] uppercase tracking-wider text-fg-subtle"><tr><th className="pb-2 text-left font-semibold" /><th className="pb-2 text-right font-semibold">This period</th><th className="pb-2 text-right font-semibold">% of net</th><th className="pb-2 text-right font-semibold">Compared</th><th className="pb-2 text-right font-semibold">Change</th></tr></thead>
            <tbody>
              {pl.map((row) => (
                <tr key={row.label} className={cn(row.strong ? 'border-t border-line-strong font-semibold text-fg' : 'text-fg-muted')}>
                  <td className={cn('py-1.5', row.indent && 'pl-3')}>{row.label}</td>
                  <td className="py-1.5 text-right">{row.sign && big(row.now?.UGX) ? row.sign : ''}{mm(row.now)}</td>
                  <td className="py-1.5 text-right">{pctOf(row.now?.UGX)}</td>
                  <td className="py-1.5 text-right">{row.before ? mm(row.before) : ''}</td>
                  <td className="py-1.5 text-right">{row.before && <Delta now={big(row.now?.UGX)} before={big(row.before.UGX)} invert={row.invert} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.tax && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] text-fg-muted">{r.tax.label} at {r.tax.ratePercent}% {r.tax.inclusive ? 'contained in' : 'on top of'} net revenue: <b className="text-fg">{mm(r.tax.vat)}</b> — set aside for URA.</p>}
        </Section>

        <Section title="Where revenue came from" description="Share of gross revenue by department">
          <ShareBars rows={deps.filter((d) => big(d.revenue.UGX) || big(d.revenue.USD)).sort((a, b) => Number(big(b.revenue.UGX) - big(a.revenue.UGX))).map((d) => ({ label: d.label, value: Number(big(d.revenue.UGX)), display: <>{mm(d.revenue)} <span className="text-fg-subtle">({d.sharePercent}%)</span></>, sub: d.secondaryMetric }))} />
          <button type="button" className="no-print mt-3 text-[12px] font-medium text-fg-muted hover:text-fg" onClick={() => goTab('OUTLETS')}>Department detail →</button>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="On the books" description="Confirmed from today forward">
          <ul className="grid gap-3 text-xs">
            {r.onTheBooks.months.map((m) => (
              <li key={m.month}>
                <div className="flex justify-between"><span className="font-medium">{fmtMonth(m.month)}</span><span className="tabular">{m.occupancy}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, m.occupancy)}%`, minWidth: m.roomNights ? 4 : 0, background: 'var(--series)' }} /></div>
                <p className="mt-0.5 text-[11px] text-fg-subtle">{m.roomNights} of {m.roomNightsAvailable} nights · {mm(m.revenue)} · {m.bookings} booking{m.bookings === 1 ? '' : 's'}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2 text-[11.5px] text-fg-muted">Picked up in the last 7 days: <b className="text-fg">{r.onTheBooks.pickup7d.bookings}</b> booking(s), {r.onTheBooks.pickup7d.roomNights} nights, {mm(r.onTheBooks.pickup7d.revenue)}</p>
        </Section>
        <Section title="Best guests" description="By room revenue in the period">
          <DataTable head={['Guest', 'Nights', 'Revenue']} rows={r.topGuests.slice(0, 6).map((g) => [<Link key={g.contactId} href={`/guests/${g.contactId}`} className="font-medium hover:underline">{g.name}</Link>, g.nights, mm(g.revenue)])} />
        </Section>
        <Section title="Guest sentiment" description="Feedback left in the period">
          <BarList data={[{ label: 'Good', value: r.house.feedback.GOOD }, { label: 'OK', value: r.house.feedback.OK }, { label: 'Not good', value: r.house.feedback.BAD }]} />
          <p className="mt-3 text-[11.5px] text-fg-muted">{r.house.totals.returningGuests} returning guest{r.house.totals.returningGuests === 1 ? '' : 's'} arrived · {k.bookings} bookings made · {k.cancellations} cancelled · {k.noShows} no-show</p>
        </Section>
      </div>
    </>
  );
}

/* ───────────────────────── Rooms ───────────────────────── */

function Rooms({ r, vs }: { r: FinanceReportDTO; vs: string }) {
  const k = r.kpis;
  const c = r.compare;
  const tot = r.roomTypes.reduce((a, x) => ({ n: a.n + x.roomNightsSold, av: a.av + x.roomNightsAvailable }), { n: 0, av: 0 });
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Room revenue" value={mm(k.roomRevenue)} delta={<Delta now={big(k.roomRevenue.UGX)} before={big(c.roomRevenue.UGX)} />} />
        <Kpi label="Occupancy" value={`${k.occupancy}%`} delta={<Delta kind="pts" now={k.occupancy} before={c.occupancy} />} />
        <Kpi label="ADR" value={mm(k.adr)} delta={<Delta now={big(k.adr.UGX)} before={big(c.adr.UGX)} />} />
        <Kpi label="RevPAR" value={mm(k.revpar)} delta={<Delta now={big(k.revpar.UGX)} before={big(c.revpar.UGX)} />} />
        <Kpi label="Average stay" value={`${k.averageStay} nights`} delta={<Delta now={k.averageStay} before={c.averageStay} />} />
        <Kpi label="Cancellations" value={k.cancellations} delta={<Delta now={k.cancellations} before={c.cancellations} invert />} sub={`${k.noShows} no-show`} />
      </div>
      <Section title="Daily occupancy" description={`Average ${k.occupancy}% · ${vs}: ${c.occupancy}%`}>
        <ColumnChart data={r.house.days.map((d) => ({ date: d.date, count: d.occupancy }))} label="Occupancy" max={100} format={(n) => `${Math.round(n)}%`} endLabel="last" caption={<>Rooms sold ÷ rooms available each night</>} height={170} />
      </Section>
      <Section title="By room type" description="Nights, occupancy and yield per category">
        <DataTable
          head={['Room type', 'Rooms', 'Nights sold', 'Occupancy', 'Revenue', 'ADR', 'RevPAR']}
          rows={r.roomTypes.map((x) => [<b key={x.id}>{x.name}</b>, x.rooms, `${x.roomNightsSold} / ${x.roomNightsAvailable}`, `${x.occupancy}%`, mm(x.revenue), mm(x.adr), mm(x.revpar)])}
          foot={['All rooms', r.roomTypes.reduce((a, x) => a + x.rooms, 0), `${tot.n} / ${tot.av}`, `${k.occupancy}%`, mm(k.roomRevenue), mm(k.adr), mm(k.revpar)]}
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="By channel" description="Where the nights came from">
          <DataTable head={['Channel', 'Bookings', 'Nights', 'Share', 'Revenue']} rows={r.channels.map((x) => [SOURCE[x.source] ?? x.source, x.bookings, x.roomNights, `${x.share}%`, mm(x.revenue)])} />
        </Section>
        <Section title="By rate plan" description="Which rates are selling">
          <DataTable head={['Rate', 'Bookings', 'Nights', 'ADR', 'Revenue']} rows={r.ratePlans.map((x) => [x.name, x.bookings, x.roomNights, mm(x.adr), mm(x.revenue)])} />
        </Section>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Day of week" description="Average occupancy by night">
          <BarList data={r.dayOfWeek.map((d) => ({ label: d.day, value: d.occupancy }))} />
        </Section>
        <Section title="Length of stay" description="Stays arriving in the period">
          <BarList data={r.lengthOfStay.map((d) => ({ label: d.bucket, value: d.bookings }))} />
        </Section>
        <Section title="Booking lead time" description="Days between booking and arrival">
          <BarList data={r.house.leadTime.map((d) => ({ label: d.bucket, value: d.bookings }))} />
        </Section>
      </div>
    </>
  );
}

/* ───────────────────────── Departments & POS ───────────────────────── */

function Outlets({ r }: { r: FinanceReportDTO }) {
  const deps = r.house.departments ?? [];
  const peak = Math.max(1, ...r.pos.byHour.map((h) => h.orders));
  return (
    <>
      <Section title="Revenue by department" description="Every revenue centre in the hotel">
        <DataTable head={['Department', 'Activity', 'Orders', 'Share', 'Revenue']} rows={deps.map((d) => [<b key={d.department}>{d.label}</b>, <span key="m" className="text-fg-muted">{d.secondaryMetric}</span>, d.ordersCount, `${d.sharePercent}%`, mm(d.revenue)])} foot={['Gross revenue', '', '', '100%', mm(r.kpis.grossRevenue)]} />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="POS outlets" description="Bills settled in the period">
          <DataTable head={['Outlet', 'Bills', 'Avg bill', 'To a room', 'Discounts', 'Revenue']} rows={r.pos.outlets.map((o) => [<span key={o.id}><b>{o.name}</b> <span className="text-fg-subtle">{o.type.toLowerCase()}</span></span>, o.orders, mm(o.avgCheck), o.toRoomFolio, mm(o.discounts), mm(o.revenue)])} empty="No POS bills settled in this period." />
          {big(r.pos.deskFnb.UGX) + big(r.pos.deskFnb.USD) > 0n && <p className="mt-3 text-[11.5px] text-fg-muted">Plus <b className="text-fg">{mm(r.pos.deskFnb)}</b> of food & drink typed onto room bills at the desk.</p>}
        </Section>
        <Section title="Best sellers" description="By quantity sold">
          <DataTable head={['Item', 'Qty', 'Revenue']} rows={r.pos.topItems.map((i) => [i.name, i.quantity, mm(i.revenue)])} empty="No items sold." />
        </Section>
      </div>
      <Section title="Busiest hours" description="POS bills settled by hour of day (Kampala)">
        <div className="flex h-32 items-end gap-[2px]">
          {r.pos.byHour.map((h) => (
            <div key={h.hour} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${String(h.hour).padStart(2, '0')}:00 · ${h.orders} bills · ${money(h.revenueUGX, 'UGX')}`}>
              <span className="w-full max-w-5 rounded-t-[4px]" style={{ height: `${(h.orders / peak) * 100}%`, minHeight: h.orders ? 3 : 0, background: 'var(--series)' }} />
              {h.hour % 3 === 0 && <span className="absolute -bottom-4 text-[10px] text-fg-subtle">{String(h.hour).padStart(2, '0')}</span>}
            </div>
          ))}
        </div>
        <div className="h-4" />
      </Section>
    </>
  );
}

/* ───────────────────────── Cash ───────────────────────── */

function Cash({ r, vs }: { r: FinanceReportDTO; vs: string }) {
  const t = r.cash.totals;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Money in" value={mm(t.inflow)} sub={`${t.transactions} payments`} />
        <Kpi label="Refunds out" value={mm(t.refunds)} />
        <Kpi label="Expenses paid" value={mm(t.outflow)} />
        <Kpi label="Net cash movement" value={mm(t.net)} tone={big(t.net.UGX) < 0n ? 'bad' : 'good'} delta={<Delta now={big(r.kpis.collected.UGX)} before={big(r.compare.collected.UGX)} label={`collected ${vs}`} />} sub={`collected ${vs}`} />
        <Kpi label="Missing references" value={t.missingRefs} tone={t.missingRefs ? 'bad' : 'good'} sub="digital payments without a transaction ID" />
      </div>
      <Section title="By payment rail" description="What each till, phone and account should show for the period: money in, less refunds, less expenses paid from it">
        <DataTable
          head={['Rail', 'Payments', 'Rooms', 'POS', 'Health club', 'Money in', 'Refunds', 'Expenses', 'Net', 'Check']}
          rows={r.cash.rails.map((x) => [
            <b key={x.method}>{x.label}</b>, x.inCount, mm(x.bySource.rooms, { compact: true }), mm(x.bySource.pos, { compact: true }), mm(x.bySource.healthClub, { compact: true }), mm(x.inflow), mm(x.refunds), mm(x.outflow), <b key="n">{mm(x.net)}</b>,
            x.missingRefs ? <Pill key="c" tone="red" dot>{x.missingRefs} no ref</Pill> : x.method === 'UNKNOWN' && x.inCount ? <Pill key="c" tone="amber" dot>method not recorded</Pill> : x.inCount || big(x.outflow.UGX) ? <Pill key="c" tone="green" dot>references complete</Pill> : <span key="c" className="text-fg-subtle">—</span>,
          ])}
          foot={['Total', t.transactions, '', '', '', mm(t.inflow), mm(t.refunds), mm(t.outflow), mm(t.net), '']}
        />
        <p className="mt-3 text-[11.5px] text-fg-muted">Room-folio POS bills are not counted here — that money arrives when the guest settles the room bill. Count the cash drawer against the Cash line; match MoMo, card and bank lines to their statements.</p>
      </Section>
      <Section title="Cash collected by day" description="All rails, after refunds (UGX)">
        <ColumnChart data={r.daily.map((d) => ({ date: d.date, count: Number(d.collectedUGX) }))} label="Collected" endLabel="last" format={(n) => money(Math.round(n), 'UGX')} caption={<>Collected · <b className="text-fg">{mm(r.kpis.collected)}</b> in the period</>} height={160} />
      </Section>
    </>
  );
}

/* ───────────────────────── Receivables ───────────────────────── */

function Receivables({ r }: { r: FinanceReportDTO }) {
  const rec = r.receivables;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Owed to the hotel" value={mm(rec.total)} tone={big(rec.total.UGX) ? 'bad' : 'good'} sub={`as of ${fmtDay(rec.asOf)}`} />
        <Kpi label="Overdue (after departure)" value={mm(rec.buckets.filter((b) => b.key.startsWith('d')).reduce<MoneyByCurrency>((a, b) => ({ UGX: String(big(a.UGX) + big(b.amount.UGX)), USD: String(big(a.USD) + big(b.amount.USD)) }), { UGX: '0', USD: '0' }))} />
        <Kpi label="Deposits held" value={mm(rec.advanceDeposits)} sub={`${rec.advanceDepositCount} future stay${rec.advanceDepositCount === 1 ? '' : 's'} — owed back if cancelled`} />
        <Kpi label="Open balances" value={rec.debtors.length} />
      </div>
      <Section title="Ageing" description="Balances still owed, by how long since the guest left">
        <div className="grid gap-2 sm:grid-cols-5">
          {rec.buckets.map((b) => (
            <div key={b.key} className={cn('rounded-xl border p-3', b.key.startsWith('d') && b.count ? 'border-danger/30 bg-danger/5' : 'border-line')}>
              <p className="text-[11px] text-fg-muted">{b.label}</p>
              <p className="mt-1 font-semibold tabular">{mm(b.amount)}</p>
              <p className="text-[11px] text-fg-subtle">{b.count} booking{b.count === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Who owes what" description="Oldest first — open the booking to take payment or write off">
        <DataTable
          head={['Guest', 'Booking', 'Stay', 'Status', 'Total', 'Paid', 'Balance', 'Days overdue']}
          rows={rec.debtors.map((d) => [
            <span key={d.id}><b>{d.name}</b>{d.phone && <span className="block text-[11px] text-fg-subtle">{d.phone}</span>}</span>,
            <Link key="c" href={`/reservations/${d.id}`} className="font-mono hover:underline">{d.code}</Link>,
            `${fmtDay(d.arrival)} – ${fmtDay(d.departure)}`,
            d.status.replace('_', ' ').toLowerCase(),
            money(d.totalMinor, d.currency),
            money(d.paidMinor, d.currency),
            <b key="b" className="text-danger">{money(d.balanceMinor, d.currency)}</b>,
            d.daysPastDeparture || '—',
          ])}
          empty="Nobody owes the hotel money. 🎉"
        />
      </Section>
    </>
  );
}

/* ───────────────────────── Adjustments ───────────────────────── */

function Adjustments({ r }: { r: FinanceReportDTO }) {
  const a = r.adjustments;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Discounts" value={mm(a.discounts)} />
        <Kpi label="Goodwill credits" value={mm(a.credits)} />
        <Kpi label="Written off" value={mm(a.writeOffs)} tone={big(a.writeOffs.UGX) ? 'bad' : undefined} />
        <Kpi label="POS discounts" value={mm(a.posDiscounts)} />
        <Kpi label="Refunds paid" value={mm(a.refunds)} />
        <Kpi label="Cancellation fees kept" value={mm(a.cancellationFees)} tone="good" />
        <Kpi label="No-show charges kept" value={mm(a.noShowRevenue)} tone="good" />
      </div>
      <Section title="Every adjustment" description="Who got money off, back, or was charged a fee — each line links to its booking">
        <DataTable
          head={['Date', 'Type', 'Booking', 'Guest', 'Reason', 'Amount']}
          rows={a.lines.map((l, i) => {
            const meta = ADJ[l.kind] ?? { label: l.kind, tone: 'neutral' as const };
            const v = big(l.amountMinor);
            return [fmtDay(l.date), <Pill key={i} tone={meta.tone}>{meta.label}</Pill>, <Link key="c" href={`/reservations/${l.reservationId}`} className="font-mono hover:underline">{l.code}</Link>, l.guest, <span key="d" className="text-fg-muted">{l.description}</span>, <span key="a" className={cn('font-medium', v < 0n && 'text-danger')}>{v < 0n ? <TrendingDown className="mr-1 inline size-3" /> : null}{money(v < 0n ? -v : v, l.currency)}</span>];
          })}
          empty="No discounts, credits, write-offs or refunds in this period."
        />
      </Section>
    </>
  );
}

export default function Page() {
  return <Suspense><Reports /></Suspense>;
}
