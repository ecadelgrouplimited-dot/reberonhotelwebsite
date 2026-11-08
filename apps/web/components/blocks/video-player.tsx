'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import type { MediaRef } from '@reberon/contracts';
import { MediaImage } from '@/components/ui/media-image';
import { cn } from '@/lib/cn';
import type { VideoSource } from '@/lib/video';

export function VideoPlayer({ src, poster, title, rounded = true }: { src: VideoSource; poster: MediaRef | null; title: string; rounded?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const thumb = !poster && src.kind === 'youtube' ? `https://i.ytimg.com/vi/${src.id}/hqdefault.jpg` : null;
  const frame = cn('relative aspect-video w-full overflow-hidden bg-[#0d1024]', rounded && 'rounded-[var(--r-xl)]');

  if (playing) {
    if (src.kind === 'file') {
      return (
        <div className={frame}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={src.url} controls autoPlay playsInline className="absolute inset-0 size-full" title={title} />
        </div>
      );
    }
    const embed =
      src.kind === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${src.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
        : `https://player.vimeo.com/video/${src.id}?autoplay=1&dnt=1`;
    return (
      <div className={frame}>
        <iframe src={embed} title={title} className="absolute inset-0 size-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setPlaying(true)} className={cn(frame, 'group block text-left')} aria-label={`Play: ${title}`}>
      {poster ? (
        <MediaImage media={poster} sizes="100vw" className="absolute inset-0" imgClassName="transition-transform duration-[1.4s] ease-out group-hover:scale-[1.03]" />
      ) : thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.03]" loading="lazy" />
      ) : null}
      <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/10" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-20 place-items-center rounded-full bg-white/90 text-[#1A1E43] shadow-2xl ring-8 ring-white/20 backdrop-blur transition-transform duration-300 group-hover:scale-110 sm:size-24">
          <Play className="ml-1 size-8 fill-current" />
        </span>
      </span>
    </button>
  );
}
