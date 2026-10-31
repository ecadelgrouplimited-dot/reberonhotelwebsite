'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Calendar,
  Download,
  ExternalLink,
  History,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserRoundPlus,
  Wallet,
} from 'lucide-react';
import type { ReservationSummaryDTO } from '@reberon/contracts';
import { del, get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { dateRange, ago } from '@/lib/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Status } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';

const SOURCE: Record<string, string> = {
  DIRECT: 'Website',
  WHATSAPP: 'WhatsApp',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  PORTAL: 'Portal',
};

interface AuditRow {
  id: string;
  actor: { id: string; name: string; role?: string } | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export default function ReservationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSort = searchParams.get('sort') || 'latest';
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const isOwner = me.role === 'OWNER';

  const [status, setStatus] = useState<string>(initialSort === 'latest' ? 'all' : 'upcoming');
  const [sort, setSort] = useState<string>(initialSort);
  const [windowFilter, setWindowFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [balanceFilter, setBalanceFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Super Admin deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<ReservationSummaryDTO | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

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

  const { data: auditData } = useQuery({
    queryKey: ['audit-reservations'],
    queryFn: () => get<{ data: AuditRow[]; total: number }>('/audit?entityType=Reservation&limit=40'),
    enabled: isOwner && showAuditLog,
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      del<{ ok: boolean; code: string }>(`/reservations/${id}`, { reason }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['audit-reservations'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      toast.success(`Reservation ${res?.code ?? ''} permanently deleted`);
      setDeleteTarget(null);
      setDeleteReason('');
    },
    onError: (e: Error) => toast.error(e.message),
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

  const handleExportCsv = () => {
    if (!rows.length) return;
    exportToCsv(
      `reberon-reservations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Code',
        'Guest Name',
        'Phone',
        'Email',
        'Arrival',
        'Departure',
        'Nights',
        'Adults',
        'Children',
        'Rooms',
        'Source',
        'Status',
        'Currency',
        'Total',
        'Paid',
        'Balance',
        'Created At',
      ],
      rows.map((r) => [
        r.code,
        r.guest.name,
        r.guest.phone ?? '',
        r.guest.email ?? '',
        r.arrival,
        r.departure,
        r.nights,
        r.adults,
        r.children,
        r.roomSummary,
        SOURCE[r.source] ?? r.source,
        r.status,
        r.currency,
        money(r.totalMinor, r.currency),
        money(r.paidMinor, r.currency),
        money(r.balanceMinor, r.currency),
        r.createdAt,
      ]),
    );
  };

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        title="Reservations"
        description="Direct website, walk-in, phone, and WhatsApp bookings"
        actions={
          <>
            {isOwner && (
              <Button
                size="sm"
                variant={showAuditLog ? 'primary' : 'secondary'}
                onClick={() => setShowAuditLog((v) => !v)}
                icon={<History className="size-3.5" />}
              >
                Owner Audit Log
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!rows.length}
              onClick={handleExportCsv}
              icon={<Download className="size-3.5" />}
            >
              Export CSV
            </Button>
            {can('bookings:write') && (
              <>
                <Button size="sm" href="/reservations/new?walkin=1" icon={<UserRoundPlus className="size-3.5" />}>
                  Walk-In
                </Button>
                <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>
                  New Reservation
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Super Admin (OWNER) Exclusive Audit & Deletion Trail */}
      {isOwner && showAuditLog && (
        <Section
          title="Super Admin Reservation Audit & Deletion Trail"
          description="Visible strictly to the Hotel Owner (Super Admin) — tracks all reservation creations, modifications, cancellations, and permanent deletions"
        >
          {!auditData?.data.length ? (
            <p className="py-4 text-center text-xs text-fg-muted">No reservation audit entries recorded yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-line text-xs">
              {auditData.data.map((log) => (
                <div key={log.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={log.action.includes('delete') ? 'red' : log.action.includes('cancel') ? 'amber' : 'neutral'} dot>
                        {log.action}
                      </Pill>
                      <span className="font-semibold text-fg">{log.summary ?? log.action}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-fg-muted">
                      Actor: <strong className="text-fg">{log.actor?.name ?? log.actorType}</strong>
                      {log.actor?.role ? ` (${log.actor.role})` : ''}
                      {log.before && typeof log.before.reason === 'string' ? ` · Reason: "${log.before.reason}"` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-fg-subtle">{ago(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

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
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              className="input !h-8 !min-h-0 w-full pl-8 text-xs bg-surface-2/50"
              placeholder="Search code, guest, phone, email..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

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
                <th className="px-3 py-2 text-right">Actions</th>
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
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap text-fg">
                    {money(r.totalMinor, r.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap">
                    {BigInt(r.balanceMinor) > 0n ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {money(r.balanceMinor, r.currency)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-fg-muted">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Paid
                      </span>
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
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/reservations/${r.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium hover:bg-surface-2 transition-colors"
                      >
                        Open <ExternalLink className="size-3" />
                      </Link>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(r);
                            setDeleteReason('');
                          }}
                          title="Permanently delete reservation (Super Admin only)"
                          className="inline-flex items-center justify-center rounded-md border border-line p-1.5 text-fg-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
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
                    Clear All Filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Super Admin Delete Reservation Confirmation Modal */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete Reservation ${deleteTarget?.code ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() =>
                deleteTarget &&
                deleteMut.mutate({
                  id: deleteTarget.id,
                  reason: deleteReason.trim() || 'Super Admin permanent deletion',
                })
              }
            >
              Permanently Delete Reservation
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
              <ShieldAlert className="size-4 text-danger shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-fg">
                  Super Admin Exclusive Action — Permanent Deletion
                </p>
                <p className="text-fg-muted">
                  Deleting <strong className="font-mono text-fg">{deleteTarget.code}</strong> ({deleteTarget.guest.name},{' '}
                  {dateRange(deleteTarget.arrival, deleteTarget.departure)}) will release any held/sold room inventory and remove this booking from the system. A permanent entry will be recorded in the Super Admin Audit Log.
                </p>
              </div>
            </div>
            <label className="block">
              <span className="label">Reason for deletion (recorded in Owner Audit Log)</span>
              <input
                className="input"
                placeholder="e.g. Duplicate test booking or erroneous walk-in entry"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </label>
          </div>
        )}
      </Dialog>
    </div>
  );
}
