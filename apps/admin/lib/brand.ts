'use client';

/**
 * The hotel's identity on everything the House prints or exports. It comes from the
 * public site settings (owner-edited), is remembered on the device for offline use,
 * and falls back to the bundled logo and name.
 */
export interface Brand {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string;
}

export const BRAND_NAVY = '#1A1E43';
export const BRAND_COPPER = '#D76E1B';
const KEY = 'rb:brand';
const FALLBACK: Brand = { name: 'Reberon Hotel', address: null, phone: null, email: null, logo: '/brand/logo-horizontal-light.svg' };

let cached: Brand | null = null;
let pending: Promise<Brand> | null = null;

const text = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const s = o.en ?? Object.values(o)[0];
    return typeof s === 'string' ? s.trim() || null : null;
  }
  return null;
};

function stored(): Brand | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...FALLBACK, ...(JSON.parse(raw) as Partial<Brand>), logo: FALLBACK.logo } : null;
  } catch {
    return null;
  }
}

export function brandNow(): Brand {
  return cached ?? stored() ?? FALLBACK;
}

export function loadBrand(): Promise<Brand> {
  if (cached) return Promise.resolve(cached);
  pending ??= (async () => {
    try {
      const res = await fetch('/v1/public/site', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const s = (await res.json()) as { name?: unknown; contact?: { phones?: string[]; email?: string | null; address?: unknown } };
      cached = {
        name: text(s.name) ?? FALLBACK.name,
        address: text(s.contact?.address),
        phone: s.contact?.phones?.[0] ?? null,
        email: s.contact?.email ?? null,
        logo: FALLBACK.logo,
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(cached));
      } catch {
        /* private mode */
      }
    } catch {
      cached = stored() ?? FALLBACK;
    }
    pending = null;
    return cached;
  })();
  return pending;
}
