'use client';
import { useState } from 'react';
import {
  Ban,
  BellRing,
  ChefHat,
  CircleCheckBig,
  CreditCard,
  Edit3,
  FileText,
  Flame,
  PlusCircle,
  Printer,
  Receipt,
  UtensilsCrossed,
} from 'lucide-react';
import type { PosOrderDTO, PosOrderStatus, PosOutletDTO } from '@reberon/contracts';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/bits';
import { printDocument } from '@/components/documents/documents-panel';
import { AgeBadge, PAYMENT_LABELS, printPosSlip } from './pos-kit';

const NEXT_STATUS: Partial<Record<PosOrderStatus, { to: PosOrderStatus; label: string }>> = {
  PENDING: { to: 'PREPARING', label: 'Start' },
  PREPARING: { to: 'READY', label: 'Ready' },
  READY: { to: 'COMPLETED', label: 'Served' },
};

const STATUS_LABEL: Record<PosOrderStatus, string> = {
  PENDING: 'New',
  PREPARING: 'Cooking',
  READY: 'Ready',
  COMPLETED: 'Served',
  CANCELLED: 'Void',
};

const STATUS_TONE: Record<PosOrderStatus, 'amber' | 'blue' | 'green' | 'neutral' | 'red'> = {
  PENDING: 'amber',
  PREPARING: 'blue',
  READY: 'green',
  COMPLETED: 'neutral',
  CANCELLED: 'red',
};

const COLUMNS: { status: PosOrderStatus; title: string; icon: typeof Flame; head: string }[] = [
  { status: 'PENDING', title: 'New', icon: BellRing, head: 'border-t-amber-500' },
  { status: 'PREPARING', title: 'Cooking', icon: Flame, head: 'border-t-sky-500' },
  { status: 'READY', title: 'Ready to serve', icon: CircleCheckBig, head: 'border-t-emerald-500' },
];

/** Kitchen display: one column per stage, oldest ticket first, one tap moves a ticket on. */
export function KitchenBoard({
  orders,
  outlets,
  now,
  targetOf,
  onAdvance,
  busyId,
}: {
  orders: PosOrderDTO[];
  outlets: PosOutletDTO[];
  now: number;
  targetOf: (o: PosOrderDTO) => number;
  onAdvance: (id: string, status: PosOrderStatus) => void;
  busyId: string | null;
}) {
  const [outletId, setOutletId] = useState('ALL');
  const shown = orders
    .filter((o) => outletId === 'ALL' || o.outletId === outletId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return (
    <div className="space-y-3">
      {outlets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ id: 'ALL', name: 'All stations' }, ...outlets].map((o) => {
            const count = orders.filter((x) => o.id === 'ALL' || x.outletId === o.id).length;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutletId(o.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition',
                  outletId === o.id ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-muted hover:text-fg',
                )}
              >
                {o.name}
                <span className="rounded-full bg-black/10 px-1.5 text-[10.5px] tabular dark:bg-white/15">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = shown.filter((o) => o.status === col.status);
          const Icon = col.icon;
          return (
            <section key={col.status} className={cn('min-w-0 rounded-2xl border border-line border-t-4 bg-surface-2/40 p-2.5', col.head)}>
              <header className="mb-2 flex items-center justify-between px-1">
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold">
                  <Icon className="size-4" /> {col.title}
                </h3>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold tabular">{list.length}</span>
              </header>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-[12px] text-fg-subtle">
                  {col.status === 'PENDING' ? 'No new tickets — kitchen is calm.' : 'Nothing here.'}
                </p>
              ) : (
                <div className="grid gap-2">
                  {list.map((o) => {
                    const next = NEXT_STATUS[o.status];
                    return (
                      <article key={o.id} className="fade-in rounded-xl border border-line bg-surface p-3 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-extrabold leading-tight">{o.tableOrRoom || 'Counter'}</p>
                            <p className="truncate text-[11px] text-fg-subtle">
                              {o.orderNumber} · {o.outletName} · {o.servedByName || 'Staff'}
                            </p>
                          </div>
                          <AgeBadge iso={o.createdAt} now={now} target={targetOf(o)} />
                        </div>
                        <ul className="mt-2 grid gap-1 text-[13px]">
                          {o.items.map((it) => (
                            <li key={it.id}>
                              <span className="mr-1.5 inline-block min-w-7 rounded bg-fg px-1.5 text-center font-mono text-[12px] font-bold text-bg">
                                {it.quantity}
                              </span>
                              <span className="font-semibold">{it.itemName}</span>
                              {it.notes && (
                                <span className="mt-0.5 block pl-9 text-[11.5px] font-semibold text-warning">↳ {it.notes}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {o.notes && (
                          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11.5px] font-medium text-warning">
                            {o.notes}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {next && (
                            <Button
                              size="touch"
                              variant={o.status === 'READY' ? 'dark' : 'primary'}
                              className="flex-1"
                              loading={busyId === o.id}
                              onClick={() => onAdvance(o.id, next.to)}
                            >
                              {next.label}
                            </Button>
                          )}
                          <Button
                            size="touch"
                            variant="secondary"
                            icon={<Printer className="size-3.5" />}
                            onClick={() => printPosSlip(o.id, 'KOT')}
                            title="Print kitchen ticket"
                          >
                            KOT
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** A bill as the waiter sees it: where, how long, how much, and what to do next. */
export function BillCard({
  order: o,
  now,
  onCharge,
  onRound,
  onEdit,
  onVoid,
}: {
  order: PosOrderDTO;
  now: number;
  onCharge: () => void;
  onRound: () => void;
  onEdit: () => void;
  onVoid: () => void;
}) {
  const open = !o.isSettled && o.status !== 'CANCELLED';
  const count = o.items.reduce((a, i) => a + i.quantity, 0);
  return (
    <article
      className={cn(
        'card flex flex-col p-3.5 transition',
        open && 'border-amber-500/45',
        o.status === 'READY' && open && 'border-emerald-500/60 ring-1 ring-emerald-500/30',
        o.status === 'CANCELLED' && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold leading-tight">{o.tableOrRoom || 'Counter'}</p>
          <p className="truncate text-[11.5px] text-fg-muted">
            {o.customerName || 'Walk-in'} · {o.servedByName || 'Staff'}
          </p>
        </div>
        {open ? (
          <AgeBadge iso={o.createdAt} now={now} target={45} />
        ) : (
          <Pill tone={o.status === 'CANCELLED' ? 'red' : 'green'} dot>
            {o.status === 'CANCELLED' ? 'Void' : `Paid · ${PAYMENT_LABELS[o.paymentMethod]}`}
          </Pill>
        )}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-subtle">
        <span className="shrink-0 whitespace-nowrap font-mono font-semibold">{o.orderNumber}</span>
        <span>·</span>
        <span className="min-w-0 truncate">{o.outletName}</span>
        {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
          <Pill tone={STATUS_TONE[o.status]} dot className="ml-auto shrink-0">
            {o.status === 'READY' ? (
              <>
                <UtensilsCrossed className="size-3" /> Ready
              </>
            ) : o.status === 'PREPARING' ? (
              <>
                <ChefHat className="size-3" /> Cooking
              </>
            ) : (
              STATUS_LABEL[o.status]
            )}
          </Pill>
        )}
      </div>

      <ul className="my-2.5 grid flex-1 content-start gap-1 border-y border-line/70 py-2 text-xs">
        {o.items.slice(0, 5).map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="mr-1 font-mono font-bold">{it.quantity}×</span>
              {it.itemName}
              {it.notes && <span className="text-warning"> · {it.notes}</span>}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-fg-muted tabular">{money(it.totalMinor, o.currency)}</span>
          </li>
        ))}
        {o.items.length > 5 && <li className="text-[11px] text-fg-subtle">+ {o.items.length - 5} more lines</li>}
      </ul>

      <div className="flex items-end justify-between">
        <span className="text-[11px] text-fg-muted">
          {count} item{count === 1 ? '' : 's'}
          {o.discountMinor !== '0' && ` · −${money(o.discountMinor, o.currency)}`}
        </span>
        <span className="font-display text-lg font-extrabold tabular">{money(o.totalMinor, o.currency)}</span>
      </div>

      {open ? (
        <>
          <div className="mt-2.5 grid grid-cols-[1fr_auto_auto] gap-1.5">
            <Button size="touch" variant="primary" icon={<CreditCard className="size-3.5" />} onClick={onCharge}>
              Charge
            </Button>
            <Button size="touch" variant="secondary" icon={<PlusCircle className="size-3.5" />} onClick={onRound} title="Add a round">
              Round
            </Button>
            <Button size="touch" variant="secondary" icon={<Edit3 className="size-3.5" />} onClick={onEdit} title="Edit bill" aria-label="Edit bill" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-1">
              <SlipButton onClick={() => printPosSlip(o.id, 'BILL')} icon={FileText} label="Bill" />
              <SlipButton onClick={() => printPosSlip(o.id, 'KOT')} icon={Printer} label="KOT" />
            </div>
            <button
              type="button"
              onClick={onVoid}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-subtle hover:text-danger"
            >
              <Ban className="size-3" /> Void
            </button>
          </div>
        </>
      ) : (
        o.status !== 'CANCELLED' && (
          <div className="mt-2.5 flex gap-1">
            {o.documentId && (
              <SlipButton onClick={() => printDocument(o.documentId!, '80MM')} icon={Receipt} label="Receipt" />
            )}
            <SlipButton onClick={() => printPosSlip(o.id, 'BILL')} icon={FileText} label="Bill" />
          </div>
        )
      )}
    </article>
  );
}

function SlipButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Printer; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2/60 px-2 py-1 text-[11px] font-semibold text-fg-muted hover:border-line-strong hover:text-fg"
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}
