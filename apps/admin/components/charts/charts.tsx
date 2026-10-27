'use client';
import { useState, type ReactNode } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Stat tile: label · value · optional note. Value in the sans face (dataviz contract). */
export function StatTile({ label, value, note, href }: { label: string; value: number | string; note?: string; href?: string }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag href={href} className={cn('card block p-3.5', href && 'transition-colors hover:border-line-strong')}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cn('mt-1.5 font-bold leading-none tracking-tight tabular', String(value).length > 13 ? 'text-base' : 'text-xl')}>{typeof value === 'number' ? value.toLocaleString('en') : value}</p>
      {note && <p className="mt-1 text-[11px] text-fg-muted">{note}</p>}
    </Tag>
  );
}

/** Clean, even maximum so the midpoint tick is a whole number (counts are integers). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / pow);
  const m = (n <= 2 ? 2 : n <= 4 ? 4 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * pow;
  return m % 2 ? m + 1 : m;
}

export function ColumnChart({ data, label, height = 160, caption, max: fixedMax, format = (n: number) => String(n), endLabel = 'Today' }: {
  data: { date: string; count: number }[];
  label: string;
  height?: number;
  caption?: ReactNode;
  max?: number;
  format?: (n: number) => string;
  endLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = fixedMax ?? niceMax(Math.max(1, ...data.map((d) => d.count)));
  const ticks = [0, max / 2, max];
  const fmt = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const total = data.reduce((a, d) => a + d.count, 0);
  const peak = data.reduce((a, d, i) => (d.count > (data[a]?.count ?? 0) ? i : a), 0);

  return (
    <figure>
      <div className="mb-2.5 flex items-center justify-between">
        <figcaption className="text-xs text-fg-muted">
          {caption ?? <>{label} · <span className="font-semibold text-fg tabular">{total}</span> in 30 days</>}
        </figcaption>
        <button type="button" onClick={() => setTable((v) => !v)} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-fg-muted hover:bg-surface-2" aria-pressed={table}>
          {table ? <BarChart3 className="size-3" /> : <Table2 className="size-3" />} {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <div className="scrollbar-thin max-h-[200px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-fg-subtle">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{fmt(d.date)}</td>
                  <td className="py-1 text-right">{format(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex gap-2" style={{ height }}>
          <div className="flex flex-col justify-between pb-5 text-right text-[10.5px] tabular text-fg-subtle">
            {[...ticks].reverse().map((t) => (
              <span key={t} className="-translate-y-1/2 leading-none">{format(t)}</span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-0 bottom-5">
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / max) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {data.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${fmt(d.date)}: ${format(d.count)}`}
                  >
                    <span
                      className={cn('block w-full max-w-6 rounded-t-[3px] transition-opacity', hover !== null && hover !== i && 'opacity-45')}
                      style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 3 : 0, background: 'var(--series)' }}
                    />
                    {i === peak && d.count > 0 && hover === null && (
                      <span className="absolute text-[10.5px] font-semibold tabular text-fg" style={{ bottom: `calc(${(d.count / max) * 100}% + 3px)` }}>
                        {format(d.count)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10.5px] text-fg-subtle">
              <span>{fmt(data[0]!.date)}</span>
              <span>{fmt(data[Math.floor(data.length / 2)]!.date)}</span>
              <span>{endLabel === 'last' ? fmt(data[data.length - 1]!.date) : endLabel}</span>
            </div>
            {hover !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-[var(--shadow-soft)]"
                style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: -8 }}
                role="status"
              >
                <span className="text-fg-muted">{fmt(data[hover]!.date)}</span> · <span className="font-semibold tabular">{format(data[hover]!.count)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars, single series, value at the tip. */
export function BarList({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="grid gap-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[8rem_1fr] items-center gap-2.5 text-xs" title={`${d.label}: ${d.value}`}>
          <span className="truncate text-fg-muted">{d.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 rounded-r-[3px]" style={{ width: `${(d.value / max) * 85}%`, minWidth: 4, background: 'var(--series)' }} />
            <span className="font-semibold tabular">{d.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
