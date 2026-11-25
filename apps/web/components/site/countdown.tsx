'use client';
import { useEffect, useState } from 'react';

/** "Starts in 3 days" / "Starts in 5 h 20 min" / "Happening now" — ticks every minute. */
export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 3 * 3600_000;
  if (now >= end) return null;
  if (now >= start) return <span className="inline-flex items-center gap-2 rounded-full bg-[#E6F4EA] px-3 py-1 text-sm font-semibold text-[#1E6B34]"><span className="size-2 animate-pulse rounded-full bg-current" />Happening now</span>;
  const mins = Math.round((start - now) / 60_000);
  const days = Math.floor(mins / 1440);
  const text = days >= 2 ? `Starts in ${days} days` : days === 1 ? 'Starts tomorrow' : mins >= 60 ? `Starts in ${Math.floor(mins / 60)} h ${mins % 60} min` : `Starts in ${mins} min`;
  return <span className="inline-flex rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-medium">{text}</span>;
}
