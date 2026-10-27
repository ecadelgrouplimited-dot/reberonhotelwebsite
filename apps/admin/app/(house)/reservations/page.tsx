'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus, Search, UserRoundPlus } from 'lucide-react';
import type { ReservationSummaryDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateRange, ago } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Status } from '@/components/ui/bits';

const SOURCE: Record<string, string> = { DIRECT: 'Website', WHATSAPP: 'WhatsApp', WALK_IN: 'Walk-in', PHONE: 'Phone', PORTAL: 'Portal' };

export default function ReservationsPage() {
  const [status, setStatus] = useState('upcoming');
  const [q, setQ] = useState('');
  const router = useRouter();
  const can = useCan();
  const qs = new URLSearchParams({ ...(status !== 'all' ? { status } : {}), ...(q ? { q } : {}), ...(status === 'upcoming' ? {} : { sort: 'created' }) });
  const { data, isLoading } = useQuery({
    queryKey: ['reservations', qs.toString()],
    queryFn: () => get<{ data: ReservationSummaryDTO[]; counts: Record<string, number> }>(`/reservations?${qs}`),
    refetchInterval: 30_000,
  });
  const c = data?.counts ?? {};
  const rows = data?.data ?? [];

  return (
    <div className="fade-in">
      <PageHeader
        title="Reservations"
        description="Direct website, walk-in, phone, and WhatsApp bookings"
        actions={
          can('bookings:write') && (
            <>
              <Button size="sm" href="/reservations/new?walkin=1" icon={<UserRoundPlus className="size-3.5" />}>Walk-In</Button>
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>New Reservation</Button>
            </>
          )
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {([
                { v: 'upcoming', l: 'Upcoming' },
                { v: 'HELD', l: `Pending Payment (${c.HELD ?? 0})` },
                { v: 'CONFIRMED', l: `Confirmed (${c.CONFIRMED ?? 0})` },
                { v: 'CANCELLED', l: `Cancelled (${c.CANCELLED ?? 0})` },
                { v: 'EXPIRED', l: `Expired (${c.EXPIRED ?? 0})` },
                { v: 'all', l: 'All' },
              ] as const).map((item) => (
                <button
                  key={item.v}
                  type="button"
                  onClick={() => setStatus(item.v)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', status === item.v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  {item.l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-56 pl-8 text-xs"
                placeholder="Name, phone, or RB- code..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <span className="text-[11px] font-medium text-fg-muted">{rows.length} booking{rows.length === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Stay Dates</th>
                <th className="px-3 py-2">Room Summary</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Folio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={9} className="px-3 py-2.5"><Skeleton className="h-5" /></td></tr>)}
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2/40 transition-colors" onClick={() => router.push(`/reservations/${r.id}`)}>
                  <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">{r.code}</td>
                  <td className="px-3 py-2.5 font-semibold text-fg">
                    <Link href={`/reservations/${r.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.guest.name}</Link>
                    <span className="block text-[11px] font-normal text-fg-muted">{r.adults} adult{r.adults > 1 ? 's' : ''}{r.children ? ` + ${r.children} child` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{dateRange(r.arrival, r.departure)}</td>
                  <td className="px-3 py-2.5 text-fg-muted">{r.roomSummary}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">
                    {SOURCE[r.source] ?? r.source}
                    <span className="block text-[10.5px] text-fg-subtle">{ago(r.createdAt)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap">{money(r.totalMinor, r.currency)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap">
                    {BigInt(r.balanceMinor) > 0n ? <span className="font-semibold text-warning">{money(r.balanceMinor, r.currency)}</span> : <span className="font-semibold text-success">Paid ✓</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Status value={r.status} />
                      {r.status === 'HELD' && r.holdExpiresAt && (
                        <Pill tone="amber">until {new Date(r.holdExpiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' })}</Pill>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/reservations/${r.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:bg-surface-2">
                      Open <ExternalLink className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && !rows.length && <Empty title="No reservations match filter" />}
        </div>
      </div>
    </div>
  );
}
