'use client';
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A calm, modern slider: native scroll-snap (smooth on phones, works without JS),
 * mouse drag on computers, arrow keys, a progress line and counter, edges that fade
 * into whatever the section's background is (light or dark theme), and an optional
 * gentle auto-advance that pauses on hover, focus, hidden tabs and reduced motion.
 */
export function Slider({
  children,
  label,
  itemClassName,
  autoplayMs,
  className,
}: {
  children: ReactNode;
  label: string;
  /** Width of each slide, e.g. "w-[82vw] sm:w-[46vw] lg:w-[30vw]". */
  itemClassName: string;
  autoplayMs?: number;
  className?: string;
}) {
  const items = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ start: true, end: false, index: 0 });
  const paused = useRef(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth;
    setState({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8, index: Math.round(el.scrollLeft / step) });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const go = useCallback((dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    // At the end, auto-advance wraps to the start.
    if (dir === 1 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!autoplayMs || items.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (!paused.current && document.visibilityState === 'visible') go(1);
    }, autoplayMs);
    return () => clearInterval(t);
  }, [autoplayMs, items.length, go]);

  const btn = 'grid size-11 place-items-center rounded-full border border-line-strong bg-surface text-fg transition hover:bg-surface-2 disabled:opacity-30';
  const shown = state.end ? items.length : Math.min(items.length, state.index + 1);

  return (
    <div
      className={cn('relative', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
    >
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), go(1));
          if (e.key === 'ArrowLeft') (e.preventDefault(), go(-1));
        }}
        onPointerDown={(e) => {
          // Mouse drag only; touch uses native scrolling.
          if (e.pointerType !== 'mouse' || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = ref.current;
          if (!d || !el) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 5) {
            if (!d.moved) {
              el.style.scrollSnapType = 'none';
              el.style.cursor = 'grabbing';
            }
            d.moved = true;
            el.scrollLeft = d.left - dx;
          }
        }}
        onPointerUp={() => {
          const el = ref.current;
          if (el && drag.current?.moved) {
            el.style.scrollSnapType = '';
            el.style.cursor = '';
            // Let it settle on the nearest slide.
            const first = el.firstElementChild as HTMLElement | null;
            const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth;
            el.scrollTo({ left: Math.round(el.scrollLeft / step) * step, behavior: 'smooth' });
          }
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => {
          if (drag.current?.moved && ref.current) {
            ref.current.style.scrollSnapType = '';
            ref.current.style.cursor = '';
          }
          drag.current = null;
        }}
        onClickCapture={(e) => {
          // A drag is not a click on the card under the mouse.
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="snap-x-strip -mx-[clamp(1rem,4vw,2.5rem)] flex gap-4 overflow-x-auto px-[clamp(1rem,4vw,2.5rem)] pb-3 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:cursor-grab"
      >
        {items.map((child, i) => (
          <div key={i} className={cn('shrink-0', itemClassName)} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            {child}
          </div>
        ))}
      </div>
      <div className={cn('pointer-events-none absolute inset-y-0 -left-[clamp(1rem,4vw,2.5rem)] w-16 bg-gradient-to-r from-[var(--bg)] to-transparent transition-opacity duration-300', state.start && 'opacity-0')} aria-hidden />
      <div className={cn('pointer-events-none absolute inset-y-0 -right-[clamp(1rem,4vw,2.5rem)] w-24 bg-gradient-to-l from-[var(--bg)] to-transparent transition-opacity duration-300', state.end && 'opacity-0')} aria-hidden />
      {items.length > 1 && !(state.start && state.end) && (
        <div className="mt-8 flex items-center gap-4">
          <button type="button" className={btn} onClick={() => go(-1)} disabled={state.start} aria-label="Previous">
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" className={btn} onClick={() => go(1)} disabled={state.end} aria-label="Next">
            <ArrowRight className="size-4" />
          </button>
          <div className="h-px flex-1 bg-line" aria-hidden>
            <div className="h-px bg-fg transition-all duration-500" style={{ width: `${(shown / items.length) * 100}%` }} />
          </div>
          <span className="text-sm tabular text-fg-subtle" aria-live="polite">
            {String(shown).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
}
