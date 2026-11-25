import { z } from 'zod';

/**
 * Cookie & storage consent — the single source of truth. The banner, the settings
 * panel and the cookie-policy table all read this, so they can never disagree with
 * what the site really stores. Bump CONSENT_VERSION when a category or purpose
 * changes: everyone is asked again.
 */
export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE = 'rb_consent';
/** How long a choice is remembered before asking again. */
export const CONSENT_MAX_AGE_DAYS = 180;

export const CONSENT_CATEGORIES = ['necessary', 'preferences', 'analytics', 'media'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
export type OptionalCategory = Exclude<ConsentCategory, 'necessary'>;
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ['preferences', 'analytics', 'media'];

export const CONSENT_CATEGORY_INFO: Record<ConsentCategory, { label: string; description: string; required?: boolean }> = {
  necessary: {
    label: 'Necessary',
    description: 'Make the site work and keep it safe: your light/dark and currency choices, form protection against bots, and sign-in for our staff. Always on — the site cannot work without them.',
    required: true,
  },
  preferences: {
    label: 'Preferences',
    description: 'Let Sipi Concierge remember who you are between visits, so you do not have to introduce yourself again.',
  },
  analytics: {
    label: 'Analytics',
    description: 'Anonymous counts of how the virtual tours are used, so we know which rooms people want to see. No advertising, no profiles.',
  },
  media: {
    label: 'Videos & 3-D tours',
    description: 'Play videos and 3-D tours hosted by YouTube, Vimeo, Kuula or Matterport inside our pages. Those companies may set their own cookies once a player loads.',
  },
};

export interface ConsentItem {
  name: string;
  category: ConsentCategory;
  kind: 'cookie' | 'local storage' | 'session storage' | 'third party';
  provider: string;
  purpose: string;
  duration: string;
}

/** Everything the public site stores or loads, by category. Audited against the code — keep it true. */
export const CONSENT_REGISTRY: ConsentItem[] = [
  { name: 'rb_consent', category: 'necessary', kind: 'cookie', provider: 'Reberon Hotel', purpose: 'Remembers the choices you make in this panel.', duration: '6 months' },
  { name: 'rb-theme', category: 'necessary', kind: 'local storage', provider: 'Reberon Hotel', purpose: 'Remembers light or dark mode when you choose one.', duration: 'Until you clear it' },
  { name: 'rb-currency', category: 'necessary', kind: 'local storage', provider: 'Reberon Hotel', purpose: 'Remembers whether you see prices in UGX or USD.', duration: 'Until you clear it' },
  { name: 'reberon_concierge_sid', category: 'necessary', kind: 'session storage', provider: 'Reberon Hotel', purpose: 'Keeps your Sipi Concierge conversation going while this tab is open.', duration: 'Until you close the tab' },
  { name: 'rb-booking-…', category: 'necessary', kind: 'session storage', provider: 'Reberon Hotel', purpose: 'Holds your booking reference while you pay, so you can come back to it.', duration: 'Until you close the tab' },
  { name: 'cf_clearance / Turnstile', category: 'necessary', kind: 'third party', provider: 'Cloudflare', purpose: 'Checks that forms are sent by a person, not a bot.', duration: 'Session' },
  { name: 'rb_at, rb_rt, rb_session', category: 'necessary', kind: 'cookie', provider: 'Reberon Hotel', purpose: 'Keep our staff signed in. Not set for guests.', duration: '15 minutes – 30 days' },
  { name: '__prerender_bypass, __next_preview_data', category: 'necessary', kind: 'cookie', provider: 'Reberon Hotel', purpose: 'Let our staff preview pages before they are published. Not set for guests.', duration: 'Session' },
  { name: 'reberon_concierge_identity_v2', category: 'preferences', kind: 'local storage', provider: 'Reberon Hotel', purpose: 'Lets Sipi Concierge remember your name and booking between visits.', duration: 'Until you clear it or withdraw consent' },
  { name: 'rb_tour_sid, rb_tour_walked', category: 'analytics', kind: 'local storage', provider: 'Reberon Hotel', purpose: 'An anonymous number that counts virtual-tour visits once per visitor.', duration: 'Until you clear it or withdraw consent' },
  { name: 'YouTube (youtube-nocookie.com)', category: 'media', kind: 'third party', provider: 'Google', purpose: 'Plays YouTube videos. Google may set cookies once you press play.', duration: 'Set by Google' },
  { name: 'Vimeo player', category: 'media', kind: 'third party', provider: 'Vimeo', purpose: 'Plays Vimeo videos. Vimeo may set cookies once you press play.', duration: 'Set by Vimeo' },
  { name: '3-D tour players', category: 'media', kind: 'third party', provider: 'Kuula / Matterport', purpose: 'Show walk-through tours of rooms and grounds.', duration: 'Set by the provider' },
];

/** Storage keys to delete when a category is switched off. */
export const CONSENT_KEYS: Record<OptionalCategory, string[]> = {
  preferences: ['reberon_concierge_identity_v2'],
  analytics: ['rb_tour_sid', 'rb_tour_walked'],
  media: [],
};

export type ConsentChoices = Record<OptionalCategory, boolean>;

export interface ConsentState {
  v: number;
  /** Anonymous id for the consent log; not linked to anything else. */
  id: string;
  at: string;
  choices: ConsentChoices;
}

export const zConsentInput = z.object({
  id: z.string().regex(/^[a-z0-9-]{16,40}$/),
  version: z.number().int().min(1).max(1000),
  choices: z.object({ preferences: z.boolean(), analytics: z.boolean(), media: z.boolean() }),
  /** How the choice was made. */
  method: z.enum(['accept_all', 'reject_all', 'custom', 'gpc']),
  /** Page it was made on (path only). */
  path: z.string().max(200).optional(),
});

export interface ConsentStatsDTO {
  days: number;
  total: number;
  acceptAll: number;
  rejectAll: number;
  custom: number;
  gpc: number;
  byCategory: Record<OptionalCategory, number>;
  version: number;
}
