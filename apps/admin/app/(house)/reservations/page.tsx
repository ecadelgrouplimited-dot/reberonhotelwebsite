'use client';
import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp, Calendar, ExternalLink, Filter, Plus, RotateCcw,
  Search, SlidersHorizontal, UserRoundPlus, Wallet,
} from 'lucide-react';
import type { ReservationSummaryDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateRange, ago } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Status } from '@/components/ui/bits';

const SOURCE: Record<string, string> = {
  DIRECT: 'Website',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  PORTAL: 'Portal',
};

export default function ReservationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSort = searchParams.get('sort') || 'latest';

  const [status, setStatus] = useState<string>(initialSort === 'latest' ? 'all' : 'upcoming');
  const [sort, setSort] = useState<string>(initialSort);
  const [windowFilter, setWindowFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [balanceFilter, setBalanceFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const can = useCan();

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (sort) params.set('sort', sort);
    if (windowFilter !== 'all') params.set('window', windowFilter);
    if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
    if (balanceFilter !== 'ALL') params.set('balance', balanceFilter);
    if (q.trim()) params.set('q', q.trim());
    return params.toString();
  }, [status, sort, windowFilter, sourceFilter, balanceFilter, q]);

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', qs],
    queryFn: () => get<{ data: ReservationSummaryDTO[]; counts: Record<string, number> }>(`/reservations?${qs}`),
    refetchInterval: 30_000,
  });

  const c = data?.counts ?? {};
  const rows = data?.data ?? [];

  const hasActiveFilters =
    status !== 'all' ||
    sort !== 'latest' ||
    windowFilter !== 'all' ||
    sourceFilter !== 'ALL' ||
    balanceFilter !== 'ALL' ||
    q.trim().length > 0;

  const resetFilters = () => {
    setStatus('all');
    setSort('latest');
    setWindowFilter('all');
    setSourceFilter('ALL');
    setBalanceFilter('ALL');
    setQ('');
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Reservations"
        description="Direct website, walk-in, phone, and WhatsApp bookings"
        actions={
          can('bookings:write') && (
            <>
              <Button size="sm" href="/reservations/new?walkin=1" icon={<UserRoundPlus className="size-3.5" />}>
                Walk-In
              </Button>
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>
                New Reservation
              </Button>
            </>
          )
        }
      />

      <div className="card overflow-hidden">
        {/* Status Tab Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-[11px]">
            {([
              { v: 'all', l: 'All' },
              { v: 'upcoming', l: 'Upcoming' },
              { v: 'HELD', l: `Pending Payment (${c.HELD ?? 0})` },
              { v: 'CONFIRMED', l: `Confirmed (${c.CONFIRMED ?? 0})` },
              { v: 'CANCELLED', l: `Cancelled (${c.CANCELLED ?? 0})` },
              { v: 'EXPIRED', l: `Expired (${c.EXPIRED ?? 0})` },
            ] as const).map((item) => (
              <button
                key={item.v}
                type="button"
                onClick={() => setStatus(item.v)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition',
                  status === item.v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {item.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-fg-muted">
              {rows.length} booking{rows.length === 1 ? '' : 's'} found
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle hover:text-fg transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Operational Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 border-b border-line bg-surface px-3 py-2 text-xs">
          {/* Quick Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              className="input !h-8 !min-h-0 w-full pl-8 text-xs bg-surface-2/50"
              placeholder="Search code, guest, phone, email..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5">
            <ArrowDownUp className="size-3.5 text-fg-subtle shrink-0" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort bookings by"
              className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
            >
              <option value="latest">Latest Bookings First</option>
              <option value="arrival_asc">Check-in Date (Earliest)</option>
              <option value="arrival_desc">Check-in Date (Furthest)</option>
            </select>
          </div>

          {/* Time Window */}
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-fg-subtle shrink-0" />
            <select
              value={windowFilter}
              onChange={(e) => setWindowFilter(e.target.value)}
              aria-label="Filter bookings by date range"
              className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
            >
              <option value="all">Stay Dates: Any</option>
              <option value="today_arrivals">Arriving Today</option>
              <option value="today_departures">Departing Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
            </select>
          </div>

          {/* Booking Channel */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-fg-subtle shrink-0" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter bookings by booking channel"
              className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
            >
              <option value="ALL">Channel: All</option>
              <option value="DIRECT">Website</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="PHONE">Phone</option>
            </select>
          </div>

          {/* Payment Balance */}
          <div className="flex items-center gap-1.5">
            <Wallet className="size-3.5 text-fg-subtle shrink-0" />
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value)}
              aria-label="Filter bookings by payment balance"
              className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
            >
              <option value="ALL">Payment: All</option>
              <option value="UNPAID">Balance Due / Unpaid</option>
              <option value="PAID">Fully Paid</option>
            </select>
          </div>
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
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-3 py-2.5">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-surface-2/40 transition-colors"
                  onClick={() => router.push(`/reservations/${r.id}`)}
                >
                  <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">{r.code}</td>
                  <td className="px-3 py-2.5 font-semibold text-fg">
                    <Link
                      href={`/reservations/${r.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.guest.name}
                    </Link>
                    <span className="block text-[11px] font-normal text-fg-muted">
                      {r.adults} adult{r.adults > 1 ? 's' : ''}
                      {r.children ? ` + ${r.children} child` : ''}
                      {r.guest.phone ? ` · ${r.guest.phone}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{dateRange(r.arrival, r.departure)}</td>
                  <td className="px-3 py-2.5 text-fg-muted">{r.roomSummary}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">
                    {SOURCE[r.source] ?? r.source}
                    <span className="block text-[10.5px] text-fg-subtle">{ago(r.createdAt)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap">
                    {money(r.totalMinor, r.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap">
                    {BigInt(r.balanceMinor) > 0n ? (
                      <span className="font-semibold text-warning">{money(r.balanceMinor, r.currency)}</span>
                    ) : (
                      <span className="font-semibold text-success">Paid ✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Status value={r.status} />
                      {r.status === 'HELD' && r.holdExpiresAt && (
                        <Pill tone="amber">
                          until{' '}
                          {new Date(r.holdExpiresAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Africa/Kampala',
                          })}
                        </Pill>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/reservations/${r.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium hover:bg-surface-2 transition-colors"
                    >
                      Open <ExternalLink className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && !rows.length && (
            <Empty
              title="No reservations match the filters"
              action={
                hasActiveFilters ? (
                  <Button size="sm" variant="secondary" onClick={resetFilters}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
