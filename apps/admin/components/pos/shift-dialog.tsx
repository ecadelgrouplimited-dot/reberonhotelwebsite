'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Printer, Trophy } from 'lucide-react';
import type { PosOrderDTO, PosPaymentMethod } from '@reberon/contracts';
import { ApiError, post } from '@/lib/api';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextInput } from '@/components/ui/field';
import { PAYMENT_LABELS } from './pos-kit';

interface WaiterStat {
  openCount: number;
  openTotal: bigint;
  paidCount: number;
  paidTotal: bigint;
}

/**
 * Today's Z-report (UGX bills; USD is listed separately, never summed in) plus the waiter
 * handover that moves open bills to the incoming shift.
 */
export function ShiftDialog({
  open,
  onClose,
  todayOrders,
  openTabs,
  defaultFrom,
}: {
  open: boolean;
  onClose: () => void;
  todayOrders: PosOrderDTO[];
  openTabs: PosOrderDTO[];
  defaultFrom: string;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');

  const report = useMemo(() => {
    const paid = todayOrders.filter((o) => o.isSettled && o.status !== 'CANCELLED');
    const voided = todayOrders.filter((o) => o.status === 'CANCELLED').length;
    const ugxPaid = paid.filter((o) => o.currency === 'UGX');
    const usdPaidMinor = paid.filter((o) => o.currency === 'USD').reduce((s, o) => s + BigInt(o.totalMinor), 0n);
    const paidTotal = ugxPaid.reduce((s, o) => s + BigInt(o.totalMinor), 0n);
    const waitingTotal = openTabs.filter((o) => o.currency === 'UGX').reduce((s, o) => s + BigInt(o.totalMinor), 0n);

    const byMethod = new Map<PosPaymentMethod, bigint>();
    const items = new Map<string, { qty: number; total: bigint }>();
    for (const o of ugxPaid) {
      const amt = BigInt(o.totalMinor);
      byMethod.set(o.paymentMethod, (byMethod.get(o.paymentMethod) ?? 0n) + amt);
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
    return { paid, voided, paidTotal, usdPaidMinor, waitingTotal, byMethod, byWaiter, topItems };
  }, [todayOrders, openTabs]);

  const handover = useMutation({
    mutationFn: () =>
      post<{ transferredCount: number; toStaffName: string }>('/pos/orders/handover-shift', {
        fromServedByName: from.trim() || undefined,
        toStaffName: to.trim(),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      setTo('');
      setNotes('');
      toast.success(`${res.transferredCount} open bill(s) handed to ${res.toStaffName}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not hand over shift'),
  });

  const maxMethod = [...report.byMethod.values()].reduce((m, v) => (v > m ? v : m), 0n);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Shift report & handover"
      description="Today's takings by method, outlet and waiter, and handing open bills to the next shift."
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Paid today" value={money(report.paidTotal, 'UGX')} tone="text-success" />
          <Tile label="Waiting payment" value={money(report.waitingTotal, 'UGX')} tone="text-warning" />
          <Tile label="Receipts" value={String(report.paid.length)} />
          <Tile label="Open bills" value={String(openTabs.length)} sub={report.voided ? `${report.voided} voided today` : undefined} />
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
                    <tr key={waiter}>
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
            Moves the outgoing waiter&apos;s open bills to the incoming waiter and posts a handover note.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <TextInput label="From" placeholder="Blank = all open bills" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextInput label="To" required placeholder="Incoming waiter" value={to} onChange={(e) => setTo(e.target.value)} />
            <TextInput label="Note" placeholder="e.g. Table 4 paying by MoMo" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={handover.isPending}
              disabled={to.trim().length < 2 || openTabs.length === 0}
            >
              Hand over open bills
            </Button>
          </div>
        </form>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="size-3.5" />}>
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
