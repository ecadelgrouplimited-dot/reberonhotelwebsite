'use client';
import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Contact, Download, ExternalLink, Plus, Search, Star } from 'lucide-react';
import type { GuestSummaryDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money } from '@/lib/money';
import { dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';

export default function GuestsPage() {
  const router = useRouter();
  const can = useCan();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const term = useDeferredValue(q);
  const qs = new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), ...(term ? { q: term } : {}) });
  const { data, isLoading } = useQuery({
    queryKey: ['guests', qs.toString()],
    queryFn: () => get<{ data: GuestSummaryDTO[]; total: number }>(`/guests?${qs}`),
    placeholderData: (p) => p,
  });

  const rows = data?.data ?? [];
  const withMoney = rows.some((g) => g.spent);
  const vipCount = rows.filter((g) => g.isVip).length;
  const returningCount = rows.filter((g) => g.stays >= 2).length;
  const upcomingCount = rows.filter((g) => g.nextStay).length;

  const exportCsv = () => {
    if (!rows.length) return;
    const csvRows = [
      ['Name', 'Phone', 'Email', 'Country', 'VIP', 'Stays', 'Nights', 'Last Stay', 'Next Stay', 'Paid UGX'],
      ...rows.map((g) => [
        `"${g.name.replace(/"/g, '""')}"`,
        g.phone ?? '',
        g.email ?? '',
        g.country ?? '',
        g.isVip ? 'YES' : 'NO',
        g.stays,
        g.nights,
        g.lastStay ?? '',
        g.nextStay ?? '',
        g.spent ? Number(BigInt(g.spent.UGX) / 100n) : '',
      ]),
    ];
    const blob = new Blob([csvRows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'reberon-guests.csv' });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Guest Directory"
        description={`${data?.total ?? 0} guest profiles · Stay history, VIP status, and lifetime spend`}
        actions={
          <>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>Export CSV</Button>
            {can('bookings:write') && (
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>New Booking</Button>
            )}
          </>
        }
      />

      {/* Compact 4-KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'all' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Total Guests</span>
          <span className="mt-1 text-lg font-bold leading-none tabular">{data?.total ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter('returning')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'returning' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Returning Regulars</span>
          <span className="mt-1 text-lg font-bold leading-none tabular text-info">{returningCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter('vip')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'vip' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">VIP Guests</span>
          <span className="mt-1 text-lg font-bold leading-none tabular text-warning">{vipCount}</span>
        </button>
        <div className="card flex flex-col items-start justify-between p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Upcoming Stays</span>
          <span className="mt-1 text-lg font-bold leading-none tabular text-success">{upcomingCount}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {([
                ['all', 'All Guests'],
                ['returning', 'Returning (2+)'],
                ['vip', 'VIP Only'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', filter === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-60 pl-8 text-xs"
                placeholder="Name, phone, email, or RB- code..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <span className="text-[11px] font-medium text-fg-muted">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2 text-right">Stays</th>
                <th className="px-3 py-2 text-right">Nights</th>
                <th className="px-3 py-2">Last Stay</th>
                <th className="px-3 py-2">Next Stay</th>
                {withMoney && <th className="px-3 py-2 text-right">Lifetime Spend</th>}
                <th className="px-3 py-2 text-right">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading && Array.from({ length: 6 }, (_, i) => (
                <tr key={i}><td colSpan={10} className="px-3 py-2.5"><Skeleton className="h-5" /></td></tr>
              ))}
              {rows.map((g) => (
                <tr key={g.id} className="cursor-pointer hover:bg-surface-2/40 transition-colors" onClick={() => router.push(`/guests/${g.id}`)}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-semibold text-fg">
                      <span>{g.name}</span>
                      {g.isVip && <Pill tone="dark"><Star className="size-2.5 fill-current text-warning" /> VIP</Pill>}
                      {g.stays >= 2 && <Pill tone="blue">Regular</Pill>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">
                    {[g.phone, g.email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">
                    {g.country || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {g.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {g.tags.map((t) => (
                          <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted">{t}</span>
                        ))}
                      </div>
                    ) : <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular">{g.stays}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular text-fg-muted">{g.nights}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular text-fg-muted">{g.lastStay ? dateShort(g.lastStay) : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular">
                    {g.nextStay ? <span className="font-semibold text-success">{dateShort(g.nextStay)}</span> : <span className="text-fg-subtle">—</span>}
                  </td>
                  {withMoney && (
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular">
                      {g.spent ? money(g.spent.UGX, 'UGX') : '—'}
                      {g.spent && g.spent.USD !== '0' && <span className="block text-[10.5px] text-fg-muted">{money(g.spent.USD, 'USD')}</span>}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/guests/${g.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:bg-surface-2">
                      View <ExternalLink className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !rows.length && <Empty icon={<Contact className="size-4" />} title={term ? 'No matching guests' : 'No guest records'} />}
        </div>
      </div>
    </div>
  );
}
