'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Film,
  Grid2X2,
  Maximize2,
  Mountain,
  Sparkles,
} from 'lucide-react';
import type { MediaRef } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { cn } from '@/lib/cn';
import { cleanMediaCaption } from '@/lib/media-clean';
import { Lightbox } from './lightbox';

/* ── Editorial metadata for sanctuary plates ── */
interface PlateEditorial {
  title: string;
  category: 'suites' | 'gym' | 'dining' | 'architecture';
  categoryLabel: string;
  desc: string;
  specs: { elevation: string; aspect: string; craft: string };
  tags: string[];
}

const EDITORIAL_STORIES: PlateEditorial[] = [
  {
    title: 'Elgon Ridge Sunrise Suites',
    category: 'suites',
    categoryLabel: 'Highland Suites',
    desc: 'Each suite is arranged with the bed facing the escarpment. Mornings begin with violet light washing through deep cedar-framed windows as mist rises from the river below.',
    specs: { elevation: '1,900 m', aspect: 'North-West Ridge', craft: 'Elgon Cypress & Linen' },
    tags: ['PanoramicView', 'FirstLight', 'MountElgon'],
  },
  {
    title: 'High-Altitude Athletic Training & Recovery',
    category: 'gym',
    categoryLabel: 'Athletic Health',
    desc: 'Designed for distance runners and highland guests. Dedicated rowers, lifting racks, and endurance equipment framed by panoramic mountain horizons and thin, clean air.',
    specs: { elevation: '1,900 m', aspect: 'Valley Facing', craft: 'Rubberised Basalt & Steel' },
    tags: ['AthleticHeritage', 'ThinAir', 'Recovery'],
  },
  {
    title: 'The Mountain Table & Single-Origin Arabica',
    category: 'dining',
    categoryLabel: 'Slow Highland Dining',
    desc: 'Wholesome highland fare prepared for hungry trail walkers. Wood-fired baked sourdough, fresh mountain trout, organic greens, and Arabica harvested from slopes within twenty kilometres.',
    specs: { elevation: '1,900 m', aspect: 'Garden Terrace', craft: 'Handmade Clay & Pine' },
    tags: ['SlowFood', 'ArabicaCoffee', 'FarmToTable'],
  },
  {
    title: 'Volcanic Basalt Masonry & Deep Eaves',
    category: 'architecture',
    categoryLabel: 'Architecture & Craft',
    desc: 'Built by stone masons and carpenters from Kapchorwa and Mbale. Basalt quarried from Elgon’s ancient volcanic flows anchors the foundation against mountain storms.',
    specs: { elevation: '1,900 m', aspect: 'Northern Shoulder', craft: 'Hand-Cut Volcanic Basalt' },
    tags: ['LocalArtisans', 'SustainableDesign', 'VolcanicStone'],
  },
  {
    title: 'Solitude Verandas & Escarpment Vistas',
    category: 'suites',
    categoryLabel: 'Highland Suites',
    desc: 'Generous private balconies shielded from wind, equipped for morning coffee or evening reading wrapped in heavy highland wool blankets as the night settles.',
    specs: { elevation: '1,900 m', aspect: 'Valley Vista', craft: 'Local Hardwood Decking' },
    tags: ['QuietSanctuary', 'HighlandNight', 'HeavyBlankets'],
  },
  {
    title: 'The Community Hall & Gathering Veranda',
    category: 'architecture',
    categoryLabel: 'Architecture & Craft',
    desc: 'A forty-seat cedar-vaulted hall designed for athletic team briefings, highland workshops, and community celebrations, connected seamlessly to the garden grounds.',
    specs: { elevation: '1,900 m', aspect: 'Garden Courtyard', craft: 'Timber Trusses & Stone' },
    tags: ['TheHall', 'CommunityGathering', 'ElgonPine'],
  },
  {
    title: 'Post-Run Hydrothermal Recovery',
    category: 'gym',
    categoryLabel: 'Athletic Health',
    desc: 'Deep thermal soaking baths and high-pressure rain showers fed continuously by gravity lines from mountain springs and powered by solar thermal backup.',
    specs: { elevation: '1,900 m', aspect: 'East Courtyard', craft: 'Honed Slate & Brass' },
    tags: ['HotSpringWater', 'SolarThermal', 'PostTrailRest'],
  },
  {
    title: 'Organic Elgon Slopes & Sipi Trailhead',
    category: 'dining',
    categoryLabel: 'Slow Highland Dining',
    desc: 'Perched directly above the mist of Sipi Falls. Walking trails depart from the gate, weaving through smallholder Arabica farms and indigenous bamboo forests.',
    specs: { elevation: '1,900 m', aspect: 'Sipi Escarpment', craft: 'Living Terraced Gardens' },
    tags: ['SipiFalls', 'BespokeTrails', 'HighlandNature'],
  },
];

function getPlateEditorial(index: number, caption?: string | null, alt?: string | null): PlateEditorial {
  const clean = cleanMediaCaption(caption, alt);
  const fallback = EDITORIAL_STORIES[index % EDITORIAL_STORIES.length]!;
  if (clean && clean.length > 3) {
    return {
      ...fallback,
      title: clean,
    };
  }
  return fallback;
}

/* ── Tile Component with Clean Alt & Hover ── */
function Tile({
  m,
  onClick,
  className,
  sizes,
  plateIndex,
}: {
  m: MediaRef;
  onClick: () => void;
  className?: string;
  sizes: string;
  plateIndex?: number;
}) {
  const label = cleanMediaCaption(t(m.caption), t(m.alt)) ?? `Plate ${plateIndex ? plateIndex + 1 : 'photo'} · Reberon Hotel`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('zoom-on-hover group relative block w-full overflow-hidden rounded-[var(--r-md)] focus-visible:outline-offset-4', className)}
      style={{ backgroundColor: m.dominantColor ?? undefined }}
      aria-label={`Open plate: ${label}`}
    >
      <Image
        src={m.url}
        alt={label}
        fill
        sizes={sizes}
        className="object-cover"
        style={{ objectPosition: `${m.focalX * 100}% ${m.focalY * 100}%` }}
        placeholder={m.lqip ? 'blur' : 'empty'}
        blurDataURL={m.lqip ?? undefined}
      />
      <span className="absolute inset-0 bg-basalt-950/0 transition-colors duration-500 group-hover:bg-basalt-950/15" />
      <span className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-basalt-950/75 text-mist-50 opacity-0 backdrop-blur-xs transition-opacity duration-300 group-hover:opacity-100">
        <Expand className="size-4" />
      </span>
    </button>
  );
}

/* ── Main Book Lookbook Component ── */
function BookGallery({
  items,
  openLightbox,
}: {
  items: MediaRef[];
  openLightbox: (index: number) => void;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDir, setFlipDir] = useState<'next' | 'prev'>('next');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);

  const total = items.length;

  const plates = useMemo(() => {
    return items.map((m, idx) => {
      const editorial = getPlateEditorial(idx, t(m.caption), t(m.alt));
      return {
        media: m,
        index: idx,
        editorial,
      };
    });
  }, [items]);

  const filteredPlates = useMemo(() => {
    if (activeCategory === 'all') return plates;
    return plates.filter((p) => p.editorial.category === activeCategory);
  }, [plates, activeCategory]);

  const activeIndex = Math.min(currentPage, filteredPlates.length - 1 >= 0 ? filteredPlates.length - 1 : 0);
  const activePlate = filteredPlates[activeIndex] || plates[0];

  const turnPage = useCallback(
    (dir: 1 | -1) => {
      if (isFlipping) return;
      const nextIndex = (activeIndex + dir + filteredPlates.length) % filteredPlates.length;
      setFlipDir(dir === 1 ? 'next' : 'prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(nextIndex);
        setIsFlipping(false);
      }, 450);
    },
    [activeIndex, filteredPlates.length, isFlipping],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') turnPage(1);
      if (e.key === 'ArrowLeft') turnPage(-1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [turnPage]);

  if (!activePlate) return null;

  return (
    <div className="relative mx-auto max-w-6xl">
      {/* Category Navigation Bar */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All Sanctuary Plates', count: plates.length },
            { id: 'suites', label: 'Suites & Solitude' },
            { id: 'gym', label: 'Athletic Health & Gym' },
            { id: 'dining', label: 'Highland Dining & Arabica' },
            { id: 'architecture', label: 'Basalt & Craft' },
          ].map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  setCurrentPage(0);
                }}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-all duration-300',
                  isSelected
                    ? 'bg-brand text-brand-fg shadow-sm'
                    : 'border border-line bg-surface/60 text-fg-muted hover:border-brand/40 hover:bg-surface-2 hover:text-fg',
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-fg-muted font-mono">
          <span className="flex items-center gap-1.5">
            <BookOpen className="size-3.5 text-brand" />
            <span>Highland Lookbook</span>
          </span>
          <span>·</span>
          <span>
            {String(activeIndex + 1).padStart(2, '0')} / {String(filteredPlates.length).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* 3D Editorial Lookbook / Flip Spread Container */}
      <div
        ref={containerRef}
        onTouchStart={(e) => (touchStart.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStart.current;
          if (Math.abs(dx) > 40) turnPage(dx < 0 ? 1 : -1);
          touchStart.current = null;
        }}
        className="group relative select-none"
        style={{ perspective: '2200px' }}
      >
        {/* Book Outer Frame / Leather-bound effect */}
        <div className="relative overflow-hidden rounded-[var(--r-2xl)] border border-line-strong/80 bg-surface shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)]">
          {/* Subtle Spine Center Shadow Gradient */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 z-20 hidden w-16 -translate-x-1/2 bg-gradient-to-r from-black/15 via-black/5 to-black/15 dark:from-black/40 dark:via-black/10 dark:to-black/40 lg:block"
            aria-hidden
          />

          {/* Book Open Spread Layout */}
          <div
            className={cn(
              'grid grid-cols-1 transition-all duration-500 ease-out lg:grid-cols-2',
              isFlipping && flipDir === 'next' && 'opacity-90 scale-[0.995]',
              isFlipping && flipDir === 'prev' && 'opacity-90 scale-[0.995]',
            )}
          >
            {/* ── Left Page: The Photographic Plate ── */}
            <div className="relative flex flex-col justify-between border-b border-line p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
              {/* Header plate badge */}
              <div className="mb-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                <span className="flex items-center gap-1.5 text-brand">
                  <Mountain className="size-3.5" />
                  <span>Plate {String(activeIndex + 1).padStart(2, '0')}</span>
                </span>
                <span>{activePlate.editorial.specs.elevation}</span>
              </div>

              {/* Photo Canvas */}
              <div
                onClick={() => openLightbox(activePlate.index)}
                className="group/photo relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-[var(--r-lg)] border border-line-strong/50 bg-surface-2 shadow-inner"
              >
                <Image
                  src={activePlate.media.url}
                  alt={activePlate.editorial.title}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover/photo:scale-[1.03]"
                  style={{
                    objectPosition: `${activePlate.media.focalX * 100}% ${activePlate.media.focalY * 100}%`,
                  }}
                  placeholder={activePlate.media.lqip ? 'blur' : 'empty'}
                  blurDataURL={activePlate.media.lqip ?? undefined}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-basalt-950/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/photo:opacity-100" />
                <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-basalt-950/85 px-4 py-2 font-mono text-xs text-mist-50 shadow-md backdrop-blur-md">
                  <Maximize2 className="size-3.5" />
                  <span>Inspect in Lightbox</span>
                </div>
              </div>

              {/* Plate Location & Drawing Tag */}
              <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
                <span className="font-sans font-medium">{activePlate.editorial.categoryLabel}</span>
                {activePlate.media.isRendering && (
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                    Drawing · As imagined
                  </span>
                )}
              </div>
            </div>

            {/* ── Right Page: Sanctuary Narrative & Editorial ── */}
            <div className="relative flex flex-col justify-between bg-surface-2/30 p-6 sm:p-10 lg:p-12">
              <div>
                {/* Book header */}
                <div className="flex items-center justify-between border-b border-line pb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-muted">
                  <span>Reberon Highland Folio</span>
                  <span>Mount Elgon · 2027</span>
                </div>

                {/* Chapter & Title */}
                <div className="mt-8">
                  <p className="eyebrow text-brand mb-2">{activePlate.editorial.categoryLabel}</p>
                  <h3 className="font-display text-step-2 font-normal text-fg leading-tight">
                    {activePlate.editorial.title}
                  </h3>
                </div>

                {/* Editorial Body */}
                <p className="mt-5 text-sm sm:text-base leading-relaxed text-fg-muted">
                  {activePlate.editorial.desc}
                </p>

                {/* Highland Specifications Grid */}
                <div className="mt-8 grid grid-cols-3 gap-3 rounded-2xl border border-line bg-surface/70 p-4 backdrop-blur-xs">
                  <div>
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Altitude</span>
                    <span className="mt-1 block font-mono text-xs font-semibold text-fg">
                      {activePlate.editorial.specs.elevation}
                    </span>
                  </div>
                  <div>
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Aspect</span>
                    <span className="mt-1 block font-mono text-xs font-semibold text-fg">
                      {activePlate.editorial.specs.aspect}
                    </span>
                  </div>
                  <div>
                    <span className="block font-mono text-[9px] uppercase tracking-wider text-fg-subtle">Materials</span>
                    <span className="mt-1 block font-mono text-xs font-semibold text-fg">
                      {activePlate.editorial.specs.craft}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                <div className="mt-6 flex flex-wrap gap-2">
                  {activePlate.editorial.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-line/60 bg-surface-2/60 px-2.5 py-1 text-[11px] font-mono text-fg-subtle"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Spread Flip Navigation Bar */}
              <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                <button
                  type="button"
                  onClick={() => turnPage(-1)}
                  className="group/btn flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-fg transition-all hover:border-brand/50 hover:bg-surface-2"
                >
                  <ArrowLeft className="size-4 text-brand transition-transform group-hover/btn:-translate-x-1" />
                  <span>Previous Page</span>
                </button>

                <button
                  type="button"
                  onClick={() => openLightbox(activePlate.index)}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                >
                  <Expand className="size-3.5" />
                  <span>Full Screen</span>
                </button>

                <button
                  type="button"
                  onClick={() => turnPage(1)}
                  className="group/btn flex items-center gap-2 rounded-full border border-brand/40 bg-brand px-4 py-2 text-xs font-medium text-brand-fg shadow-sm transition-all hover:shadow-md"
                >
                  <span>Next Page</span>
                  <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          {/* Corner Page Fold Click Hint */}
          <div
            onClick={() => turnPage(1)}
            title="Click to turn to next page"
            className="absolute bottom-0 right-0 z-30 hidden h-16 w-16 cursor-pointer lg:block"
          >
            <div className="absolute bottom-0 right-0 h-0 w-0 border-b-[24px] border-r-[24px] border-b-line-strong/60 border-r-surface-2 transition-all duration-300 hover:border-b-[36px] hover:border-r-[36px]" />
          </div>
        </div>
      </div>

      {/* Scrubbable Thumbnail Plate Strip */}
      <div className="mt-8">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          Explore All Folio Plates ({filteredPlates.length})
        </p>
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1 snap-x-strip outline-none">
          {filteredPlates.map((p, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <button
                key={p.media.id}
                type="button"
                onClick={() => setCurrentPage(idx)}
                className={cn(
                  'group relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-300',
                  isCurrent
                    ? 'border-brand scale-105 shadow-md ring-2 ring-brand/20'
                    : 'border-line opacity-65 hover:border-brand/40 hover:opacity-100',
                )}
              >
                <Image
                  src={p.media.url}
                  alt={p.editorial.title}
                  fill
                  sizes="120px"
                  className="object-cover"
                  placeholder={p.media.lqip ? 'blur' : 'empty'}
                  blurDataURL={p.media.lqip ?? undefined}
                />
                <span className="absolute bottom-1 left-1.5 rounded-sm bg-basalt-950/80 px-1.5 py-0.5 font-mono text-[9px] text-white">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── GalleryGrid Main Component with Multiple Exploring Modes ── */
export function GalleryGrid({
  items,
  variant = 'book',
}: {
  items: MediaRef[];
  variant?: string;
}) {
  // If explicitly requested or by default, provide the book lookbook experience!
  const [viewMode, setViewMode] = useState<'book' | 'filmstrip' | 'mosaic'>(
    variant === 'filmstrip' ? 'filmstrip' : variant === 'mosaic' ? 'mosaic' : 'book',
  );

  return (
    <Lightbox items={items}>
      {(open) => (
        <div>
          {/* Mode Explorer Selector Bar */}
          <div className="mb-8 flex items-center justify-end">
            <div className="inline-flex items-center rounded-full border border-line bg-surface p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('book')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'book'
                    ? 'bg-brand text-brand-fg shadow-xs'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                <BookOpen className="size-3.5" />
                <span>Folio Book</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('filmstrip')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'filmstrip'
                    ? 'bg-brand text-brand-fg shadow-xs'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                <Film className="size-3.5" />
                <span>Filmstrip</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mosaic')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'mosaic'
                    ? 'bg-brand text-brand-fg shadow-xs'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                <Grid2X2 className="size-3.5" />
                <span>Mosaic</span>
              </button>
            </div>
          </div>

          {/* Render Active Exploring View Mode */}
          {viewMode === 'book' ? (
            <BookGallery items={items} openLightbox={open} />
          ) : viewMode === 'filmstrip' ? (
            <Filmstrip items={items} open={open} />
          ) : (
            <div className="grid auto-rows-[14rem] grid-cols-2 gap-3 md:auto-rows-[18rem] md:grid-cols-4">
              {items.map((m, i) => (
                <Tile
                  key={m.id}
                  m={m}
                  onClick={() => open(i)}
                  className={cn('h-full', i % 5 === 0 && 'col-span-2 row-span-2')}
                  sizes="(min-width:768px) 50vw, 100vw"
                  plateIndex={i}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Lightbox>
  );
}

/** Horizontal strip with visible controls: arrows, a count, and edge fades that say "there is more". */
function Filmstrip({ items, open }: { items: MediaRef[]; open: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ start: true, end: false, index: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const first = el.children[0] as HTMLElement | undefined;
      const step = first ? first.offsetWidth + 16 : el.clientWidth;
      setState({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8,
        index: Math.min(items.length - 1, Math.round(el.scrollLeft / step)),
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items.length]);

  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const btn =
    'grid size-11 place-items-center rounded-full border border-line-strong bg-surface text-fg transition-opacity hover:bg-surface-2 disabled:opacity-30';

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={`${items.length} photos`}>
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(1);
          if (e.key === 'ArrowLeft') go(-1);
        }}
        className="snap-x-strip -mx-[clamp(1rem,4vw,2.5rem)] flex gap-4 overflow-x-auto px-[clamp(1rem,4vw,2.5rem)] pb-2 outline-none"
      >
        {items.map((m, i) => {
          const clean = cleanMediaCaption(t(m.caption), t(m.alt));
          return (
            <div key={m.id} className="relative w-[78vw] shrink-0 sm:w-[46vw] lg:w-[34vw]" aria-label={`${i + 1} of ${items.length}`}>
              <Tile m={m} onClick={() => open(i)} className="aspect-[4/5]" sizes="(min-width:1024px) 34vw, 78vw" plateIndex={i} />
              {clean && <p className="mt-3 text-sm text-fg-subtle">{clean}</p>}
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 -right-[clamp(1rem,4vw,2.5rem)] w-24 bg-gradient-to-l from-bg to-transparent transition-opacity [.tone-warm_&]:from-bg-warm',
          state.end && 'opacity-0',
        )}
        aria-hidden
      />
      {items.length > 1 && (
        <div className="mt-6 flex items-center gap-4">
          <button type="button" className={btn} onClick={() => go(-1)} disabled={state.start} aria-label="Previous photos">
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" className={btn} onClick={() => go(1)} disabled={state.end} aria-label="More photos">
            <ArrowRight className="size-4" />
          </button>
          <div className="h-px flex-1 bg-line">
            <div
              className="h-px bg-fg transition-all duration-500"
              style={{ width: `${((state.end ? items.length : state.index + 1) / items.length) * 100}%` }}
            />
          </div>
          <span className="text-sm tabular text-fg-subtle">
            {String(state.end ? items.length : state.index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
}
