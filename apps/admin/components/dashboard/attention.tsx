'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, PartyPopper, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/bits';

export type AttentionTone = 'red' | 'amber' | 'blue' | 'green';

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  icon: LucideIcon;
  count: number;
  title: string;
  sub: string;
  cta: string;
  href: string;
}

const RANK: Record<AttentionTone, number> = { red: 0, green: 1, amber: 2, blue: 3 };

const TONE: Record<AttentionTone, { card: string; icon: string; count: string; dot: string }> = {
  red: {
    card: 'border-rose-500/35 bg-rose-500/[0.06] hover:border-rose-500/60',
    icon: 'bg-rose-500 text-white',
    count: 'text-danger',
    dot: 'bg-rose-500',
  },
  amber: {
    card: 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/55',
    icon: 'bg-amber-500/15 text-warning',
    count: 'text-warning',
    dot: 'bg-amber-500',
  },
  green: {
    card: 'border-emerald-500/35 bg-emerald-500/[0.06] hover:border-emerald-500/60',
    icon: 'bg-emerald-500 text-white',
    count: 'text-success',
    dot: 'bg-emerald-500',
  },
  blue: {
    card: 'border-line bg-surface hover:border-line-strong',
    icon: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    count: 'text-fg',
    dot: 'bg-sky-500',
  },
};

const VISIBLE = 6;

/** Everything waiting on this person, most urgent first, each with the one action that clears it. */
export function AttentionRail({ items, loading }: { items: AttentionItem[]; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => RANK[a.tone] - RANK[b.tone] || b.count - a.count);
  const shown = expanded ? sorted : sorted.slice(0, VISIBLE);
  const urgent = sorted.filter((i) => i.tone === 'red').length;

  if (loading) {
    return (
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <p className="fade-in flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-[12.5px] font-semibold text-success">
        <PartyPopper className="size-4 shrink-0" />
        All clear — nothing is waiting on you.
      </p>
    );
  }

  return (
    <section aria-label="Needs your attention" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-fg-muted">
          <span className={cn('size-2 rounded-full', urgent > 0 ? 'animate-pulse bg-rose-500' : 'bg-amber-500')} />
          Needs you · {sorted.length}
        </h2>
        {sorted.length > VISIBLE && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[12px] font-semibold text-fg-muted hover:text-fg">
            {expanded ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((it) => {
          const t = TONE[it.tone];
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              title={it.sub}
              className={cn('fade-in group flex h-11 items-center gap-2.5 rounded-lg border px-2.5 transition', t.card)}
            >
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', t.icon)}>
                <Icon className="size-3.5" strokeWidth={2.2} />
              </span>
              <span className={cn('font-display text-[15px] font-extrabold tabular', t.count)}>{it.count}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{it.title}</span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-bold text-fg-muted group-hover:text-fg">
                {it.cta}
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
