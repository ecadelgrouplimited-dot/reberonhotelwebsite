import Link from 'next/link';
import { ArrowRight, Check, Clock } from 'lucide-react';
import type { DestinationCardDTO, LRich, LText, Milestone, ProgressDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { MediaImage } from '@/components/ui/media-image';
import { Slider } from '@/components/ui/slider';
import { RichText } from '@/components/ui/rich-text';
import { SectionHeading } from '@/components/ui/section-heading';
import { driveTime, dateLong } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { BlockProps } from './types';

type H = { eyebrow?: LText; heading?: LText; intro?: LText };

const MILESTONES: [Milestone, string][] = [
  ['GROUNDBREAKING', 'Ground broken'],
  ['FOUNDATION', 'Foundations'],
  ['STRUCTURE', 'Structure'],
  ['ROOF', 'Roof on'],
  ['FINISHES', 'Finishes'],
  ['FURNISHING', 'Furnishing'],
  ['OPENING', 'Opening'],
];

/* ───── Watch the hotel rise ───── */
export function ProgressRing({ percent, size = 168 }: { percent: number; size?: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} className="transition-[stroke-dashoffset] duration-[2s]" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <span className="block font-display text-[2.6rem] leading-none tabular">{percent}%</span>
          <span className="mt-1 block text-[0.7rem] uppercase tracking-[0.2em] text-fg-subtle">built</span>
        </div>
      </div>
    </div>
  );
}

export function MilestoneLadder({ reached }: { reached: Milestone[] }) {
  const lastIdx = Math.max(-1, ...reached.map((m) => MILESTONES.findIndex(([k]) => k === m)));
  return (
    <ol className="space-y-3 text-sm">
      {MILESTONES.map(([k, label], i) => (
        <li key={k} className={cn('flex items-center gap-3', i <= lastIdx ? 'text-fg' : 'text-fg-subtle')}>
          <span className={cn('grid size-6 place-items-center rounded-full border', i <= lastIdx ? 'border-transparent bg-moss-700 text-mist-50' : 'border-line-strong', i === lastIdx + 1 && 'border-accent')}>
            {i <= lastIdx ? <Check className="size-3.5" strokeWidth={2.4} /> : <span className="size-1.5 rounded-full bg-current opacity-50" />}
          </span>
          {label}
          {i === lastIdx + 1 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-accent">Next</span>}
        </li>
      ))}
    </ol>
  );
}

export function ProgressEntry({ u, i }: { u: ProgressDTO; i: number }) {
  return (
    <li className="relative grid gap-5 pb-16 pl-10 md:pl-14" data-reveal style={{ ['--i' as string]: i % 2 }}>
      <span className="absolute left-0 top-1.5 grid size-[1.1rem] -translate-x-1/2 place-items-center rounded-full border-2 border-accent bg-bg" aria-hidden>
        {u.milestone && <span className="size-1.5 rounded-full bg-accent" />}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <time dateTime={u.happenedOn} className="font-semibold tabular text-fg">{dateLong(u.happenedOn)}</time>
        {u.percentComplete !== null && <span className="tabular text-fg-subtle">{u.percentComplete}% built</span>}
        {u.milestone && <span className="rounded-full bg-moss-700 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-mist-50">{MILESTONES.find(([k]) => k === u.milestone)?.[1]}</span>}
      </div>
      <Link href={`/rising/${u.slug}`} className="group">
        <h3 className="text-step-2 transition-colors group-hover:text-accent">{t(u.title)}</h3>
      </Link>
      <RichText value={u.body} className="max-w-2xl" />
      {u.media.length > 0 && (
        <div className="snap-x-strip -mr-[clamp(1rem,4vw,2.5rem)] flex gap-3 overflow-x-auto pr-[clamp(1rem,4vw,2.5rem)]">
          {u.media.map((m) => (
            <MediaImage key={m.id} media={m} sizes="(min-width:768px) 30vw, 70vw" className="aspect-[4/3] w-[70vw] shrink-0 rounded-[var(--r-md)] sm:w-[40vw] lg:w-[22rem]" />
          ))}
        </div>
      )}
    </li>
  );
}

export function ProgressTimeline({ block }: BlockProps<H & { showLink?: boolean }, { updates: ProgressDTO[]; total: number; percent: number | null }>) {
  const r = block.resolved;
  if (!r?.updates.length) return null;
  const reached = r.updates.map((u) => u.milestone).filter(Boolean) as Milestone[];
  // Milestones from updates not shown still count: treat all earlier ones as reached.
  const allReached = MILESTONES.slice(0, Math.max(...reached.map((m) => MILESTONES.findIndex(([k]) => k === m)), -1) + 1).map(([k]) => k);
  return (
    <div className="container-x grid gap-14 lg:grid-cols-[22rem_1fr] lg:gap-20">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} size="md" />
        <div className="mt-10 flex items-center gap-8 lg:flex-col lg:items-start" data-reveal>
          {r.percent !== null && <ProgressRing percent={r.percent} />}
          <MilestoneLadder reached={allReached} />
        </div>
        {block.data.showLink && (
          <Link href="/rising" className="btn btn-ghost mt-10">
            <span className="btn-label">All {r.total} updates</span> <ArrowRight className="btn-arrow size-4" />
          </Link>
        )}
      </aside>
      <div className="relative">
        <span className="absolute left-0 top-2 h-[calc(100%-2rem)] w-px bg-line" aria-hidden />
        <span className="timeline-fill absolute left-0 top-2 h-[calc(100%-2rem)] w-px bg-accent" aria-hidden />
        <ol>
          {r.updates.map((u, i) => (
            <ProgressEntry key={u.id} u={u} i={i} />
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ───── Destinations ───── */
export function DestinationCard({ d, i, large, wide }: { d: DestinationCardDTO; i: number; large?: boolean; wide?: boolean }) {
  return (
    <Link href={`/kapchorwa/${d.slug}`} className="group zoom-on-hover relative block overflow-hidden rounded-[var(--r-lg)] text-mist-50" data-reveal style={{ ['--i' as string]: i }}>
      <MediaImage media={d.hero} sizes={large || wide ? '(min-width:1024px) 60vw, 100vw' : '(min-width:1024px) 30vw, 100vw'} className={cn(large ? 'aspect-[4/5] lg:aspect-auto lg:h-full lg:min-h-[36rem]' : wide ? 'aspect-[4/5] sm:aspect-[16/9]' : 'aspect-[4/5]')} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgb(18_21_19/.85)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
        {(d.driveMinutes || d.distanceKm) && (
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs backdrop-blur-md">
            <Clock className="size-3.5" aria-hidden /> {driveTime(d.driveMinutes)}
            {d.distanceKm ? ` · ${d.distanceKm} km` : ''}
          </p>
        )}
        <h3 className={cn(large ? 'text-step-4' : 'text-step-3')}>{t(d.name)}</h3>
        <p className={cn('mt-2 max-w-md text-sm leading-relaxed text-mist-50/80', !large && !wide && 'line-clamp-3')}>{t(d.tagline)}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
          Read <ArrowRight className="size-4 transition-transform duration-500 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

export function DestinationCards({ block }: BlockProps<H, { destinations: DestinationCardDTO[] }>) {
  const list = block.resolved?.destinations ?? [];
  if (!list.length) return null;
  const [first, ...rest] = list;
  if (block.variant !== 'grid') {
    return (
      <div className="container-x">
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-14" />
        <Slider label="Destinations" itemClassName="w-[78vw] sm:w-[44vw] lg:w-[30vw] xl:w-[26rem]" autoplayMs={8000}>
          {list.map((d, i) => (
            <DestinationCard key={d.id} d={d} i={i} />
          ))}
        </Slider>
      </div>
    );
  }
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-14" />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <DestinationCard d={first!} i={0} large />
        <div className="grid gap-4 sm:grid-cols-2">
          {rest.slice(0, 4).map((d, i, arr) => {
            const odd = arr.length % 2 === 1 && i === arr.length - 1;
            return (
              <div key={d.id} className={cn(odd && 'sm:col-span-2')}>
                <DestinationCard d={d} i={i + 1} wide={odd} />
              </div>
            );
          })}
        </div>
      </div>
      {rest.length > 4 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rest.slice(4).map((d, i) => (
            <DestinationCard key={d.id} d={d} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── The road: altitude profile drawn on scroll ───── */
export interface Stop {
  name: LText;
  minutesFromPrev?: number | null;
  altitude?: number | null;
  note?: LText | null;
}

export function Journey({ stops, eyebrow, heading, intro }: { stops: Stop[]; eyebrow?: LText; heading?: LText; intro?: LText }) {
  if (stops.length < 2) return null;
  let acc = 0;
  const pts = stops.map((s) => {
    acc += s.minutesFromPrev ?? 0;
    return { ...s, at: acc, alt: s.altitude ?? 1200 };
  });
  const total = acc || 1;
  const minAlt = Math.min(...pts.map((p) => p.alt)) - 150;
  const maxAlt = Math.max(...pts.map((p) => p.alt)) + 120;
  const W = 1000;
  const H = 260;
  const xy = (p: (typeof pts)[number]) => [40 + (p.at / total) * (W - 80), H - 30 - ((p.alt - minAlt) / (maxAlt - minAlt)) * (H - 80)] as const;
  const coords = pts.map(xy);
  let d = `M${coords[0]![0]} ${coords[0]![1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!;
    const [x1, y1] = coords[i]!;
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  const area = `${d} L${coords.at(-1)![0]} ${H} L${coords[0]![0]} ${H} Z`;

  return (
    <div className="container-x">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow={eyebrow} heading={heading} intro={intro} />
        <p className="text-sm text-fg-muted" data-reveal>
          <span className="block font-display text-step-4 leading-none tabular text-fg">{driveTime(total)}</span>
          driving, before stops
        </p>
      </div>
      <div className="mt-12 overflow-x-auto" data-reveal="fade">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] text-fg" role="img" aria-label="Altitude profile of the road from Kampala to Kapchorwa">
          <defs>
            <linearGradient id="alt-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="40" x2={W - 40} y1={30 + f * (H - 80)} y2={30 + f * (H - 80)} stroke="var(--line)" strokeDasharray="2 6" />
          ))}
          <path d={area} fill="url(#alt-fill)" />
          <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="route-draw" />
          {pts.map((p, i) => {
            const [x, y] = coords[i]!;
            // Lift a label when its stop sits close to the previous one (the escarpment climb).
            const crowded = i > 0 && x - coords[i - 1]![0] < 110;
            const ly = y - (crowded ? 34 : 16);
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={y} y2={H - 8} stroke="var(--line-strong)" strokeDasharray="2 4" />
                <circle cx={x} cy={y} r={i === pts.length - 1 ? 7 : 5} fill={i === pts.length - 1 ? 'var(--accent)' : 'var(--bg)'} stroke="var(--accent)" strokeWidth="2" />
                <text x={x} y={ly} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="fill-current font-sans text-[13px] font-semibold">
                  {t(p.name)}
                </text>
                <text x={x} y={H} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="fill-[var(--fg-subtle)] font-sans text-[11px]">
                  {p.alt.toLocaleString('en')} m
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ol className="mt-12 grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {pts.map((p, i) => (
          <li key={i} className="bg-bg p-6" data-reveal="fade" style={{ ['--i' as string]: i % 3 }}>
            <p className="flex items-baseline justify-between text-sm text-fg-subtle">
              <span className="tabular">{String(i + 1).padStart(2, '0')}</span>
              {i > 0 && <span className="tabular">+{driveTime(p.minutesFromPrev ?? 0)}</span>}
            </p>
            <h3 className="mt-3 text-step-2">{t(p.name)}</h3>
            {t(p.note ?? undefined) && <p className="mt-2 text-fg-muted">{t(p.note ?? undefined)}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function JourneyBlock({ block }: BlockProps<H & { stops?: Stop[] }>) {
  return <Journey stops={block.data.stops ?? []} eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} />;
}

/* ───── When to come ───── */
const SEASON_COLOR: Record<string, string> = { dry: 'var(--color-gold-400)', 'short-rains': 'var(--color-sipi-400)', 'long-rains': 'var(--color-moss-500)' };
const SEASON_LABEL: Record<string, string> = { dry: 'Dry', 'short-rains': 'Short rains', 'long-rains': 'Long rains' };

export function SeasonStrip({ block }: BlockProps<H & { months?: { month: string; season: string; rainyDays?: number; note?: LText }[] }>) {
  const months = block.data.months ?? [];
  const max = Math.max(...months.map((m) => m.rainyDays ?? 0), 1);
  const now = new Date().toLocaleString('en', { month: 'short', timeZone: 'Africa/Kampala' });
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-12" />
      <div className="mb-6 flex flex-wrap gap-5 text-sm text-fg-muted">
        {Object.entries(SEASON_LABEL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: SEASON_COLOR[k] }} /> {v}
          </span>
        ))}
        <span className="text-fg-subtle">Bar height: typical rainy days</span>
      </div>
      <ol className="grid grid-cols-6 gap-2 md:grid-cols-12">
        {months.map((m, i) => (
          <li key={m.month} className="group flex flex-col" data-reveal style={{ ['--i' as string]: i % 6 }}>
            <div className="relative flex h-40 items-end rounded-[var(--r-md)] bg-surface-2 p-1.5">
              <div className="w-full rounded-[8px] transition-all duration-700" style={{ height: `${Math.max(8, ((m.rainyDays ?? 0) / max) * 100)}%`, background: SEASON_COLOR[m.season] }} />
              <span className="absolute left-1/2 top-2 -translate-x-1/2 text-xs font-semibold tabular text-fg-muted">{m.rainyDays ?? '–'}</span>
            </div>
            <p className={cn('mt-2 text-center text-sm font-semibold', m.month === now && 'text-accent')}>
              {m.month}
              {m.month === now && <span className="sr-only"> (this month)</span>}
            </p>
            <p className="mt-1 hidden text-center text-xs leading-snug text-fg-subtle md:block">{t(m.note)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export { RichText };
export type { LRich };
