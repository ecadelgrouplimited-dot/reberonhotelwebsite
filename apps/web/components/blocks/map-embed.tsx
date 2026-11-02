'use client';
import { useState } from 'react';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';

/**
 * A designed static map card; the interactive OpenStreetMap only loads when
 * asked for (no third-party weight on the page by default).
 */
export function MapEmbed({ lat, lng, zoom, label }: { lat: number; lng: number; zoom: number; label: string }) {
  const [live, setLive] = useState(false);
  const d = 0.02 * (14 / zoom);
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d * 0.6},${lng + d},${lat + d * 0.6}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <div className="overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface" data-reveal>
      <div className="relative aspect-[16/10] bg-moss-900">
        {live ? (
          <iframe title={`Map showing ${label}`} src={osm} className="absolute inset-0 size-full" loading="lazy" />
        ) : (
          <button type="button" onClick={() => setLive(true)} className="group absolute inset-0 text-mist-50" aria-label="Load the interactive map">
            <svg viewBox="0 0 800 500" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
              {Array.from({ length: 16 }, (_, i) => (
                <ellipse key={i} cx={420 + Math.sin(i) * 14} cy={250 + Math.cos(i) * 8} rx={40 + i * 34} ry={24 + i * 21} fill="none" stroke="#9DA4CC" strokeOpacity={0.14 + (i % 3) * 0.05} transform={`rotate(${-14 + i * 1.6} 420 250)`} />
              ))}
              <path d="M40 470 C 200 380, 260 330, 380 280 S 520 250, 420 250" fill="none" stroke="#D76E1B" strokeWidth="3" strokeDasharray="8 8" opacity=".8" />
            </svg>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
              <span className="relative grid size-14 place-items-center rounded-full bg-accent shadow-[0_0_0_10px_rgb(215_110_27/.25)]">
                <MapPin className="size-6" />
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
              </span>
            </span>
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-basalt-950/70 px-4 py-2 text-sm backdrop-blur-md transition-colors group-hover:bg-basalt-950">
              Show interactive map
            </span>
            <span className="absolute left-5 top-5 font-mono text-xs opacity-60 tabular">
              {lat.toFixed(4)}°N {lng.toFixed(4)}°E
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
          <Navigation className="size-4" aria-hidden /> Directions
        </a>
        <a className="btn btn-secondary" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
          Google Maps <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <a className="btn btn-secondary" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
          OpenStreetMap <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
