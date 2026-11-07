'use client';
import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus, Table2 } from 'lucide-react';
import type { MoneyByCurrency } from '@reberon/contracts';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';

export const big = (v?: string | null) => BigInt(v ?? '0');
/** UGX always, USD appended only when there is some — the two are never added together. */
export const mm = (m?: MoneyByCurrency, opts?: { compact?: boolean }) => {
  if (!m) return '—';
  const u = big(m.UGX);
  const d = big(m.USD);
  const ugx = opts?.compact ? compact(u) : money(u, 'UGX');
  return d !== 0n ? `${ugx} + ${money(d, 'USD')}` : ugx;
};
export const compact = (v: bigint) => {
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1e9) return `UGX ${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `UGX ${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `UGX ${Math.round(n / 1e3)}K`;
  return `UGX ${n}`;
};
export const fmtDay = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
export const fmtMonth = (m: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));

/** Percentage change, or points for rates. Good/bad by direction; never colour alone (arrow + sign). */
export function Delta({ now, before, kind = 'pct', invert, label }: { now: number | bigint; before: number | bigint; kind?: 'pct' | 'pts'; invert?: boolean; label?: string }) {
  const n = Number(now);
  const b = Number(before);
  let v: number | null;
  if (kind === 'pts') v = Math.round((n - b) * 10) / 10;
  else v = b === 0 ? (n === 0 ? 0 : null) : Math.round(((n - b) / Math.abs(b)) * 1000) / 10;
  const up = v === null ? n > 0 : v > 0;
  const flat = v === 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular', good === null ? 'bg-surface-2 text-fg-muted' : good ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')} title={label}>
      <Icon className="size-3" aria-hidden />
      {v === null ? 'new' : `${v > 0 ? '+' : ''}${v}${kind === 'pts' ? ' pts' : '%'}`}
    </span>
  );
}

export function Kpi({ label, value, sub, delta, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode; href?: string; tone?: 'good' | 'bad' }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag href={href} className={cn('card flex flex-col gap-1 p-3.5', href && 'transition-colors hover:border-line-strong')}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cn('text-xl font-bold leading-tight tracking-tight tabular', tone === 'good' && 'text-success', tone === 'bad' && 'text-danger')}>{value}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">{delta}{sub}</div>
    </Tag>
  );
}

const SERIES = [
  { key: 'roomUGX', label: 'Rooms', color: 'var(--viz-1)' },
  { key: 'fnbUGX', label: 'Food & drink', color: 'var(--viz-2)' },
  { key: 'otherUGX', label: 'Extras, spa & other', color: 'var(--viz-3)' },
] as const;
type DailyRow = { date: string; roomUGX: string; fnbUGX: string; otherUGX: string; collectedUGX: string; expensesUGX: string; occupancy: number };

/** Daily revenue by department (stacked, UGX) with a hover tooltip, legend and table view. */
export function RevenueTrend({ daily, height = 200 }: { daily: DailyRow[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = daily.map((d) => SERIES.reduce((a, s) => a + Number(d[s.key]), 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, max / 2, max];
  const h = hover !== null ? daily[hover] : null;
  return (
    <figure>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-3 text-[11.5px] text-fg-muted">
          {SERIES.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</li>)}
        </ul>
        <button type="button" onClick={() => setTable((v) => !v)} className="no-print flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-fg-muted hover:bg-surface-2" aria-pressed={table}>
          {table ? <BarChart3 className="size-3" /> : <Table2 className="size-3" />} {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <div className="scrollbar-thin max-h-[260px] overflow-y-auto">
          <table className="w-full text-xs tabular">
            <thead className="sticky top-0 bg-surface text-left text-fg-subtle"><tr><th className="py-1 font-medium">Day</th>{SERIES.map((s) => <th key={s.key} className="py-1 text-right font-medium">{s.label}</th>)}<th className="py-1 text-right font-medium">Collected</th><th className="py-1 text-right font-medium">Spent</th><th className="py-1 text-right font-medium">Occ.</th></tr></thead>
            <tbody>{daily.map((d) => <tr key={d.date} className="border-t border-line"><td className="py-1">{fmtDay(d.date)}</td>{SERIES.map((s) => <td key={s.key} className="py-1 text-right">{money(d[s.key], 'UGX')}</td>)}<td className="py-1 text-right">{money(d.collectedUGX, 'UGX')}</td><td className="py-1 text-right">{money(d.expensesUGX, 'UGX')}</td><td className="py-1 text-right">{d.occupancy}%</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex gap-2" style={{ height }}>
          <div className="flex w-14 flex-col justify-between pb-5 text-right text-[10.5px] tabular text-fg-subtle">
            {[...ticks].reverse().map((t) => <span key={t} className="-translate-y-1/2 leading-none">{compact(BigInt(Math.round(t))).replace('UGX ', '')}</span>)}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-0 bottom-5">
              {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / max) * 100}%` }} />)}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {daily.map((d, i) => (
                  <button key={d.date} type="button" className="relative flex h-full flex-1 items-end justify-center outline-none" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${fmtDay(d.date)}: ${money(totals[i]!, 'UGX')}`}>
                    <span className={cn('flex w-full max-w-7 flex-col-reverse gap-[2px] transition-opacity', hover !== null && hover !== i && 'opacity-45')} style={{ height: `${(totals[i]! / max) * 100}%` }}>
                      {SERIES.map((s, si) => {
                        const v = Number(d[s.key]);
                        if (!v) return null;
                        const isTop = SERIES.slice(si + 1).every((x) => !Number(d[x.key]));
                        return <span key={s.key} className={cn('block w-full', isTop && 'rounded-t-[4px]')} style={{ flexGrow: v, minHeight: 2, background: s.color }} />;
                      })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10.5px] text-fg-subtle">
              <span>{daily[0] && fmtDay(daily[0].date)}</span>
              <span>{daily.length > 2 && fmtDay(daily[Math.floor(daily.length / 2)]!.date)}</span>
              <span>{daily.length > 1 && fmtDay(daily[daily.length - 1]!.date)}</span>
            </div>
            {h && (
              <div className="pointer-events-none absolute z-10 min-w-44 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-2 text-[11px] shadow-[var(--shadow-soft)]" style={{ left: `${Math.min(85, Math.max(15, ((hover! + 0.5) / daily.length) * 100))}%`, top: -4 }} role="status">
                <p className="mb-1 font-semibold">{fmtDay(h.date)} · {h.occupancy}% occupied</p>
                {SERIES.map((s) => <p key={s.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-fg-muted"><span className="size-2 rounded-[2px]" style={{ background: s.color }} />{s.label}</span><span className="tabular">{money(h[s.key], 'UGX')}</span></p>)}
                <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-semibold"><span>Total</span><span className="tabular">{money(totals[hover!]!, 'UGX')}</span></p>
                <p className="flex justify-between gap-3 text-fg-muted"><span>Collected</span><span className="tabular">{money(h.collectedUGX, 'UGX')}</span></p>
              </div>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/** Horizontal share bars with the value in text ink at the end. */
export function ShareBars({ rows }: { rows: { label: ReactNode; value: number; display: ReactNode; sub?: ReactNode }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid gap-1 text-xs">
          <div className="flex items-baseline justify-between gap-3"><span className="font-medium text-fg">{r.label}</span><span className="tabular text-fg">{r.display}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, background: 'var(--series)' }} /></div>
          {r.sub && <div className="text-[11px] text-fg-subtle">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ head, rows, foot, empty = 'Nothing in this period.' }: { head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[]; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-xs text-fg-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle"><tr>{head.map((h, i) => <th key={i} className={cn('px-2 py-2', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i} className="hover:bg-surface-2/40">{r.map((c, j) => <td key={j} className={cn('px-2 py-2', j > 0 && 'text-right tabular')}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot className="border-t-2 border-line-strong font-semibold"><tr>{foot.map((c, j) => <td key={j} className={cn('px-2 py-2', j > 0 && 'text-right tabular')}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
