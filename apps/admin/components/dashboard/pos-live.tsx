'use client';
import Link from 'next/link';
import { ArrowRight, ChefHat, CircleCheckBig, Wallet } from 'lucide-react';
import type { PosOrderDTO } from '@reberon/contracts';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Section } from '@/components/ui/bits';
import { AgeBadge } from '@/components/pos/pos-kit';

/** Restaurant & bar right now: what's cooking, what's ready, and which bills are still open. */
export function PosLive({ orders, now }: { orders: PosOrderDTO[]; now: number }) {
  const open = orders
    .filter((o) => !o.isSettled && o.status !== 'CANCELLED')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const cooking = orders.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING').length;
  const ready = orders.filter((o) => o.status === 'READY').length;
  const waitingUgx = open.filter((o) => o.currency === 'UGX').reduce((s, o) => s + BigInt(o.totalMinor), 0n);

  const stats = [
    { label: 'In the kitchen', value: String(cooking), icon: ChefHat, tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'Ready to serve', value: String(ready), icon: CircleCheckBig, tone: ready ? 'text-success' : 'text-fg-muted' },
    { label: `${open.length} open bills`, value: money(waitingUgx, 'UGX'), icon: Wallet, tone: open.length ? 'text-warning' : 'text-fg-muted' },
  ];

  return (
    <Section
      title="Restaurant & Bar · Live"
      description="Tickets in progress and bills waiting for payment"
      actions={
        <Link href="/pos" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-fg-muted hover:border-line-strong hover:text-fg">
          Open POS <ArrowRight className="size-3" />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
            <s.icon className={cn('size-4', s.tone)} />
            <p className="mt-1 truncate font-display text-[15px] font-extrabold tabular">{s.value}</p>
            <p className="truncate text-[11px] text-fg-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[12px] text-fg-muted">
          No bills waiting — every table is settled.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {open.slice(0, 5).map((o) => (
            <li key={o.id}>
              <Link href="/pos" className="-mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold">
                    {o.tableOrRoom || 'Counter'}
                    {o.status === 'READY' && (
                      <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[9.5px] font-extrabold uppercase text-success">Ready</span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-fg-muted">
                    {o.items.reduce((a, i) => a + i.quantity, 0)} items · {o.servedByName || 'Staff'}
                  </span>
                </span>
                <AgeBadge iso={o.createdAt} now={now} target={45} />
                <span className="w-24 text-right font-mono text-[12px] font-bold tabular">{money(o.totalMinor, o.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
