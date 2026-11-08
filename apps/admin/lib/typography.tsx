'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readTypography, typographyVars, type Typography } from '@reberon/contracts';

import { TYPO_CACHE } from './typography-boot';

/** Put a typography's CSS variables on <html> (and remember them for the next load). */
export function applyHouseTypography(t: Typography) {
  const vars = typographyVars(t, 'house');
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  try {
    localStorage.setItem(TYPO_CACHE, JSON.stringify(vars));
  } catch {
    /* private mode */
  }
}

/** The site settings everyone may read; the same query feeds the Typography settings screen. */
export function useSiteTypography() {
  return useQuery({
    queryKey: ['site-typography'],
    queryFn: async () => {
      const r = await fetch('/v1/public/site', { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      return readTypography(((await r.json()) as { typography?: unknown }).typography);
    },
    staleTime: 5 * 60_000,
  });
}

/** Keeps the House in the fonts chosen in Settings → Typography. */
export function TypographyApplier() {
  const { data } = useSiteTypography();
  useEffect(() => {
    if (data) applyHouseTypography(data);
  }, [data]);
  return null;
}
