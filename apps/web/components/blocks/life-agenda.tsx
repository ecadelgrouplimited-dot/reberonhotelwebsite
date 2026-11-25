'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarHeart } from 'lucide-react';
import { EVENT_CATEGORY_LABEL, t, type EventCardDTO, type EventCategory } from '@reberon/contracts';
import { cn } from '@/lib/cn';
import { evMonthKey, evMonthLabel, evWhen } from '@/lib/life-format';
import { EventCard } from './life-cards';

/** Upcoming events by month, filterable by kind; past ones folded underneath. */
export function EventAgenda({ upcoming, past }: { upcoming: EventCardDTO[]; past: EventCardDTO[] }) {
  const [cat, setCat] = useState<EventCategory | 'ALL'>('ALL');
  const cats = useMemo(() => [...new Set(upcoming.map((e) => e.category))], [upcoming]);
  const shown = cat === 'ALL' ? upcoming : upcoming.filter((e) => e.category === cat);
  const months = useMemo(() => {
    const m = new Map<string, EventCardDTO[]>();
    for (const e of shown) m.set(evMonthKey(e.startsAt), [...(m.get(evMonthKey(e.startsAt)) ?? []), e]);
    return [...m];
  }, [shown]);

  return (
    <div className="grid gap-14">
      {cats.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events">
          {(['ALL', ...cats] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-colors', cat === c ? 'border-fg bg-fg text-[var(--bg)]' : 'border-line-strong text-fg-muted hover:border-fg hover:text-fg')}
            >
              {c === 'ALL' ? 'Everything' : EVENT_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      {months.length ? (
        months.map(([key, list]) => (
          <section key={key} aria-label={evMonthLabel(list[0]!.startsAt)}>
            <h3 className="mb-6 flex items-center gap-4 font-display text-step-2">
              {evMonthLabel(list[0]!.startsAt)}
              <span className="h-px flex-1 bg-line" aria-hidden />
            </h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.map((e, i) => (
                <EventCard key={e.id} e={e} i={i} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="grid justify-items-center gap-3 rounded-[var(--r-lg)] border border-dashed border-line-strong px-6 py-14 text-center">
          <CalendarHeart className="size-8 text-accent" aria-hidden />
          <p className="text-step-1 font-medium">Nothing on the calendar just yet</p>
          <p className="max-w-md text-fg-muted">New evenings are added often. Ask us about private gatherings, or check back soon.</p>
        </div>
      )}

      {past.length > 0 && (
        <details className="group rounded-[var(--r-lg)] border border-line p-5 md:p-6">
          <summary className="cursor-pointer list-none text-step-1 font-medium marker:hidden">
            <span className="inline-flex items-center gap-2">Past events <span className="text-sm font-normal text-fg-muted">({past.length})</span></span>
          </summary>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {past.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.slug}`} className="block rounded-[var(--r-md)] p-3 hover:bg-surface-2">
                  <span className="block font-medium">{t(e.title)}</span>
                  <span className="text-sm text-fg-muted">{evWhen(e)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
