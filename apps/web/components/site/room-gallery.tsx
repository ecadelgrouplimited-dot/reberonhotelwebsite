'use client';
import Image from 'next/image';
import { ViewTransition, useEffect, useRef, useState } from 'react';
import { Grid2x2, X } from 'lucide-react';
import type { MediaRef } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { cn } from '@/lib/cn';
import { cleanMediaCaption } from '@/lib/media-clean';
import { Lightbox } from '@/components/blocks/lightbox';

function Photo({ m, sizes, priority, className, onClick, label }: { m: MediaRef; sizes: string; priority?: boolean; className?: string; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn('zoom-on-hover group block overflow-hidden', !/(^|\s)absolute(\s|$)/.test(className ?? '') && 'relative', className)} style={{ backgroundColor: m.dominantColor ?? undefined }}>
      <Image src={m.url} alt={t(m.alt)} fill sizes={sizes} priority={priority} className="object-cover" style={{ objectPosition: `${m.focalX * 100}% ${m.focalY * 100}%` }} placeholder={m.lqip ? 'blur' : 'empty'} blurDataURL={m.lqip ?? undefined} />
      <span className="absolute inset-0 bg-basalt-950/0 transition-colors duration-500 group-hover:bg-basalt-950/10" />
      {/* Labelled per image, so a real photo never carries a drawing's label. */}
      {m.isRendering && <span className="absolute right-2.5 top-2.5 rounded-full bg-basalt-950/70 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-mist-50 backdrop-blur-md">Drawing</span>}
    </button>
  );
}

function Shared({ name, on, children }: { name: string; on: boolean; children: React.ReactNode }) {
  return on ? <ViewTransition name={name}>{children}</ViewTransition> : <>{children}</>;
}

/**
 * Room photos: a mosaic on large screens, a swipeable strip on phones; every
 * photo opens full screen, and "Show all" lays the whole set out as a grid.
 */
export function RoomGallery({ slug, photos, roomName }: { slug: string; photos: MediaRef[]; roomName: string }) {
  const [grid, setGrid] = useState(false);
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDialogElement>(null);
  // Only one layout may own the shared-element name. <ViewTransition> renders no DOM, so this cannot mismatch on hydration.
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const d = gridRef.current;
    if (!d) return;
    if (grid && !d.open) d.showModal();
    if (!grid && d.open) d.close();
  }, [grid]);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const on = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  if (!photos.length) return null;
  const [hero, ...rest] = photos;
  return (
    <Lightbox items={photos}>
      {(open) => (
        <div className="relative">
          {/* Phone: swipe through every photo */}
          <div className="relative md:hidden">
            <div ref={strip} className="snap-x-strip flex overflow-x-auto rounded-[var(--r-lg)]" style={{ scrollPaddingInline: 0 }}>
              {photos.map((m, i) => (
                <div key={m.id} className="relative aspect-[4/3] w-full shrink-0">
                  {i === 0 ? (
                    <Shared name={`room-${slug}`} on={!desktop}>
                      <Photo m={m} sizes="100vw" priority className="absolute inset-0" onClick={() => open(i)} label={`Open photo ${i + 1} of ${photos.length}`} />
                    </Shared>
                  ) : (
                    <Photo m={m} sizes="100vw" className="absolute inset-0" onClick={() => open(i)} label={`Open photo ${i + 1} of ${photos.length}`} />
                  )}
                </div>
              ))}
            </div>
            <span className="absolute bottom-3 right-3 rounded-full bg-basalt-950/65 px-2.5 py-1 text-xs font-medium tabular text-mist-50 backdrop-blur">
              {index + 1} / {photos.length}
            </span>
          </div>

          {/* Larger screens: mosaic */}
          <div className="hidden h-[min(70vh,42rem)] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[var(--r-lg)] md:grid">
            <Shared name={`room-${slug}`} on={desktop}>
              <Photo m={hero!} sizes="50vw" priority className="col-span-2 row-span-2 h-full" onClick={() => open(0)} label={`Open photo 1 of ${photos.length}`} />
            </Shared>
            {rest.slice(0, 4).map((m, i) => (
              <Photo key={m.id} m={m} sizes="25vw" className={cn('h-full', rest.length < 3 && i === 0 && 'col-span-2', rest.length < 4 && i === rest.length - 1 && rest.length !== 1 && 'col-span-2')} onClick={() => open(i + 1)} label={`Open photo ${i + 2} of ${photos.length}`} />
            ))}
          </div>

          {photos.length > 1 && (
            <button type="button" onClick={() => setGrid(true)} className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-2 rounded-full bg-mist-50 px-4 py-2 text-sm font-semibold text-basalt-950 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 max-md:bottom-3 max-md:left-3">
              <Grid2x2 className="size-4" aria-hidden /> Show all {photos.length} photos
            </button>
          )}

          <dialog ref={gridRef} className="sheet" onClose={() => setGrid(false)} aria-label={`All photos of the ${roomName}`}>
            <div className="sheet-panel h-full overflow-y-auto bg-bg text-fg">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-[var(--glass)] px-[clamp(1rem,4vw,2.5rem)] py-4 backdrop-blur-lg">
                <p className="font-display text-step-2">{roomName} <span className="font-sans text-sm text-fg-subtle">· {photos.length} photos</span></p>
                <button type="button" onClick={() => setGrid(false)} className="grid size-11 place-items-center rounded-full border border-line hover:bg-surface-2" aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mx-auto max-w-5xl columns-1 gap-3 p-[clamp(1rem,4vw,2.5rem)] sm:columns-2 [&>*]:mb-3">
                {photos.map((m, i) => (
                  <figure key={m.id} className="break-inside-avoid">
                    <button type="button" onClick={() => open(i)} className="block w-full overflow-hidden rounded-[var(--r-md)]" style={{ backgroundColor: m.dominantColor ?? undefined }}>
                      <Image src={m.url} alt={t(m.alt)} width={m.width ?? 1600} height={m.height ?? 1067} sizes="(min-width: 640px) 50vw, 100vw" className="h-auto w-full" placeholder={m.lqip ? 'blur' : 'empty'} blurDataURL={m.lqip ?? undefined} />
                    </button>
                    {cleanMediaCaption(t(m.caption), t(m.alt)) && (
                      <figcaption className="mt-1.5 text-sm text-fg-subtle">
                        {cleanMediaCaption(t(m.caption), t(m.alt))}
                        {m.isRendering && ' · drawing'}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          </dialog>
        </div>
      )}
    </Lightbox>
  );
}
