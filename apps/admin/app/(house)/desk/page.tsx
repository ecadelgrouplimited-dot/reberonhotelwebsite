'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BedDouble, Clock, ExternalLink, LogIn, LogOut, Plus, Search, Star, UserRoundPlus, UserX } from 'lucide-react';
import type { DeskBoardDTO, DeskStayDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money } from '@/lib/money';
import { dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Status } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';
import { RackGrid, RackLegend } from '@/components/house/hk';
import { CheckInDialog, CheckOutDialog, type StayRef } from '@/components/house/desk-dialogs';

type Tab = 'arrivals' | 'inHouse' | 'departures' | 'late';
type BalanceFilter = 'all' | 'due' | 'paid';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

export default function DeskPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const can = useCan();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('arrivals');
  const [q, setQ] = useState('');
  const [balFilter, setBalFilter] = useState<BalanceFilter>('all');
  const [dialog, setDialog] = useState<{ kind: 'in' | 'out'; stay: StayRef } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['desk'], queryFn: () => get<DeskBoardDTO>('/desk'), refetchInterval: 30_000 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['desk'] });
    qc.invalidateQueries({ queryKey: ['rack'] });
    qc.invalidateQueries({ queryKey: ['reservation'] });
  };
  const noShow = useMutation({
    mutationFn: (s: DeskStayDTO) => post(`/desk/reservations/${s.id}/no-show`, {}),
    onSuccess: () => { toast.success('Marked as no-show'); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update'),
  });

  const c = data?.counts;
  const lists: Record<Tab, DeskStayDTO[]> = {
    arrivals: data?.arrivals ?? [],
    inHouse: data?.inHouse ?? [],
    departures: data?.departures ?? [],
    late: data?.lateArrivals ?? [],
  };
  const term = q.trim().toLowerCase();
  const shown = lists[tab].filter((s) => {
    if (term && !s.guest.name.toLowerCase().includes(term) && !s.code.toLowerCase().includes(term) && !s.rooms.some((r) => r.assigned.some((a) => a.number.toLowerCase().includes(term)))) return false;
    const bal = BigInt(s.balanceMinor);
    if (balFilter === 'due' && bal <= 0n) return false;
    if (balFilter === 'paid' && bal > 0n) return false;
    return true;
  });

  const heading = data && new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`));
  const readyRooms = (data?.rooms ?? []).filter((r) => r.hkStatus === 'VACANT_CLEAN' || r.hkStatus === 'INSPECTED').length;
  const dirtyRooms = (data?.rooms ?? []).filter((r) => r.hkStatus === 'VACANT_DIRTY').length;
  const canMoney = can('payments:record');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());

  const tabs: { v: Tab; label: string; value: string; note: string; warn?: boolean }[] = [
    { v: 'arrivals', label: 'Arriving Today', value: c ? `${c.arrived}/${c.arrivals}` : '–', note: 'checked in' },
    { v: 'inHouse', label: 'In-House', value: c ? String(c.inHouse) : '–', note: c ? `${c.guestsInHouse} pax` : '' },
    { v: 'departures', label: 'Departing Today', value: c ? `${c.departed}/${c.departures}` : '–', note: 'checked out' },
    { v: 'late', label: 'Overdue / Late', value: String(data?.lateArrivals.length ?? 0), note: 'not arrived', warn: (data?.lateArrivals.length ?? 0) > 0 },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title="Front Desk"
        description={heading ? `${heading} · Live check-in, in-house folios, and departures` : 'Live front desk operations'}
        actions={
          <>
            {can('bookings:write') && (
              <>
                <Button size="sm" href="/reservations/new" icon={<Plus className="size-3.5" />}>New Booking</Button>
                <Button variant="primary" size="sm" href="/reservations/new?walkin=1" icon={<UserRoundPlus className="size-3.5" />}>Walk-In Check-In</Button>
              </>
            )}
          </>
        }
      />

      {/* Compact 5-KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.v}
            type="button"
            role="tab"
            aria-selected={tab === t.v}
            onClick={() => setTab(t.v)}
            className={cn(
              'card flex flex-col items-start justify-between p-3 text-left transition',
              tab === t.v ? '!border-fg ring-1 ring-fg bg-surface-2/40' : 'hover:border-line-strong',
              t.warn && 'border-warning/50',
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{t.label}</span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold leading-none tabular">{t.value}</span>
              <span className="text-[11px] text-fg-muted">{t.note}</span>
            </span>
          </button>
        ))}
        <Link href="/rack" className="card flex flex-col items-start justify-between p-3 text-left transition hover:border-line-strong">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Ready Rooms</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold leading-none tabular text-success">{readyRooms}</span>
            <span className="text-[11px] text-fg-muted">{dirtyRooms > 0 ? `${dirtyRooms} dirty` : 'clean'}</span>
          </span>
        </Link>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
        {/* High-Density Operations Table */}
        <section aria-live="polite" className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="input !h-7 !min-h-0 w-56 pl-8 text-xs"
                  placeholder="Search guest, code, or room #..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {canMoney && (
                <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
                  {(['all', 'due', 'paid'] as const).map((bf) => (
                    <button
                      key={bf}
                      type="button"
                      onClick={() => setBalFilter(bf)}
                      className={cn('rounded-md px-2 py-0.5 font-medium transition', balFilter === bf ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                    >
                      {bf === 'all' ? 'All Balances' : bf === 'due' ? 'Balance Due' : 'Settled'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[11px] font-medium text-fg-muted">{shown.length} stay{shown.length === 1 ? '' : 's'}</span>
          </div>

          {isLoading ? (
            <div className="p-4"><Skeleton className="h-48" /></div>
          ) : !shown.length ? (
            <Empty
              icon={<BedDouble className="size-4" />}
              title={term ? 'No matching stays' : { arrivals: 'No arrivals queued', inHouse: 'No guests in-house', departures: 'No departures today', late: 'No overdue arrivals' }[tab]}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2">Guest</th>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Room Type</th>
                    <th className="px-3 py-2">Room #</th>
                    <th className="px-3 py-2">Stay</th>
                    {canMoney && <th className="px-3 py-2 text-right">Balance</th>}
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((s) => {
                    const assigned = s.rooms.flatMap((r) => r.assigned.map((a) => a.number));
                    const balance = BigInt(s.balanceMinor);
                    const done = (tab === 'arrivals' && s.status !== 'CONFIRMED' && s.status !== 'HELD') || (tab === 'departures' && s.status === 'CHECKED_OUT');
                    return (
                      <tr key={s.id} className={cn('hover:bg-surface-2/40 transition-colors', done && 'opacity-60')}>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/reservations/${s.id}`} className="font-semibold text-fg hover:underline">
                              {s.guest.name}
                            </Link>
                            {s.isVip && <Pill tone="dark"><Star className="size-2.5 fill-current text-warning" /> VIP</Pill>}
                            {s.previousStays > 0 && <Pill tone="blue">{ordinal(s.previousStays + 1)}</Pill>}
                            {(done || tab === 'late') && <Status value={s.status} />}
                          </div>
                          {(s.eta || s.guestNotes || s.staffNotes) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
                              {s.eta && <span className="inline-flex items-center gap-1"><Clock className="size-3 text-fg-subtle" /> ETA {s.eta}</span>}
                              {s.guestNotes && <span className="italic truncate max-w-[16rem]">“{s.guestNotes}”</span>}
                              {s.staffNotes && <span className="truncate max-w-[14rem] text-fg-subtle">Note: {s.staffNotes.split('\n')[0]}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Link href={`/reservations/${s.id}`} className="font-mono font-semibold text-fg hover:underline">{s.code}</Link>
                          <div className="text-[11px] text-fg-muted">{s.adults + s.children} pax · {s.nights}n</div>
                        </td>
                        <td className="px-3 py-2.5 text-fg-muted">
                          {s.roomSummary}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {assigned.length ? (
                            <div className="flex flex-wrap gap-1">
                              {assigned.map((n) => (
                                <span key={n} className="inline-flex items-center rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold tabular">
                                  {n}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-fg-subtle">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-[11.5px]">
                          <div>{dateShort(s.arrival)} → {s.departure === today && tab === 'inHouse' ? <b className="text-warning">Today</b> : dateShort(s.departure)}</div>
                        </td>
                        {canMoney && (
                          <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono tabular">
                            {balance > 0n ? (
                              <span className="font-semibold text-warning">{money(balance, s.currency)}</span>
                            ) : (
                              <span className="text-[11px] font-semibold text-success">Paid ✓</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {(tab === 'arrivals' || tab === 'late') && s.status === 'CONFIRMED' && (
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<LogIn className="size-3.5" />}
                                onClick={() => setDialog({ kind: 'in', stay: { ...s, keep: s.rooms.flatMap((rr) => rr.assigned.map((a) => ({ reservationRoomId: rr.reservationRoomId, roomId: a.roomId }))) } })}
                              >
                                Check In
                              </Button>
                            )}
                            {tab === 'arrivals' && s.status === 'HELD' && (
                              <Button size="sm" href={`/reservations/${s.id}`}>Deposit</Button>
                            )}
                            {tab === 'late' && s.status === 'CONFIRMED' && (
                              <Button
                                size="sm"
                                variant="danger"
                                icon={<UserX className="size-3.5" />}
                                onClick={async () => {
                                  if (await confirm({ title: `Mark ${s.guest.name} as no-show?`, body: 'Assigned rooms return to inventory.', confirm: 'Mark no-show', danger: true })) {
                                    noShow.mutate(s);
                                  }
                                }}
                              >
                                No-Show
                              </Button>
                            )}
                            {(tab === 'inHouse' || tab === 'departures') && s.status === 'IN_HOUSE' && (
                              <Button
                                size="sm"
                                variant={tab === 'departures' || s.departure <= today ? 'primary' : 'secondary'}
                                icon={<LogOut className="size-3.5" />}
                                onClick={() => setDialog({ kind: 'out', stay: s })}
                              >
                                Check Out
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" href={`/reservations/${s.id}`} title="Open Folio">
                              <ExternalLink className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Live Room Rack Sidebar */}
        <aside className="card p-3.5 xl:sticky xl:top-16">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Live Room Rack</p>
            <Link href="/rack" className="text-xs font-medium text-brand hover:underline">Full Rack →</Link>
          </div>
          {data ? (
            <>
              <RackLegend rooms={data.rooms} />
              <div className="mt-3"><RackGrid rooms={data.rooms} compact onPick={(r) => router.push(`/rack?room=${r.id}`)} /></div>
            </>
          ) : <Skeleton className="h-56" />}
        </aside>
      </div>

      <CheckInDialog stay={dialog?.kind === 'in' ? dialog.stay : null} open={dialog?.kind === 'in'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />
      <CheckOutDialog stay={dialog?.kind === 'out' ? dialog.stay : null} open={dialog?.kind === 'out'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />
    </div>
  );
}
