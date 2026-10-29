'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { MediaRef } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { cleanMediaCaption } from '@/lib/media-clean';

/** Accessible lightbox: keyboard arrows, swipe, Escape; triggers are the gallery tiles. */
export function Lightbox({ items, children }: { items: MediaRef[]; children: (open: (i: number) => void) => ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);

  const open = useCallback((i: number) => setIndex(i), []);
  const close = () => setIndex(null);
  const go = useCallback((dir: number) => setIndex((i) => (i === null ? i : (i + dir + items.length) % items.length)), [items.length]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (index !== null && !d.open) d.showModal();
    if (index === null && d.open) d.close();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  const m = index !== null ? items[index] : null;
  return (
    <>
      {children(open)}
      <dialog ref={ref} className="sheet" onClose={close} aria-label="Photo viewer">
        <div
          className="flex h-full flex-col bg-basalt-950/95 text-mist-50"
          onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touch.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touch.current = null;
          }}
        >
          <div className="flex items-center justify-between p-4 text-sm">
            <span className="tabular opacity-70">{index !== null ? `${index + 1} / ${items.length}` : ''}</span>
            <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full border border-white/20" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex-1">
            {m && (
              <Image key={m.id} src={m.url} alt={t(m.alt)} fill sizes="100vw" className="fade-up object-contain" style={{ ['--d' as string]: '0s' }} placeholder={m.lqip ? 'blur' : 'empty'} blurDataURL={m.lqip ?? undefined} />
            )}
            <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20" aria-label="Previous">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20" aria-label="Next">
              <ChevronRight />
            </button>
          </div>
          {(() => {
            const cleanText = m ? cleanMediaCaption(t(m.caption), t(m.alt)) : null;
            return (
              <div className="min-h-14 p-4 text-center text-sm opacity-85">
                {cleanText ? (
                  <p className="font-medium">{cleanText}</p>
                ) : (
                  <p className="text-xs uppercase tracking-[0.16em] opacity-60">Reberon Highland Sanctuary · Kapchorwa</p>
                )}
                {m?.isRendering && <span className="mt-1 inline-block text-xs opacity-60">Architectural Drawing · Mount Elgon</span>}
              </div>
            );
          })()}
        </div>
      </dialog>
    </>
  );
}
