'use client';
import Link from 'next/link';
import { CreditCard, Edit3, Plus, PlusCircle, Settings2, Users } from 'lucide-react';
import type { PosOrderDTO, PosTableDTO } from '@reberon/contracts';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/bits';
import { AgeBadge } from './pos-kit';

/** Tables in display order, grouped by area (areas appear in the order of their first table). */
export function byArea(tables: PosTableDTO[]) {
  const groups = new Map<string, PosTableDTO[]>();
  for (const t of tables) groups.set(t.area, [...(groups.get(t.area) ?? []), t]);
  return [...groups.entries()];
}

const openTotal = (t: PosTableDTO) =>
  t.openBills.filter((b) => b.currency === 'UGX').reduce((s, b) => s + BigInt(b.totalMinor), 0n);

/** The floor at a glance: which tables are free, which are eating, and for how long. */
export function FloorView({
  tables,
  openTabs,
  now,
  canManage,
  onNewOrder,
  onCharge,
  onRound,
  onEdit,
}: {
  tables: PosTableDTO[];
  openTabs: PosOrderDTO[];
  now: number;
  canManage: boolean;
  onNewOrder: (t: PosTableDTO) => void;
  onCharge: (o: PosOrderDTO) => void;
  onRound: (o: PosOrderDTO) => void;
  onEdit: (o: PosOrderDTO) => void;
}) {
  const byId = new Map(openTabs.map((o) => [o.id, o]));
  const onTables = new Set(tables.flatMap((t) => t.openBills.map((b) => b.id)));
  const loose = openTabs.filter((o) => !onTables.has(o.id));
  const busy = tables.filter((t) => t.openBills.length > 0).length;

  if (!tables.length) {
    return (
      <div className="card">
        <Empty
          icon={<Users className="size-5" />}
          title="No tables set up yet"
          body="Add your tables, terrace spots and lounges once — waiters then tap a table to start a bill."
          action={
            canManage ? (
              <Button variant="primary" size="sm" href="/pos/tables" icon={<Plus className="size-3.5" />}>
                Set up tables
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[12px] font-semibold text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            <span className="tabular text-fg">{tables.length - busy}</span> free
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" />
            <span className="tabular text-fg">{busy}</span> occupied
          </span>
        </div>
        {canManage && (
          <Link
            href="/pos/tables"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-semibold text-fg-muted hover:text-fg"
          >
            <Settings2 className="size-3.5" /> Manage tables
          </Link>
        )}
      </div>

      {byArea(tables).map(([area, list]) => (
        <section key={area}>
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
            {area}
            <span className="h-px flex-1 bg-line" />
          </h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {list.map((t) => {
              const bills = t.openBills.map((b) => byId.get(b.id)).filter((o): o is PosOrderDTO => !!o);
              const first = bills[0];
              const occupied = t.openBills.length > 0;
              const ready = bills.some((o) => o.status === 'READY');
              return (
                <article
                  key={t.id}
                  className={cn(
                    'relative flex min-h-[128px] flex-col rounded-2xl border p-3 transition',
                    occupied
                      ? 'border-amber-500/45 bg-amber-500/[0.07]'
                      : 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/60 hover:shadow-md',
                    ready && 'ring-2 ring-emerald-500/50',
                  )}
                >
                  {!occupied && (
                    <button
                      type="button"
                      onClick={() => onNewOrder(t)}
                      className="absolute inset-0 rounded-2xl"
                      aria-label={`New order at ${t.name}`}
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-[16px] font-extrabold leading-tight">{t.name}</p>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-fg-subtle">
                      <Users className="size-3" />
                      {t.seats}
                    </span>
                  </div>
                  {occupied ? (
                    <>
                      <p className="mt-1 truncate text-[11px] text-fg-muted">
                        {first?.servedByName || t.openBills[0]!.servedByName || 'Staff'}
                        {t.openBills.length > 1 && ` · ${t.openBills.length} bills`}
                        {ready && <span className="font-bold text-success"> · food ready</span>}
                      </p>
                      <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                        <span className="font-mono text-[14px] font-extrabold tabular">{money(openTotal(t), 'UGX')}</span>
                        <AgeBadge iso={t.openBills[0]!.createdAt} now={now} target={45} />
                      </div>
                      {first && (
                        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1">
                          <Button size="sm" variant="primary" icon={<CreditCard className="size-3" />} onClick={() => onCharge(first)}>
                            Charge
                          </Button>
                          <Button size="sm" variant="secondary" icon={<PlusCircle className="size-3" />} onClick={() => onRound(first)} aria-label="Add a round" title="Add a round" />
                          <Button size="sm" variant="secondary" icon={<Edit3 className="size-3" />} onClick={() => onEdit(first)} aria-label="Edit bill" title="Edit bill" />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-[11px] font-semibold text-success">Free</p>
                      <p className="mt-auto inline-flex items-center gap-1 pt-2 text-[11.5px] font-bold text-fg-muted">
                        <Plus className="size-3.5" /> New order
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {loose.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
            Other open bills
            <span className="h-px flex-1 bg-line" />
          </h3>
          <div className="flex flex-wrap gap-2">
            {loose.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onCharge(o)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-left text-[12px] hover:border-amber-500/70"
              >
                <span className="font-bold">{o.tableOrRoom || o.orderNumber}</span>
                <span className="font-mono tabular text-fg-muted">{money(o.totalMinor, o.currency)}</span>
                <AgeBadge iso={o.createdAt} now={now} target={45} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Compact table chooser for the order ticket. Occupied tables are marked, never blocked. */
export function TableChips({
  tables,
  value,
  onPick,
}: {
  tables: PosTableDTO[];
  value: string | null;
  onPick: (t: PosTableDTO) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {byArea(tables).map(([area, list], gi) => (
        <div key={area} className={cn('flex shrink-0 items-center gap-1', gi > 0 && 'border-l border-line pl-1.5')}>
          {list.map((t) => {
            const busy = t.openBills.length > 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick(t)}
                title={busy ? `${area} · has an open bill` : area}
                className={cn(
                  'relative shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition',
                  value === t.id
                    ? 'bg-accent text-white'
                    : busy
                      ? 'bg-amber-500/15 text-warning hover:bg-amber-500/25'
                      : 'bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                {t.name}
                {busy && value !== t.id && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
