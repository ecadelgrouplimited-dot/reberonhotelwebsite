import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { LText } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { MediaImage } from '@/components/ui/media-image';
import { SectionHeading } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';
import type { BlockProps } from './types';

type Card = { media?: string | null; kicker?: LText; title?: LText; text?: LText; linkLabel?: LText; href?: string };
type D = { eyebrow?: LText; heading?: LText; intro?: LText; items?: Card[] };

const external = (href: string) => /^https?:\/\//.test(href);

function CardLink({ href, children, className, label }: { href?: string; children: React.ReactNode; className?: string; label: string }) {
  if (!href) return <div className={className}>{children}</div>;
  return external(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

/** Image cards that link anywhere — experiences, offers, things to plan. */
export function Cards({ block, media }: BlockProps<D>) {
  const items = (block.data.items ?? []).filter((c) => t(c.title));
  if (!items.length) return null;
  const v = block.variant ?? 'grid';
  const cols = items.length === 1 ? 'sm:grid-cols-1 max-w-2xl' : items.length === 2 || items.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={cn(v === 'carousel' ? '' : 'container-x')}>
      <div className={cn(v === 'carousel' && 'container-x')}>
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-12" />
      </div>
      <ul
        style={v === 'carousel' ? { paddingInline: 'max(clamp(1rem, 4vw, 2.5rem), calc((100vw - 1320px) / 2 + clamp(1rem, 4vw, 2.5rem)))', scrollPaddingInline: 'max(clamp(1rem, 4vw, 2.5rem), calc((100vw - 1320px) / 2 + clamp(1rem, 4vw, 2.5rem)))' } : undefined}
        className={cn(
          v === 'carousel'
            ? 'scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4'
            : cn('grid gap-5', cols),
        )}
      >
        {items.map((c, i) => {
          const img = c.media ? media[c.media] : null;
          const title = t(c.title);
          const more = t(c.linkLabel);
          if (v === 'overlay') {
            return (
              <li key={i} data-reveal style={{ ['--i' as string]: i }}>
                <CardLink href={c.href} label={title} className="group relative block overflow-hidden rounded-[var(--r-xl)] bg-surface-2">
                  <MediaImage media={img} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-[4/5]" imgClassName="transition-transform duration-[1.2s] ease-out group-hover:scale-105" badge />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                    {t(c.kicker) && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">{t(c.kicker)}</p>}
                    <h3 className="font-display text-step-2 leading-tight">{title}</h3>
                    {t(c.text) && <p className="mt-2 line-clamp-3 text-sm text-white/80">{t(c.text)}</p>}
                    {c.href && (
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
                        {more || 'Read more'} <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                </CardLink>
              </li>
            );
          }
          return (
            <li key={i} data-reveal style={{ ['--i' as string]: i }} className={cn(v === 'carousel' && 'w-[min(80vw,22rem)] shrink-0 snap-start')}>
              <CardLink href={c.href} label={title} className="group flex h-full flex-col overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-lift)]">
                {img && <MediaImage media={img} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 85vw" className="aspect-[3/2]" imgClassName="transition-transform duration-[1.2s] ease-out group-hover:scale-105" badge />}
                <div className="flex flex-1 flex-col p-6">
                  {t(c.kicker) && <p className="eyebrow mb-3">{t(c.kicker)}</p>}
                  <h3 className="font-display text-step-1 leading-snug text-fg">{title}</h3>
                  {t(c.text) && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(c.text)}</p>}
                  {c.href && (
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-fg">
                      {more || 'Read more'} <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>
              </CardLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
