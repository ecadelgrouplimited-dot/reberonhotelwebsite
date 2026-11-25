import Link from 'next/link';
import { ArrowRight, Briefcase, MapPin } from 'lucide-react';
import { t, type EventCardDTO, type JobCardDTO, type LText } from '@reberon/contracts';
import { SectionHeading } from '@/components/ui/section-heading';
import { CookieTableContent } from '@/components/site/cookie-consent';
import { cn } from '@/lib/cn';
import { jobCloses, jobPay, jobType } from '@/lib/life-format';
import { EventAgenda } from './life-agenda';
import { EventCard } from './life-cards';
import type { BlockProps } from './types';

type H = { eyebrow?: LText; heading?: LText; intro?: LText };

/* ───────────────────────── Events ───────────────────────── */

export function EventList({ block }: BlockProps<H & { layout?: 'agenda' | 'cards'; showPast?: boolean; showLink?: boolean }, { events: EventCardDTO[]; past: EventCardDTO[]; total: number }>) {
  const r = block.resolved;
  const cards = block.data.layout === 'cards';
  if (cards && !r?.events.length) return null;
  return (
    <div className="container-x">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} />
        {cards && block.data.showLink && (
          <Link href="/events" className="btn btn-ghost">
            <span className="btn-label">All {r?.total ?? ''} events</span> <ArrowRight className="btn-arrow size-4" />
          </Link>
        )}
      </div>
      {cards ? (
        <div className={cn('grid gap-6', r!.events.length === 1 ? 'max-w-3xl' : r!.events.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3')}>
          {r!.events.map((e, i) => (
            <EventCard key={e.id} e={e} i={i} large={r!.events.length <= 2} />
          ))}
        </div>
      ) : (
        <EventAgenda upcoming={r?.events ?? []} past={r?.past ?? []} />
      )}
    </div>
  );
}

/* ───────────────────────── Careers ───────────────────────── */

export function JobRow({ j }: { j: JobCardDTO }) {
  const pay = jobPay(j);
  const closes = jobCloses(j);
  return (
    <Link href={`/careers/${j.slug}`} className="group grid gap-3 rounded-[var(--r-lg)] border border-line bg-surface p-5 transition-colors hover:border-line-strong md:grid-cols-[1fr_auto] md:items-center md:p-6" data-reveal>
      <div className="min-w-0">
        <h3 className="text-step-1 font-medium group-hover:text-accent">{t(j.title)}</h3>
        {j.summary && <p className="mt-1 line-clamp-2 text-fg-muted">{t(j.summary)}</p>}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-1.5"><Briefcase className="size-4" /> {jobType(j)}{j.openings > 1 ? ` · ${j.openings} openings` : ''}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {j.location}</span>
          {pay && <span className="font-medium text-fg">{pay}</span>}
          {closes && <span className={cn(closes.startsWith('Closes') && 'font-medium text-accent')}>{closes}</span>}
        </p>
      </div>
      <span className="btn btn-secondary justify-self-start md:justify-self-end">
        <span className="btn-label">View &amp; apply</span> <ArrowRight className="btn-arrow size-4" />
      </span>
    </Link>
  );
}

export function JobList({ block }: BlockProps<H & { showOpenApplication?: boolean }, { jobs: JobCardDTO[] }>) {
  const jobs = block.resolved?.jobs ?? [];
  const groups = new Map<string, JobCardDTO[]>();
  for (const j of jobs) groups.set(j.department ?? 'Across the hotel', [...(groups.get(j.department ?? 'Across the hotel') ?? []), j]);
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-12" />
      {jobs.length ? (
        <div className="grid gap-12">
          {[...groups].map(([dept, list]) => (
            <section key={dept} aria-label={dept}>
              <h3 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-fg-muted">
                {dept} <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{list.length}</span>
              </h3>
              <div className="grid gap-4">
                {list.map((j) => (
                  <JobRow key={j.id} j={j} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--r-lg)] border border-dashed border-line-strong p-8 text-center md:p-12">
          <p className="text-step-1 font-medium">No open roles right now</p>
          <p className="mx-auto mt-2 max-w-lg text-fg-muted">We are growing. Leave your details and CV and we will get in touch when something fits you.</p>
        </div>
      )}
      {block.data.showOpenApplication && (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[var(--r-lg)] bg-surface-2 p-6 md:p-8">
          <div>
            <p className="text-step-1 font-medium">Don&apos;t see your role?</p>
            <p className="mt-1 text-fg-muted">Send an open application — chefs, guides, gardeners and storytellers welcome.</p>
          </div>
          <Link href="/careers/apply" className="btn">
            <span className="btn-label">Send your CV</span> <ArrowRight className="btn-arrow size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Cookie table ───────────────────────── */

export function CookieTable({ block }: BlockProps<H>) {
  return (
    <div className="container-x max-w-5xl">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-10" />
      <CookieTableContent />
      <p className="mt-10">
        <a href="#cookie-settings" className="btn">
          <span className="btn-label">Change my cookie choices</span>
        </a>
      </p>
    </div>
  );
}
