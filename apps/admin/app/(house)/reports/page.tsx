'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { HouseReportDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { money } from '@/lib/money';
import { dateRange } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton } from '@/components/ui/bits';
import { TextInput } from '@/components/ui/field';
import { BarList, ColumnChart, StatTile } from '@/components/charts/charts';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const SOURCE: Record<string, string> = { DIRECT: 'Website', WHATSAPP: 'WhatsApp', WALK_IN: 'Walk-in', PHONE: 'Phone', PORTAL: 'Portal' };

const PERIODS = {
  last30: { label: 'Last 30 Days', range: () => [plus(today(), -30), plus(today(), -1)] },
  month: { label: 'This Month', range: () => [`${today().slice(0, 8)}01`, today()] },
  last90: { label: 'Last 90 Days', range: () => [plus(today(), -90), plus(today(), -1)] },
  next30: { label: 'Next 30 Days (On Books)', range: () => [today(), plus(today(), 29)] },
} as const;
type Period = keyof typeof PERIODS | 'custom';

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('last30');
  const [custom, setCustom] = useState({ from: plus(today(), -30), to: today() });
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : PERIODS[period].range();
  const { data: r, isLoading } = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => get<HouseReportDTO>(`/reports/house?from=${from}&to=${to}`),
    enabled: from <= to,
  });
  const ugx = (m: string) => money(m, 'UGX');
  const usdNote = (m: string) => (m !== '0' ? ` + ${money(m, 'USD')}` : '');

  const csv = () => {
    if (!r) return;
    const rows = [['date', 'rooms_available', 'rooms_sold', 'occupancy_pct'], ...r.days.map((d) => [d.date, d.available, d.sold, d.occupancy])];
    const blob = new Blob([rows.map((x) => x.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `reberon-occupancy-${from}-to-${to}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Revenue & Occupancy Reports"
        description={r ? `${dateRange(r.from, plus(r.to, 1))} · ADR, RevPAR, occupancy, and channel performance` : 'Occupancy, ADR, RevPAR, and booking channels'}
        actions={r && <Button size="sm" icon={<Download className="size-3.5" />} onClick={csv}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-xs">
          {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(k)}
              className={cn('rounded-md px-3 py-1 font-medium transition', period === k ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
            >
              {PERIODS[k].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={cn('rounded-md px-3 py-1 font-medium transition', period === 'custom' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
          >
            Custom Range
          </button>
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <TextInput type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <TextInput type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
      </div>

      {isLoading || !r ? <Skeleton className="h-80" /> : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile label="Occupancy" value={`${r.totals.occupancy}%`} note={`${r.totals.roomNightsSold}/${r.totals.roomNightsAvailable} room nights`} />
            <StatTile label="ADR" value={ugx(r.totals.adr.UGX)} note={r.totals.adr.USD !== '0' ? `USD: ${money(r.totals.adr.USD, 'USD')}` : 'Per room night sold'} />
            <StatTile label="RevPAR" value={ugx(r.totals.revpar.UGX)} note="Revenue per available room" />
            <StatTile label="Room Revenue" value={ugx(r.totals.roomRevenue.UGX)} note={`${r.totals.roomRevenue.USD !== '0' ? `${money(r.totals.roomRevenue.USD, 'USD')} · ` : ''}+ ${ugx(r.totals.otherRevenue.UGX)} extras`} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile label="Net Collected" value={ugx(r.totals.collected.UGX)} note={`Cleared less refunds${usdNote(r.totals.collected.USD)}`} />
            <StatTile label="Average Stay" value={`${r.totals.averageStay} nights`} note={`${r.totals.returningGuests} returning`} />
            <StatTile label="New Bookings" value={r.totals.bookings} note="Created in period" />
            <StatTile label="Cancelled / No-Show" value={`${r.totals.cancellations} / ${r.totals.noShows}`} note="Lost bookings" />
          </div>

          <Section title="Daily Occupancy (%)">
            <ColumnChart
              data={r.days.map((d) => ({ date: d.date, count: d.occupancy }))}
              label="Occupancy"
              max={100}
              format={(n) => `${Math.round(n)}%`}
              endLabel="last"
              caption={<>Daily occupancy · average <b className="text-fg">{r.totals.occupancy}%</b></>}
              height={160}
            />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Booking Channels" description="Room nights by source">
              {r.sourceMix.length ? <BarList data={r.sourceMix.map((x) => ({ label: SOURCE[x.source] ?? x.source, value: x.roomNights }))} /> : <p className="text-xs text-fg-muted">No stays in period.</p>}
            </Section>
            <Section title="Occupancy by Room Type" description="Percentage occupied (%)">
              <BarList data={r.roomTypes.map((x) => ({ label: x.name, value: x.occupancy }))} />
            </Section>
            <Section title="Booking Lead Time" description="Advance window">
              <BarList data={r.leadTime.map((x) => ({ label: x.bucket, value: x.bookings }))} />
            </Section>
            <Section title="Guest Sentiment" description="Post-stay ratings">
              <BarList data={[{ label: 'Good', value: r.feedback.GOOD }, { label: 'OK', value: r.feedback.OK }, { label: 'Issue', value: r.feedback.BAD }]} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
