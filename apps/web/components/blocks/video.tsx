import type { LText } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { SectionHeading } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';
import { parseVideo } from '@/lib/video';
import { VideoPlayer } from './video-player';
import type { BlockProps } from './types';

type D = { eyebrow?: LText; heading?: LText; intro?: LText; url?: string; poster?: string | null; caption?: LText };

/** A film that loads nothing until the visitor presses play. */
export function Video({ block, media }: BlockProps<D>) {
  const d = block.data;
  const src = parseVideo(d.url ?? '');
  if (!src) return null;
  const poster = d.poster ? media[d.poster] : null;
  const wide = block.variant === 'wide';
  return (
    <div>
      <div className="container-x">
        <SectionHeading eyebrow={d.eyebrow} heading={d.heading} intro={d.intro} className="mb-12" />
      </div>
      <figure className={cn(!wide && 'container-x')} data-reveal="scale">
        <VideoPlayer src={src} poster={poster} title={t(d.heading) || t(d.caption) || 'Video'} rounded={!wide} />
        {t(d.caption) && <figcaption className={cn('mt-3 text-sm text-fg-subtle', wide && 'container-x')}>{t(d.caption)}</figcaption>}
      </figure>
    </div>
  );
}
