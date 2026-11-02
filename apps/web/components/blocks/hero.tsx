import type { Cta, LText, MediaRef } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { MediaImage, RenderingBadge } from '@/components/ui/media-image';
import { Words } from '@/components/ui/words';
import { CtaButton } from '@/components/site/cta-button';
import { resolveCta } from '@/lib/cta';
import { cn } from '@/lib/cn';
import { HeroSlides } from './hero-slides';
import type { BlockProps } from './types';

interface HeroData {
  eyebrow?: LText;
  heading: LText;
  sub?: LText;
  media?: string[];
  ctas?: Cta[];
  showScrollCue?: boolean;
}

/** Deterministic ridge silhouettes that sit in front of the photo. */
function ridge(seed: number, base: number, amp: number) {
  let d = `M0 200 L0 ${base}`;
  for (let x = 0; x <= 1600; x += 20) {
    const y = base - Math.sin(x / 210 + seed) * amp - Math.sin(x / 83 + seed * 2.3) * (amp / 3.2) - Math.sin(x / 37 + seed) * (amp / 9);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L1600 200 Z`;
}

function Ctas({ ctas, site, ctx, light }: { ctas: Cta[]; site: BlockProps['site']; ctx: BlockProps['ctx']; light?: boolean }) {
  if (!ctas.length) return null;
  return (
    <div className="fade-up mt-9 flex flex-wrap gap-3" style={{ ['--d' as string]: '1.05s' }}>
      {ctas.map((c, i) => (
        <CtaButton key={i} cta={resolveCta(c, site, ctx)} style={c.style ?? (i ? 'secondary' : 'primary')} size="lg" className={light && c.style === 'secondary' ? 'text-mist-50' : undefined} />
      ))}
    </div>
  );
}

export function Hero({ block, media, site, ctx, index }: BlockProps<HeroData>) {
  const d = block.data;
  const images = (d.media ?? []).map((id) => media[id]).filter(Boolean) as MediaRef[];
  const variant = block.variant ?? 'fullbleed';
  const first = index === 0;
  const heading = t(d.heading);

  if (variant === 'split') {
    return (
      <section className={cn('container-x grid items-center gap-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16', first ? 'pt-28 md:pt-36' : 'pt-16')}>
        <div>
          {t(d.eyebrow) && <p className="eyebrow fade-up mb-6" style={{ ['--d' as string]: '0.1s' }}>{t(d.eyebrow)}</p>}
          <Words as="h1" text={heading} className="block text-step-5 text-fg" />
          {t(d.sub) && <p className="fade-up mt-7 max-w-xl text-step-1 leading-relaxed text-fg-muted" style={{ ['--d' as string]: '0.8s' }}>{t(d.sub)}</p>}
          <Ctas ctas={d.ctas ?? []} site={site} ctx={ctx} />
        </div>
        <div className="relative" data-reveal="mask">
          <MediaImage media={images[0]} sizes="(min-width: 1024px) 45vw, 100vw" priority={first} className="aspect-[4/5] rounded-[var(--r-xl)] md:aspect-[5/6]" imgClassName="ken-burns" badge />
          <svg className="absolute -bottom-6 -left-6 hidden h-24 w-24 text-gold-400 md:block" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 5" />
          </svg>
        </div>
      </section>
    );
  }

  const compact = variant === 'compact';
  const mist = variant === 'mist';
  const slides = images.slice(0, mist ? 3 : 1).map((m, i) => (
    <div className="hero-parallax absolute inset-0" key={m.id}>
      <MediaImage media={m} sizes="100vw" priority={first && i === 0} className="absolute inset-0" imgClassName="ken-burns" />
      {/* The label belongs to the image on screen: it fades in and out with its slide. */}
      {m.isRendering && <RenderingBadge className="!top-24 !right-[clamp(1rem,4vw,2.5rem)]" />}
    </div>
  ));

  return (
    <section
      data-hero-overlay
      className={cn('grain relative isolate flex overflow-hidden bg-moss-900 text-mist-50', compact ? 'min-h-[68svh] items-end md:min-h-[72svh]' : 'min-h-[100svh] items-end')}
    >
      <div className="absolute inset-0 -z-10">
        {slides.length ? <HeroSlides slides={slides} /> : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(14_17_38/.58)_0%,rgb(14_17_38/.08)_32%,rgb(14_17_38/.22)_58%,rgb(14_17_38/.82)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(14_17_38/.52)_0%,rgb(14_17_38/.15)_45%,transparent_70%)]" />
      </div>

      {mist && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-[5] h-[46%]" aria-hidden>
          <div className="mist-drift absolute -inset-x-1/4 bottom-[28%] h-40 rounded-[50%] bg-white/25 blur-3xl" style={{ ['--dur' as string]: '70s' }} />
          <div className="mist-drift-rev absolute -inset-x-1/4 bottom-[8%] h-32 rounded-[50%] bg-white/20 blur-3xl" style={{ ['--dur' as string]: '95s' }} />
          <svg viewBox="0 0 1600 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-full w-full">
            <defs>
              <linearGradient id="r1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#262C5E" stopOpacity=".55" />
                <stop offset="1" stopColor="#1A1E43" stopOpacity=".9" />
              </linearGradient>
              <linearGradient id="r2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1A1E43" stopOpacity=".85" />
                <stop offset="1" stopColor="#0E1126" />
              </linearGradient>
            </defs>
            <path d={ridge(1.3, 120, 34)} fill="url(#r1)" />
            <path d={ridge(4.1, 168, 22)} fill="url(#r2)" />
          </svg>
        </div>
      )}

      <div className={cn('hero-fade container-x relative w-full', compact ? 'pb-14 pt-36 md:pb-20' : 'pb-24 pt-40 md:pb-28')}>
        <div className="max-w-5xl">
          {t(d.eyebrow) && (
            <p className="fade-up mb-6 flex items-center gap-3 text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-gold-200" style={{ ['--d' as string]: '0.1s' }}>
              <span className="h-px w-10 bg-gold-400" aria-hidden />
              {t(d.eyebrow)}
            </p>
          )}
          <Words as="h1" text={heading} className={cn('block text-balance drop-shadow-[0_2px_24px_rgb(0_0_0/.25)]', compact ? 'text-step-5' : 'text-step-6 leading-[0.98]')} />
          {t(d.sub) && (
            <p className="fade-up mt-7 max-w-2xl text-step-1 leading-relaxed text-mist-50/85" style={{ ['--d' as string]: '0.85s' }}>
              {t(d.sub)}
            </p>
          )}
          <Ctas ctas={d.ctas ?? []} site={site} ctx={ctx} light />
        </div>
      </div>

      {d.showScrollCue && !compact && (
        <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 text-[0.68rem] uppercase tracking-[0.3em] text-mist-50/70 md:flex" aria-hidden>
          Scroll
          <span className="scroll-cue block h-12 w-px bg-mist-50/70" />
        </div>
      )}
    </section>
  );
}
