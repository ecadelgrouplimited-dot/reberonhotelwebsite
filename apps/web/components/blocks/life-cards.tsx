import Link from 'next/link';
import { CalendarDays, Clock, MapPin, Ticket } from 'lucide-react';
import { t, type EventCardDTO } from '@reberon/contracts';
import { MediaImage } from '@/components/ui/media-image';
import { cn } from '@/lib/cn';
import { evAvailability, evCategory, evDay, evMonth, evPrice, evWeekday, evWhen } from '@/lib/life-format';

export function DateTile({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('grid w-16 shrink-0 justify-items-center rounded-[var(--r-md)] bg-[var(--bg)]/95 px-2 py-2 text-center text-fg shadow-lg ring-1 ring-line', className)}>
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">{evMonth(iso)}</span>
      <span className="font-display text-[1.75rem] leading-none">{evDay(iso)}</span>
      <span className="text-[0.68rem] text-fg-muted">{evWeekday(iso)}</span>
    </span>
  );
}

export function EventCard({ e, i = 0, large }: { e: EventCardDTO; i?: number; large?: boolean }) {
  const avail = evAvailability(e);
  return (
    <Link href={`/events/${e.slug}`} className={cn('group zoom-on-hover flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface transition-colors hover:border-line-strong', e.status === 'CANCELLED' && 'opacity-75')} data-reveal style={{ ['--i' as string]: i }}>
      <div className={cn('relative overflow-hidden bg-surface-2', large ? 'aspect-[16/10]' : 'aspect-[4/3]')}>
        {e.cover ? <MediaImage media={e.cover} sizes={large ? '(min-width:1024px) 60vw, 100vw' : '(min-width:1024px) 30vw, (min-width:640px) 50vw, 100vw'} className="absolute inset-0" /> : <span className="absolute inset-0 grid place-items-center text-fg-subtle"><CalendarDays className="size-10" /></span>}
        <DateTile iso={e.startsAt} className="absolute left-4 top-4" />
        {avail && <span className={cn('absolute bottom-4 left-4 rounded-full px-3 py-1 text-xs font-semibold shadow', avail.tone === 'bad' ? 'bg-[#B42318] text-white' : 'bg-[#FDF0E4] text-[#9A4A0C]')}>{avail.text}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
        <p className="eyebrow !text-[0.7rem]">{evCategory(e)}</p>
        <h3 className={cn('font-medium leading-snug group-hover:text-accent', large ? 'text-step-2' : 'text-step-1')}>{t(e.title)}</h3>
        {e.summary && <p className="line-clamp-2 text-fg-muted">{t(e.summary)}</p>}
        <div className="mt-auto grid gap-1.5 pt-2 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-2"><Clock className="size-4 shrink-0" /> {evWhen(e)}</span>
          {e.venue && <span className="inline-flex items-center gap-2"><MapPin className="size-4 shrink-0" /> {e.venue}</span>}
          <span className="inline-flex items-center gap-2 font-medium text-fg"><Ticket className="size-4 shrink-0" /> {evPrice(e)}</span>
        </div>
      </div>
    </Link>
  );
}

