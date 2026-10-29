'use client';
import Image from 'next/image';
import { Camera, Expand, Images } from 'lucide-react';
import type { MediaRef } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { Lightbox } from '@/components/blocks/lightbox';

export function FacilityGallery({
  photos,
  facilityName,
}: {
  photos: MediaRef[];
  facilityName: string;
}) {
  if (!photos || photos.length === 0) return null;

  return (
    <Lightbox items={photos}>
      {(open) => (
        <section aria-label={`${facilityName} photo gallery`} className="relative">
          {photos.length === 1 ? (
            /* Single Image Layout */
            <div
              onClick={() => open(0)}
              className="group relative aspect-[16/9] w-full overflow-hidden rounded-[var(--r-xl)] bg-surface-2 cursor-pointer shadow-[var(--shadow-soft)]"
            >
              <Image
                src={photos[0].url}
                alt={t(photos[0].alt) || facilityName}
                fill
                priority
                sizes="(min-width: 1024px) 1100px, 100vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                placeholder={photos[0].lqip ? 'blur' : 'empty'}
                blurDataURL={photos[0].lqip ?? undefined}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-basalt-950/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-basalt-950/80 px-4 py-2 font-mono text-xs text-mist-50 backdrop-blur-md">
                <Expand className="size-3.5" />
                <span>View Full Photo</span>
              </div>
            </div>
          ) : photos.length === 2 ? (
            /* 2 Images Side-by-Side */
            <div className="grid gap-4 sm:grid-cols-2">
              {photos.map((photo, idx) => (
                <div
                  key={photo.id || idx}
                  onClick={() => open(idx)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-[var(--r-xl)] bg-surface-2 cursor-pointer shadow-[var(--shadow-soft)]"
                >
                  <Image
                    src={photo.url}
                    alt={t(photo.alt) || `${facilityName} photo ${idx + 1}`}
                    fill
                    sizes="(min-width: 1024px) 550px, 100vw"
                    priority={idx === 0}
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    placeholder={photo.lqip ? 'blur' : 'empty'}
                    blurDataURL={photo.lqip ?? undefined}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-basalt-950/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-basalt-950/80 px-3 py-1.5 font-mono text-[11px] text-mist-50 backdrop-blur-md">
                    <Expand className="size-3" />
                    <span>Photo {idx + 1} of 2</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Multi-Image Mosaic Grid (3+ Images) */
            <div className="grid gap-4 md:grid-cols-12">
              {/* Featured Main Image */}
              <div
                onClick={() => open(0)}
                className="group relative aspect-[16/10] overflow-hidden rounded-[var(--r-xl)] bg-surface-2 cursor-pointer shadow-[var(--shadow-soft)] md:col-span-8"
              >
                <Image
                  src={photos[0].url}
                  alt={t(photos[0].alt) || facilityName}
                  fill
                  priority
                  sizes="(min-width: 1024px) 750px, 100vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  placeholder={photos[0].lqip ? 'blur' : 'empty'}
                  blurDataURL={photos[0].lqip ?? undefined}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-basalt-950/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-basalt-950/80 px-3.5 py-1.5 font-mono text-xs text-mist-50 backdrop-blur-md">
                  <Camera className="size-3.5 text-brand" />
                  <span>Main View</span>
                </div>
              </div>

              {/* Secondary Thumbnails Column */}
              <div className="grid grid-cols-2 gap-4 md:col-span-4 md:grid-cols-1">
                {photos.slice(1, 3).map((photo, i) => {
                  const actualIdx = i + 1;
                  const isLastVisible = actualIdx === 2 && photos.length > 3;
                  return (
                    <div
                      key={photo.id || actualIdx}
                      onClick={() => open(actualIdx)}
                      className="group relative aspect-[16/10] overflow-hidden rounded-[var(--r-xl)] bg-surface-2 cursor-pointer shadow-[var(--shadow-soft)]"
                    >
                      <Image
                        src={photo.url}
                        alt={t(photo.alt) || `${facilityName} detail ${actualIdx}`}
                        fill
                        sizes="(min-width: 1024px) 380px, 50vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        placeholder={photo.lqip ? 'blur' : 'empty'}
                        blurDataURL={photo.lqip ?? undefined}
                      />
                      <div className="absolute inset-0 bg-basalt-950/20 group-hover:bg-basalt-950/10 transition" />
                      {isLastVisible ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-basalt-950/70 text-mist-50 backdrop-blur-xs transition group-hover:bg-basalt-950/60">
                          <Images className="size-6 text-brand mb-1" />
                          <span className="font-display text-lg font-medium">+{photos.length - 2} more</span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-mist-50/70">View Gallery</span>
                        </div>
                      ) : (
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-basalt-950/80 px-2.5 py-1 font-mono text-[11px] text-mist-50 backdrop-blur-md">
                          <Expand className="size-3" />
                          <span>View</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show All Photos Button */}
          {photos.length > 2 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => open(0)}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-mono text-xs font-medium text-fg transition hover:border-brand/40 hover:bg-surface-2 cursor-pointer"
              >
                <Images className="size-3.5 text-brand" />
                <span>Browse All {photos.length} High-Res Photos</span>
              </button>
            </div>
          )}
        </section>
      )}
    </Lightbox>
  );
}
