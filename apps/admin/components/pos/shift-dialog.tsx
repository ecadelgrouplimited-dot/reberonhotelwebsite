'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, ArrowRightLeft, Printer, Trophy } from 'lucide-react';
import type { PosOrderDTO, PosPaymentMethod, PosStaffDTO } from '@reberon/contracts';
import { ApiError, post } from '@/lib/api';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { printScreen } from '@/lib/print';
import { PAYMENT_LABELS, StaffPicker } from './pos-kit';

interface WaiterStat {
  openCount: number;
  openTotal: bigint;
  paidCount: number;
  paidTotal: bigint;
}

/**
 * Today's Z-report — bills paid today by payment time, UGX summed, USD shown separately and
 * never converted — plus the handover that moves open bills to the incoming shift.
 */
export function ShiftDialog({
  open,
  onClose,
  paidToday,
  voidedToday,
  openTabs,
  staff,
  defaultFrom,
}: {
  open: boolean;
  onClose: () => void;
  paidToday: PosOrderDTO[];
  voidedToday: number;
  openTabs: PosOrderDTO[];
  staff: PosStaffDTO[];
  defaultFrom: string;
}) {
  const qc = useQueryClient();
  const holders = useMemo(
    () => [...new Set(openTabs.map((o) => o.servedByName || 'Staff'))].sort(),
    [openTabs],
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState<{ name: string; person: PosStaffDTO | null }>({ name: '', person: null });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setFrom(holders.includes(defaultFrom) ? defaultFrom : '');
  }, [open, holders, defaultFrom]);

  const report = useMemo(() => {
    const ugxPaid = paidToday.filter((o) => o.currency === 'UGX');
    const usdPaidMinor = paidToday.filter((o) => o.currency === 'USD').reduce((s, o) => s + BigInt(o.totalMinor), 0n);
    const paidTotal = ugxPaid.reduce((s, o) => s + BigInt(o.totalMinor), 0n);
    const waitingTotal = openTabs.filter((o) => o.currency === 'UGX').reduce((s, o) => s + BigInt(o.totalMinor), 0n);

    const byMethod = new Map<PosPaymentMethod, bigint>();
    const items = new Map<string, { qty: number; total: bigint }>();
    for (const o of ugxPaid) {
      byMethod.set(o.paymentMethod, (byMethod.get(o.paymentMethod) ?? 0n) + BigInt(o.totalMinor));
      for (const it of o.items) {
        const prev = items.get(it.itemName) ?? { qty: 0, total: 0n };
        items.set(it.itemName, { qty: prev.qty + it.quantity, total: prev.total + BigInt(it.totalMinor) });
      }
    }

    const byWaiter = new Map<string, WaiterStat>();
    const bump = (name: string | null, fn: (s: WaiterStat) => void) => {
      const k = name || 'Staff';
      const s = byWaiter.get(k) ?? { openCount: 0, openTotal: 0n, paidCount: 0, paidTotal: 0n };
      fn(s);
      byWaiter.set(k, s);
    };
    for (const o of openTabs.filter((x) => x.currency === 'UGX')) {
      bump(o.servedByName, (s) => {
        s.openCount += 1;
        s.openTotal += BigInt(o.totalMinor);
      });
    }
    for (const o of ugxPaid) {
      bump(o.servedByName, (s) => {
        s.paidCount += 1;
        s.paidTotal += BigInt(o.totalMinor);
      });
    }

    const topItems = [...items.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
    return { paidTotal, usdPaidMinor, waitingTotal, byMethod, byWaiter, topItems };
  }, [paidToday, openTabs]);

  const moving = openTabs.filter((o) => !from || (o.servedByName || 'Staff') === from);
  const samePerson = !!from && from === to.name;

  const handover = useMutation({
    mutationFn: () =>
      post<{ transferredCount: number; toStaffName: string }>('/pos/orders/handover-shift', {
        fromServedByName: from || undefined,
        orderIds: moving.map((o) => o.id),
        toStaffId: to.person?.userId ?? null,
        toStaffName: to.name.trim(),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['pos', 'tables'] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setTo({ name: '', person: null });
      setNotes('');
      setFrom('');
      toast.success(`${res.transferredCount} open bill(s) handed to ${res.toStaffName}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not hand over the shift'),
  });

  const maxMethod = [...report.byMethod.values()].reduce((m, v) => (v > m ? v : m), 0n);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Shift report & handover"
      description="Bills paid today by method and waiter, and handing open bills to the next shift."
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Paid today" value={money(report.paidTotal, 'UGX')} tone="text-success" />
          <Tile label="Waiting payment" value={money(report.waitingTotal, 'UGX')} tone="text-warning" />
          <Tile label="Receipts today" value={String(paidToday.length)} />
          <Tile label="Open bills" value={String(openTabs.length)} sub={voidedToday ? `${voidedToday} voided today` : undefined} />
        </div>
        {report.usdPaidMinor > 0n && (
          <p className="-mt-2 text-[11.5px] text-fg-muted">
            Also paid in USD today: <strong className="text-fg">{money(report.usdPaidMinor, 'USD')}</strong> (kept separate, not converted).
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3.5">
            <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">By payment method</h4>
            {report.byMethod.size === 0 ? (
              <p className="text-xs text-fg-muted">Nothing paid yet today.</p>
            ) : (
              <ul className="grid gap-2 text-xs">
                {[...report.byMethod.entries()].map(([k, v]) => (
                  <li key={k}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{PAYMENT_LABELS[k]}</span>
                      <span className="font-mono font-semibold tabular">{money(v, 'UGX')}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${maxMethod > 0n ? Number((v * 100n) / maxMethod) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
              <Trophy className="size-3.5 text-amber-500" /> Best sellers today
            </h4>
            {report.topItems.length === 0 ? (
              <p className="text-xs text-fg-muted">No sales yet today.</p>
            ) : (
              <ol className="grid gap-1.5 text-xs">
                {report.topItems.map(([name, s], i) => (
                  <li key={name} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        i === 0 ? 'bg-amber-500 text-white' : 'bg-surface-2 text-fg-muted',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="font-mono text-fg-muted tabular">×{s.qty}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line p-3.5">
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">Waiters</h4>
          {report.byWaiter.size === 0 ? (
            <p className="text-xs text-fg-muted">No bills yet today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10.5px] uppercase text-fg-subtle">
                    <th className="py-1.5 pr-2">Waiter</th>
                    <th className="px-2 py-1.5">Open bills</th>
                    <th className="px-2 py-1.5">Paid today</th>
                    <th className="py-1.5 pl-2 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...report.byWaiter.entries()].map(([waiter, s]) => (
                    <tr key={waiter} className={cn(from === waiter && 'bg-accent/5')}>
                      <td className="py-2 pr-2 font-semibold">{waiter}</td>
                      <td className="px-2 py-2 font-mono tabular text-warning">
                        {s.openCount} · {money(s.openTotal, 'UGX')}
                      </td>
                      <td className="px-2 py-2 font-mono tabular text-success">
                        {s.paidCount} · {money(s.paidTotal, 'UGX')}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {s.openCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setFrom(waiter)}
                            className="rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold hover:border-accent hover:text-accent"
                          >
                            Hand over
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form
          data-no-print
          className="rounded-xl border border-line bg-surface-2/50 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            handover.mutate();
          }}
        >
          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
            <ArrowRightLeft className="size-3.5" /> Change of shift
          </h4>
          <p className="mb-3 mt-0.5 text-[11.5px] text-fg-muted">
            Pick who is leaving and who is taking over. Their open bills move across and a handover note is posted.
          </p>
          {openTabs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[12px] text-fg-muted">
              No open bills to hand over — the incoming waiter starts fresh.
            </p>
          ) : (
            <>
              <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_auto_1fr]">
                <label className="grid gap-1.5 text-[12px] font-medium">
                  Outgoing
                  <StaffPicker
                    ariaLabel="Outgoing waiter"
                    staff={staff}
                    only={holders}
                    allowAll={`Everyone (${openTabs.length} open bills)`}
                    value={from}
                    onChange={(n) => setFrom(n)}
                  />
                </label>
                <ArrowRight className="mb-2 hidden size-4 text-fg-subtle sm:block" />
                <label className="grid gap-1.5 text-[12px] font-medium">
                  Incoming
                  <StaffPicker
                    ariaLabel="Incoming waiter"
                    staff={staff}
                    placeholder="Choose who takes over"
                    value={to.name}
                    onChange={(name, person) => setTo({ name, person })}
                  />
                </label>
              </div>
              <input
                className="input mt-2.5 !min-h-8 !py-1 text-xs"
                placeholder="Handover note (optional) — e.g. Table 4 paying by MoMo"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-[11.5px] text-fg-muted">
                  {samePerson ? (
                    <span className="text-danger">Choose a different person to take over.</span>
                  ) : (
                    <>
                      Moves <strong className="text-fg">{moving.length}</strong> bill{moving.length === 1 ? '' : 's'}
                      {moving.length > 0 && `: ${moving.slice(0, 4).map((o) => o.tableOrRoom || o.orderNumber).join(', ')}${moving.length > 4 ? '…' : ''}`}
                    </>
                  )}
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<ArrowRightLeft className="size-3.5" />}
                  loading={handover.isPending}
                  disabled={to.name.trim().length < 2 || moving.length === 0 || samePerson}
                >
                  Hand over {moving.length || ''}
                </Button>
              </div>
            </>
          )}
        </form>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            icon={<Printer className="size-3.5" />}
            onClick={(e) => printScreen({ node: e.currentTarget.closest<HTMLElement>('.panel'), title: 'Shift report' })}
          >
            Print
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className={cn('mt-1 font-mono text-[15px] font-bold tabular', tone)}>{value}</p>
      {sub && <p className="text-[10.5px] text-fg-subtle">{sub}</p>}
    </div>
  );
}
