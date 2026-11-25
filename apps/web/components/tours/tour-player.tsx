'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Accessibility, BedDouble, ChevronLeft, ChevronRight, Info, Mountain, Rotate3d, ShowerHead, Users, X, type LucideIcon } from 'lucide-react';
import type { HotspotKind, TourDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { cn } from '@/lib/cn';

import { hasConsent } from '@/lib/consent';
import { ThirdPartyGate } from '@/components/site/third-party-gate';

/** Who serves an embedded tour, named for the consent prompt. */
function tourProvider(url: string | null | undefined) {
  try {
    const h = new URL(url ?? '').hostname;
    if (h.includes('matterport')) return 'Matterport';
    if (h.includes('kuula')) return 'Kuula';
    if (h.includes('youtube')) return 'YouTube';
    return h.replace(/^www\./, '') || 'another company';
  } catch {
    return 'another company';
  }
}
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const KIND: Record<HotspotKind, LucideIcon> = { BED: BedDouble, BATH: ShowerHead, VIEW: Mountain, CAPACITY: Users, ACCESS: Accessibility, OTHER: Info };
type Context = 'ROOM_PAGE' | 'CHECKOUT' | 'PAGE';

/** A random id for this browser, so "walked, then booked" can be counted without knowing who. */
export function tourSession(): string | undefined {
  // Counting tour visits is analytics: only with the visitor's yes.
  if (!hasConsent('analytics')) return undefined;
  try {
    let id = localStorage.getItem('rb_tour_sid');
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem('rb_tour_sid', id);
    }
    return id;
  } catch {
    return undefined;
  }
}
/** Only set once a tour was actually opened. */
export function walkedSession(): string | undefined {
  if (!hasConsent('analytics')) return undefined;
  try {
    return localStorage.getItem('rb_tour_walked') === '1' ? (localStorage.getItem('rb_tour_sid') ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

function track(tourId: string, event: 'OPENED' | 'COMPLETED' | 'HOTSPOT' | 'CTA_CLICK', context: Context) {
  const sessionId = tourSession();
  if (!sessionId) return;
  if (event === 'OPENED') try { localStorage.setItem('rb_tour_walked', '1'); } catch { /* private mode */ }
  void fetch(`${API}/v1/public/tours/${tourId}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, event, context }), keepalive: true }).catch(() => undefined);
}

/** Honesty rule: only say "drawings" when every frame is one. */
function stageNote(tour: TourDTO) {
  if (tour.stage === 'LIVE') return 'The finished space';
  const frames = tour.frames;
  if (frames.length && frames.every((f) => f.isRendering)) return 'Drawn while the walls go up — not photographs';
  if (frames.some((f) => f.isRendering)) return 'Before opening · photographs and drawings';
  return 'Before opening';
}

/** The trigger plus a full-screen player. Iframes load only after the guest asks (privacy, data). */
export function TourPlayer({ tour, context, cta, children }: { tour: TourDTO; context: Context; cta?: { label: string; href: string }; children: (open: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const [spot, setSpot] = useState<string | null>(null);
  const touch = useRef<number | null>(null);
  const done = useRef(false);
  const drawings = tour.provider === 'DRAWINGS';
  const frames = tour.frames;
  const last = frames.length - 1;

  const show = useCallback(() => {
    setOpen(true);
    setFrame(0);
    setSpot(null);
    done.current = false;
    track(tour.id, 'OPENED', context);
  }, [tour.id, context]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const complete = useCallback(() => {
    if (done.current) return;
    done.current = true;
    track(tour.id, 'COMPLETED', context);
  }, [tour.id, context]);

  const go = useCallback((dir: number) => {
    setSpot(null);
    setFrame((f) => {
      const n = Math.max(0, Math.min(last, f + dir));
      if (n === last) complete();
      return n;
    });
  }, [last, complete]);

  // A camera walk counts as "walked" after 45 seconds inside it.
  useEffect(() => {
    if (!open || drawings) return;
    const id = setTimeout(complete, 45_000);
    return () => clearTimeout(id);
  }, [open, drawings, complete]);

  useEffect(() => {
    if (!open || !drawings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, drawings, go]);

  const openSpot = (id: string, f: number | null) => {
    setSpot(id);
    if (drawings && f !== null && f !== frame) setFrame(f);
    track(tour.id, 'HOTSPOT', context);
  };
  const here = tour.hotspots.filter((h) => h.frame === frame && h.x !== null && h.y !== null);
  const active = tour.hotspots.find((h) => h.id === spot);

  return (
    <>
      {children(show)}
      <dialog ref={ref} className="sheet" onClose={() => setOpen(false)} aria-label={t(tour.title)}>
        {open && (
          <div className="flex h-full flex-col bg-basalt-950 text-mist-50 lg:flex-row">
            <div className="relative flex min-h-0 flex-1 flex-col">
              <header className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg">{t(tour.title)}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-gold-400">{stageNote(tour)}</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 hover:bg-white/10" aria-label="Close the walk">
                  <X className="size-5" />
                </button>
              </header>

              <div
                className="relative min-h-0 flex-1"
                onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
                onTouchEnd={(e) => {
                  if (!drawings || touch.current === null) return;
                  const dx = (e.changedTouches[0]?.clientX ?? 0) - touch.current;
                  if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
                  touch.current = null;
                }}
              >
                {drawings ? (
                  <>
                    {frames[frame] && (() => {
                      const f = frames[frame]!;
                      const ratio = f.width && f.height ? f.width / f.height : 4 / 3;
                      return (
                        <div key={f.id} className="fade-up absolute inset-2 grid place-items-center" style={{ ['--d' as string]: '0s', containerType: 'size' }}>
                          {/* A box with the image's own proportions, so hotspot coordinates land where they were placed. */}
                          <div className="relative" style={{ aspectRatio: String(ratio), width: `min(100cqw, calc(100cqh * ${ratio}))` }}>
                            <Image src={f.url} alt={t(f.alt)} fill sizes="(min-width:1024px) 75vw, 100vw" className="rounded-[var(--r-md)] object-cover" placeholder={f.lqip ? 'blur' : 'empty'} blurDataURL={f.lqip ?? undefined} priority />
                            {f.isRendering && <span className="absolute left-3 top-3 rounded-full bg-basalt-950/70 px-3 py-1 text-xs backdrop-blur">Drawing, not a photo</span>}
                            {here.map((h, i) => {
                              const I = KIND[h.kind];
                              return (
                                <button key={h.id} type="button" onClick={() => openSpot(h.id, h.frame)} className={cn('group absolute -translate-x-1/2 -translate-y-1/2', spot === h.id && 'z-10')} style={{ left: `${h.x! * 100}%`, top: `${h.y! * 100}%` }} aria-label={t(h.label)}>
                                  <span className="absolute inset-0 animate-ping rounded-full bg-gold-400/40" style={{ animationDelay: `${i * 0.3}s` }} aria-hidden />
                                  <span className={cn('relative grid size-10 place-items-center rounded-full border-2 border-white shadow-lg transition', spot === h.id ? 'bg-gold-400 text-basalt-950' : 'bg-basalt-950/80 text-white group-hover:bg-gold-400 group-hover:text-basalt-950')}>
                                    <I className="size-4" />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    <button type="button" disabled={frame === 0} onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-0" aria-label="Step back">
                      <ChevronLeft />
                    </button>
                    <button type="button" disabled={frame === last} onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-0" aria-label="Walk on">
                      <ChevronRight />
                    </button>
                  </>
                ) : (
                  <ThirdPartyGate provider={tourProvider(tour.embedUrl)} what="3-D tour">
                    <iframe
                      src={tour.embedUrl ?? undefined}
                      title={t(tour.title)}
                      className="absolute inset-0 size-full border-0"
                      allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope; autoplay; encrypted-media"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </ThirdPartyGate>
                )}
              </div>

              {drawings && (
                <div className="flex items-center justify-center gap-2 p-4" role="tablist" aria-label="Steps">
                  {frames.map((f, i) => (
                    <button key={f.id + i} type="button" role="tab" aria-selected={i === frame} aria-label={`Step ${i + 1} of ${frames.length}`} onClick={() => { setSpot(null); setFrame(i); if (i === last) complete(); }} className={cn('h-1.5 rounded-full transition-all', i === frame ? 'w-8 bg-gold-400' : 'w-3 bg-white/30 hover:bg-white/60')} />
                  ))}
                </div>
              )}
            </div>

            <aside className="max-h-[42dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-basalt-900/60 p-5 lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0 lg:p-7">
              <p className="text-xs uppercase tracking-[0.2em] text-mist-50/60">What is true here</p>
              {t(tour.summary) && <p className="mt-3 text-sm leading-relaxed text-mist-50/80">{t(tour.summary)}</p>}
              <ul className="mt-5 grid gap-2">
                {tour.hotspots.map((h) => {
                  const I = KIND[h.kind];
                  const on = spot === h.id;
                  return (
                    <li key={h.id}>
                      <button type="button" onClick={() => openSpot(h.id, h.frame)} className={cn('flex w-full items-start gap-3 rounded-[var(--r-md)] px-3 py-2.5 text-left transition', on ? 'bg-white/10' : 'hover:bg-white/5')} aria-expanded={on}>
                        <I className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden />
                        <span>
                          <span className="block font-medium">{t(h.label)}</span>
                          {on && t(h.note) && <span className="mt-1 block text-sm text-mist-50/70">{t(h.note)}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {active && !drawings && <p className="mt-3 text-xs text-mist-50/50">Look for it in the walk.</p>}
              {cta && (
                <Link href={cta.href} onClick={() => { track(tour.id, 'CTA_CLICK', context); setOpen(false); }} className="btn mt-7 w-full">
                  <span className="btn-label">{cta.label}</span>
                </Link>
              )}
            </aside>
          </div>
        )}
      </dialog>
    </>
  );
}

/** The "Walk this room" button with the tour's poster. */
export function TourLauncher({ tour, context, cta, label = 'Walk this room', className }: { tour: TourDTO; context: Context; cta?: { label: string; href: string }; label?: string; className?: string }) {
  return (
    <TourPlayer tour={tour} context={context} cta={cta}>
      {(open) => (
        <button type="button" onClick={open} className={cn('group relative flex w-full items-center gap-4 overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface p-3 text-left transition hover:border-fg/30 hover:shadow-[var(--shadow-soft)]', className)}>
          <span className="relative size-20 shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-2">
            {tour.poster && <Image src={tour.poster.url} alt="" fill sizes="80px" className="object-cover transition duration-700 group-hover:scale-110" />}
            <span className="absolute inset-0 grid place-items-center bg-basalt-950/35 text-white"><Rotate3d className="size-7" aria-hidden /></span>
          </span>
          <span>
            <span className="block font-medium">{label}</span>
            <span className="text-sm text-fg-muted">{tour.stage === 'LIVE' ? 'Step inside the finished room' : tour.frames.length && tour.frames.every((f) => f.isRendering) ? 'A walk through the drawings' : 'A first walk through the room'}</span>
          </span>
        </button>
      )}
    </TourPlayer>
  );
}
