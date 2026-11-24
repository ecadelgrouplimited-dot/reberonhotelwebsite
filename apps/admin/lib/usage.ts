'use client';
/**
 * What this person does in the House, kept on this device only (never sent anywhere):
 *  - how often and at what hours they open each app — for “Suggested for you”;
 *  - the trail of screens in this tab — for “Back to …”, so a hidden sidebar never
 *    means starting again from Home.
 */

interface AppUse {
  /** Visits, fading with a one-week half-life so old habits give way to new ones. */
  score: number;
  last: number;
  /** Visits per hour of the day (0–23), local time. */
  hours: number[];
  total: number;
}

import { ownKey } from './owner';

const usageKey = () => ownKey('rb-usage');
const trailKey = () => ownKey('rb-trail');
const HALF_LIFE = 7 * 24 * 3600_000;
const EVENT = 'rb:usage';

const decayed = (u: AppUse, now = Date.now()) => u.score * Math.pow(0.5, (now - u.last) / HALF_LIFE);

export function readUsage(): Record<string, AppUse> {
  try {
    const raw = JSON.parse(localStorage.getItem(usageKey()) ?? '{}') as Record<string, AppUse>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function recordAppUse(href: string) {
  try {
    const all = readUsage();
    const now = Date.now();
    const prev = all[href];
    // A reload or a quick bounce back within a minute is the same visit.
    if (prev && now - prev.last < 60_000) return;
    const hours = prev?.hours?.length === 24 ? [...prev.hours] : Array<number>(24).fill(0);
    hours[new Date(now).getHours()]! += 1;
    all[href] = { score: (prev ? decayed(prev, now) : 0) + 1, last: now, hours, total: (prev?.total ?? 0) + 1 };
    // Keep the 60 most used.
    const kept = Object.entries(all)
      .sort((a, b) => decayed(b[1], now) - decayed(a[1], now))
      .slice(0, 60);
    localStorage.setItem(usageKey(), JSON.stringify(Object.fromEntries(kept)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

export function forgetUsage() {
  try {
    localStorage.removeItem(usageKey());
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

export interface Suggestion {
  href: string;
  score: number;
  reason: string;
  /** Suggested from this person's own use (not only because something is waiting). */
  learned: boolean;
}

const hourLabel = (h: number) => (h === 0 ? 'midnight' : h < 12 ? `${h} am` : h === 12 ? 'noon' : `${h - 12} pm`);

/**
 * Rank apps for right now: how much they are used (recent use counts most), whether
 * they are usually opened around this hour, and whether something in them needs a
 * person (live counters). The screen you are on is never suggested.
 */
export function suggest(opts: {
  allowed: string[];
  exclude?: string[];
  urgent?: Record<string, { count: number; tone: string; tooltip: string }>;
  fallback?: string[];
  limit?: number;
  now?: Date;
}): Suggestion[] {
  const now = opts.now ?? new Date();
  const usage = readUsage();
  const hour = now.getHours();
  const skip = new Set(opts.exclude ?? []);
  const allowed = opts.allowed.filter((h) => !skip.has(h));
  const max = Math.max(1, ...allowed.map((h) => (usage[h] ? decayed(usage[h]!, now.getTime()) : 0)));

  const out: Suggestion[] = allowed.map((href) => {
    const u = usage[href];
    const freq = u ? decayed(u, now.getTime()) / max : 0;
    // Visits within an hour either side of now, as a share of all visits to this app.
    const near = u ? (u.hours[(hour + 23) % 24]! + u.hours[hour]! * 2 + u.hours[(hour + 1) % 24]!) / Math.max(1, u.total * 2) : 0;
    const peak = u ? u.hours.indexOf(Math.max(...u.hours)) : -1;
    const urgent = opts.urgent?.[href];
    // Something waiting nudges an app up; habits lead.
    const urgency = urgent && urgent.count > 0 ? (urgent.tone === 'red' ? 0.35 : urgent.tone === 'amber' ? 0.25 : 0.05) : 0;
    const fallback = opts.fallback?.includes(href) ? 0.25 - opts.fallback.indexOf(href) * 0.02 : 0;
    const score = freq * 1.4 + Math.min(near, 1) * 1.1 + urgency + (u ? 0 : fallback);

    let reason = '';
    if (u && u.total >= 3 && near >= 0.35) reason = `You often open this around ${hourLabel(peak >= 0 ? peak : hour)}`;
    else if (u && freq >= 0.6) reason = 'One of your most used';
    else if (u && urgency >= 0.25) reason = urgent!.tooltip;
    else if (u) reason = u.total > 1 ? `Opened ${u.total} times` : 'Opened recently';
    else if (fallback) reason = 'Part of your job';
    else if (urgent && urgent.count > 0) reason = urgent.tooltip;
    return { href, score, reason, learned: !!u || !!fallback };
  });

  return out
    .filter((s) => s.score > 0.05 && s.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 6);
}

/* ── The trail of screens in this tab ──────────────────────────────────── */

export interface TrailStep {
  path: string;
  at: number;
}

export function readTrail(): TrailStep[] {
  try {
    return JSON.parse(sessionStorage.getItem(trailKey()) ?? '[]') as TrailStep[];
  } catch {
    return [];
  }
}

/** Called on every screen change. Going back to the previous step shortens the trail. */
export function stepTrail(path: string) {
  try {
    const trail = readTrail();
    const last = trail[trail.length - 1];
    if (last?.path === path) return;
    if (trail[trail.length - 2]?.path === path) trail.pop();
    else trail.push({ path, at: Date.now() });
    sessionStorage.setItem(trailKey(), JSON.stringify(trail.slice(-30)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

/** The screen before this one, or null at the start of the trail. */
export function previousStep(): TrailStep | null {
  const trail = readTrail();
  return trail.length > 1 ? trail[trail.length - 2]! : null;
}

export const USAGE_EVENT = EVENT;
