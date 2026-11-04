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
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <section className="fade-in flex items-center gap-3.5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/12 via-emerald-500/5 to-transparent px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-md">
          <PartyPopper className="size-5" />
        </span>
        <div>
          <p className="text-[14px] font-bold text-fg">All clear — nothing is waiting on you.</p>
          <p className="text-[12px] text-fg-muted">Rooms, guests and bills are all up to date. New work will appear here the moment it arrives.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Needs your attention" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-2 text-[13px] font-bold">
          <span className="relative flex size-2.5">
            {urgent > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-60" />}
            <span className={cn('relative inline-flex size-2.5 rounded-full', urgent > 0 ? 'bg-rose-500' : 'bg-amber-500')} />
          </span>
          Needs you now
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular text-fg-muted">{sorted.length}</span>
        </h2>
        {sorted.length > VISIBLE && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[12px] font-semibold text-fg-muted hover:text-fg">
            {expanded ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((it) => {
          const t = TONE[it.tone];
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              className={cn('fade-in group flex items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md', t.card)}
            >
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', t.icon)}>
                <Icon className="size-5" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className={cn('font-display text-xl font-extrabold leading-none tabular', t.count)}>{it.count}</span>
                  <span className="truncate text-[13px] font-bold text-fg">{it.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">{it.sub}</span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 rounded-lg bg-surface px-2.5 py-1.5 text-[11.5px] font-bold text-fg shadow-2xs ring-1 ring-line transition group-hover:ring-line-strong sm:inline-flex">
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
