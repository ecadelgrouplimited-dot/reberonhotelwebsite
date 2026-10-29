import Link from 'next/link';
import { ViewTransition } from 'react';
import { ArrowUpRight, BedDouble, Images, Maximize2, Mountain, Users } from 'lucide-react';
import type { AmenityDTO, Cta, FacilityDTO, LRich, LText, MediaRef, RoomTypeCardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { MediaImage } from '@/components/ui/media-image';
import { RichText } from '@/components/ui/rich-text';
import { SectionHeading } from '@/components/ui/section-heading';
import { Icon } from '@/components/ui/icon';
import { CtaButton } from '@/components/site/cta-button';
import { Price } from '@/components/site/price';
import { resolveCta } from '@/lib/cta';
import { cn } from '@/lib/cn';
import { getFacilityFeatures } from '@/lib/facility-features';
import type { BlockProps } from './types';

type H = { eyebrow?: LText; heading?: LText; intro?: LText };

/* ───── Story ───── */
export function Story({ block, media, site, ctx }: BlockProps<H & { body?: LRich; media?: string; ctas?: Cta[] }>) {
  const d = block.data;
  const img = d.media ? media[d.media] : null;
  const v = block.variant ?? 'right';
  return (
    <div className={cn('container-x grid items-center gap-12 lg:gap-20', v === 'stacked' ? '' : 'lg:grid-cols-2')}>
      <div className={cn(v === 'left' && 'lg:order-2')}>
        <SectionHeading eyebrow={d.eyebrow} heading={d.heading} size="md" />
        <div data-reveal style={{ ['--i' as string]: 2 }}>
          <RichText value={d.body} className="mt-7 max-w-xl" />
        </div>
        {!!d.ctas?.length && (
          <div className="mt-8 flex flex-wrap gap-3" data-reveal style={{ ['--i' as string]: 3 }}>
            {d.ctas.map((c, i) => (
              <CtaButton key={i} cta={resolveCta(c, site, ctx)} style={c.style} />
            ))}
          </div>
        )}
      </div>
      {img && (
        <div data-reveal="mask" className={cn('relative', v === 'stacked' && 'lg:order-first')}>
          <div className="overflow-hidden rounded-[var(--r-xl)]">
            <div className="parallax-slow scale-110">
              <MediaImage media={img} sizes="(min-width: 1024px) 50vw, 100vw" className={cn(v === 'stacked' ? 'aspect-[21/9]' : 'aspect-[4/5]')} />
            </div>
          </div>
          {img.isRendering && <p className="mt-3 text-xs text-fg-subtle">Drawing — photographs follow when the house is finished.</p>}
        </div>
      )}
    </div>
  );
}

/* ───── Stats ───── */
export function Stats({ block }: BlockProps<{ items?: { value: string; label: LText }[] }>) {
  const items = block.data.items ?? [];
  return (
    <div className="container-x">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-12 border-y border-line py-12 md:grid-cols-4 md:py-16">
        {items.map((it, i) => (
          <div key={i} data-reveal style={{ ['--i' as string]: i }} className="md:border-l md:border-line md:pl-8 md:first:border-l-0 md:first:pl-0">
            <dt className="sr-only">{t(it.label)}</dt>
            <dd>
              <span className="block font-display text-step-4 leading-none tabular text-fg">{it.value}</span>
              <span className="mt-3 block max-w-[16rem] text-sm leading-relaxed text-fg-muted">{t(it.label)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ───── Rooms ───── */
export function RoomFacts({ room, className }: { room: Pick<RoomTypeCardDTO, 'sleepsAdults' | 'sleepsChildren' | 'bedConfig' | 'sizeSqm' | 'view'>; className?: string }) {
  const facts = [
    { icon: Users, label: `Sleeps ${room.sleepsAdults}${room.sleepsChildren ? ` + ${room.sleepsChildren} child` : ''}` },
    { icon: BedDouble, label: t(room.bedConfig) },
    room.sizeSqm ? { icon: Maximize2, label: `${room.sizeSqm} m²` } : null,
    room.view ? { icon: Mountain, label: t(room.view) } : null,
  ].filter(Boolean) as { icon: typeof Users; label: string }[];
  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-muted', className)}>
      {facts.map((f, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <f.icon className="size-4 text-fg-subtle" strokeWidth={1.5} aria-hidden />
          {f.label}
        </li>
      ))}
    </ul>
  );
}

export function RoomCard({ room, i, showPrice = true, size = 'md' }: { room: RoomTypeCardDTO; i: number; showPrice?: boolean; size?: 'md' | 'lg' }) {
  return (
    <Link href={`/rooms/${room.slug}`} className="group zoom-on-hover block" data-reveal style={{ ['--i' as string]: i % 2 }}>
      <div className="relative overflow-hidden rounded-[var(--r-lg)]">
        <ViewTransition name={`room-${room.slug}`}>
          <MediaImage media={room.hero} sizes="(min-width: 1024px) 45vw, 100vw" className={size === 'lg' ? 'aspect-[16/11]' : 'aspect-[4/5] md:aspect-[5/6]'} badge />
        </ViewTransition>
        <span className="absolute bottom-4 left-4 rounded-full bg-basalt-950/60 px-3 py-1 text-xs font-medium text-mist-50 backdrop-blur-md">
          {room.roomCount} {room.roomCount === 1 ? 'room' : 'rooms'}
        </span>
        <span className="absolute bottom-4 right-4 grid size-11 place-items-center rounded-full bg-mist-50 text-basalt-950 opacity-0 transition-all duration-500 group-hover:opacity-100 max-md:opacity-100">
          <ArrowUpRight className="size-5 transition-transform duration-500 group-hover:rotate-45" strokeWidth={1.6} />
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-step-2">{t(room.name)}</h3>
        {showPrice && <Price price={room.fromPrice} className="text-sm" />}
      </div>
      <p className="mt-2 max-w-md text-fg-muted">{t(room.tagline)}</p>
      <RoomFacts room={room} className="mt-4" />
    </Link>
  );
}

export function RoomGrid({ block }: BlockProps<H & { showFromPrice?: boolean }, { roomTypes: RoomTypeCardDTO[] }>) {
  const rooms = block.resolved?.roomTypes ?? [];
  const d = block.data;
  return (
    <div className="container-x">
      <SectionHeading eyebrow={d.eyebrow} heading={d.heading} intro={d.intro} className="mb-14 md:mb-20" />
      <div className="grid gap-x-10 gap-y-16 md:grid-cols-2">
        {rooms.map((r, i) => (
          <div key={r.id} className={cn(i % 2 === 1 && 'md:mt-28')}>
            <RoomCard room={r} i={i} showPrice={d.showFromPrice !== false} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoomSpotlight({ block }: BlockProps<H, { roomType: RoomTypeCardDTO & { gallery: MediaRef[]; amenities: AmenityDTO[]; description: LRich | null } }>) {
  const r = block.resolved?.roomType;
  if (!r) return null;
  return (
    <div className="container-x grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid grid-cols-6 gap-3" data-reveal>
        <MediaImage media={r.hero} sizes="(min-width:1024px) 55vw, 100vw" className="col-span-6 aspect-[16/10] rounded-[var(--r-lg)]" badge />
        {r.gallery.slice(1, 4).map((m) => (
          <MediaImage key={m.id} media={m} sizes="20vw" className="col-span-2 aspect-square rounded-[var(--r-md)]" />
        ))}
      </div>
      <div>
        <p className="eyebrow mb-4">{t(block.data.eyebrow) || 'Room spotlight'}</p>
        <h2 className="text-step-4">{t(block.data.heading) || t(r.name)}</h2>
        <p className="mt-4 text-step-1 text-fg-muted">{t(r.tagline)}</p>
        <RoomFacts room={r} className="mt-6" />
        <ul className="mt-6 grid grid-cols-2 gap-2 text-sm text-fg-muted">
          {r.amenities.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <Icon name={a.icon} className="size-4 text-brand" /> {t(a.name)}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link href={`/rooms/${r.slug}`} className="btn">
            <span className="btn-label">See the room</span>
          </Link>
          <Price price={r.fromPrice} />
        </div>
      </div>
    </div>
  );
}

/* ───── Facilities ───── */
export function Facilities({ block }: BlockProps<H, { facilities: FacilityDTO[] }>) {
  const items = block.resolved?.facilities ?? [];
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-14" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f, i) => {
          const features = getFacilityFeatures(f);
          const isComingSoon = f.status === 'COMING_SOON';
          return (
            <Link
              key={f.id}
              href={`/facilities/${f.slug}`}
              className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:bg-surface-2 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none cursor-pointer"
              data-reveal="fade"
              style={{ ['--i' as string]: i % 3 }}
            >
              <div>
                {/* Header row with Icon, Badges and Hover Arrow */}
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl border border-line-strong bg-surface-2 text-brand transition-colors group-hover:border-brand/40 group-hover:bg-brand/10">
                    <Icon name={f.icon} className="size-5.5" />
                  </span>

                  <div className="flex items-center gap-2">
                    {isComingSoon ? (
                      <span className="rounded-full border border-gold-400/50 bg-gold-400/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-gold-500">
                        Being built
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[0.68rem] font-semibold tracking-wider text-emerald-600 dark:text-emerald-400">
                        Available
                      </span>
                    )}
                    <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-fg-muted transition-all duration-300 group-hover:bg-brand group-hover:text-basalt-950">
                      <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:rotate-45" />
                    </span>
                  </div>
                </div>

                {/* Title & Summary */}
                <h3 className="mt-6 text-step-2 font-display text-fg transition-colors group-hover:text-brand">
                  {t(f.name)}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {t(f.summary)}
                </p>

                {/* Actionable Feature Badges */}
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {features.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line/60 bg-surface-2/80 px-2.5 py-1 font-mono text-[11px] text-fg-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Photo with count badge */}
              <div className="mt-6">
                {f.media[0] && (
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--r-md)] bg-surface-2">
                    <MediaImage
                      media={f.media[0]}
                      sizes="(min-width:1024px) 30vw, 90vw"
                      className="size-full opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
                    />
                    {f.media.length > 1 && (
                      <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-basalt-950/80 px-2.5 py-1 font-mono text-[10px] text-mist-50 backdrop-blur-md">
                        <Images className="size-3 text-brand" />
                        <span>{f.media.length} Photos</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Card Footer: Explore Prompt & Action */}
                <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                  <span className="font-semibold text-brand inline-flex items-center gap-1">
                    <span>Learn more &amp; view gallery</span>
                    <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {features.ctaIntent === 'EVENT' ? 'Event Space' : 'Sanctuary'}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ───── Features ───── */
export function Features({ block }: BlockProps<H & { items?: { icon?: string; title: LText; text?: LText }[] }>) {
  const items = block.data.items ?? [];
  const list = block.variant === 'list';
  return (
    <div className={cn('container-x', list && 'grid gap-12 lg:grid-cols-[1fr_1.4fr]')}>
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} size="md" className={cn(!list && 'mb-14')} />
      <ul className={cn(list ? 'divide-y divide-line border-y border-line' : 'grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3')}>
        {items.map((it, i) => (
          <li key={i} className={cn(list ? 'grid grid-cols-[auto_1fr] gap-6 py-7' : '')} data-reveal style={{ ['--i' as string]: i % 3 }}>
            <span className={cn('grid size-12 place-items-center rounded-full bg-surface-2 text-brand', !list && 'mb-6')}>
              <Icon name={it.icon} className="size-5" />
            </span>
            <div>
              <h3 className="font-sans text-step-1 font-semibold tracking-normal">{t(it.title)}</h3>
              {t(it.text) && <p className="mt-2 leading-relaxed text-fg-muted">{t(it.text)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
