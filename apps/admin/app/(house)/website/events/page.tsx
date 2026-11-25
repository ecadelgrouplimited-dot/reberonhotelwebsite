'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus, Users } from 'lucide-react';
import { EVENT_CATEGORY_LABEL, type EventAdminRowDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get, thumb } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { useScreenActions } from '@/components/os/screen-actions';
import { useRouter } from 'next/navigation';

const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date(iso));

export default function EventsAdmin() {
  const can = useCan();
  const router = useRouter();
  const [view, setView] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const { data, isLoading } = useQuery({ queryKey: ['/events'], queryFn: () => get<EventAdminRowDTO[]>('/events') });
  const rows = useMemo(() => {
    const all = data ?? [];
    const list = view === 'upcoming' ? all.filter((e) => !e.past).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : view === 'past' ? all.filter((e) => e.past) : all;
    return list;
  }, [data, view]);
  useScreenActions('Events', [...(can('content:write') ? [{ label: 'New event', icon: Plus, key: 'n', onSelect: () => router.push('/website/events/new') }] : [])]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Events"
        description="What's on at the hotel. Guests book places online; when it is full they join a waiting list that confirms itself as places free up."
        actions={can('content:write') && <Button variant="primary" href="/website/events/new" icon={<Plus className="size-4" />}>New event</Button>}
      />
      <div className="mb-3 flex rounded-lg border border-line bg-surface p-0.5 sm:w-fit">
        {(['upcoming', 'past', 'all'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-semibold capitalize', view === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>
            {v}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        {isLoading && <Skeleton className="m-4 h-40" />}
        {!isLoading && !rows.length && (
          <Empty icon={<CalendarDays className="size-4" />} title={view === 'past' ? 'No past events' : 'Nothing planned yet'} body="A live-music night, a coffee walk, a Sipi trail run — put it here and the website takes bookings." action={can('content:write') ? <Button size="sm" variant="primary" href="/website/events/new" icon={<Plus className="size-3.5" />}>New event</Button> : undefined} />
        )}
        <ul className="divide-y divide-line">
          {rows.map((e) => {
            const pct = e.capacity ? Math.min(100, Math.round((e.confirmedSeats / e.capacity) * 100)) : null;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-surface-2/60">
                <Link href={`/website/events/${e.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">{e.cover && <img src={thumb(e.cover.id, 320)} alt="" className="size-full object-cover" />}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t(e.title)}</span>
                    <span className="text-[12.5px] text-fg-muted">
                      {when(e.startsAt)} · {EVENT_CATEGORY_LABEL[e.category]}
                      {e.venue ? ` · ${e.venue}` : ''}
                    </span>
                  </span>
                </Link>
                <span className="w-40 text-[12px]">
                  <span className="flex justify-between text-fg-muted">
                    <span>{e.confirmedSeats}{e.capacity ? ` / ${e.capacity}` : ''} booked</span>
                    {e.waitlistedSeats > 0 && <span className="text-amber-600">+{e.waitlistedSeats} waiting</span>}
                  </span>
                  {pct !== null && (
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </span>
                {e.featured && <Pill tone="amber">Featured</Pill>}
                <Pill tone={e.status === 'PUBLISHED' ? 'green' : e.status === 'CANCELLED' ? 'red' : 'neutral'} dot>
                  {e.status === 'PUBLISHED' ? (e.past ? 'Happened' : 'Published') : e.status === 'CANCELLED' ? 'Cancelled' : 'Draft'}
                </Pill>
                {can('events:manage') && (
                  <Button size="sm" variant="secondary" href={`/website/events/${e.id}/guests`} icon={<Users className="size-3.5" />}>
                    Guests{e.registrations ? ` · ${e.registrations}` : ''}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
