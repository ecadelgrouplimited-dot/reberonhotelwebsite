'use client';

/**
 * The visitor's accessibility choices. Stored on this device only (an explicit request,
 * so "necessary" under the cookie policy) and applied as data-a11y-* attributes on <html>,
 * which globals.css turns into styles. The boot script applies them before first paint.
 */
export const A11Y_KEY = 'rb-a11y';
export const A11Y_EVENT = 'rb:a11y';
export const TEXT_SCALES = [100, 112, 125, 140, 160] as const;

export interface A11ySettings {
  text: (typeof TEXT_SCALES)[number];
  spacing: boolean;
  font: boolean;
  contrast: boolean;
  gray: boolean;
  links: boolean;
  motion: boolean;
  cursor: boolean;
  focus: boolean;
  noimg: boolean;
  guide: boolean;
}

export const A11Y_DEFAULTS: A11ySettings = { text: 100, spacing: false, font: false, contrast: false, gray: false, links: false, motion: false, cursor: false, focus: false, noimg: false, guide: false };

export function readA11y(): A11ySettings {
  try {
    const raw = JSON.parse(localStorage.getItem(A11Y_KEY) ?? '{}') as Partial<A11ySettings>;
    const s = { ...A11Y_DEFAULTS, ...raw };
    if (!TEXT_SCALES.includes(s.text)) s.text = 100;
    return s;
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

export function applyA11y(s: A11ySettings) {
  const d = document.documentElement;
  const flag = (name: string, on: boolean) => (on ? d.setAttribute(`data-a11y-${name}`, '') : d.removeAttribute(`data-a11y-${name}`));
  if (s.text === 100) d.removeAttribute('data-a11y-text');
  else d.setAttribute('data-a11y-text', String(s.text));
  for (const k of ['spacing', 'font', 'contrast', 'gray', 'links', 'motion', 'cursor', 'focus', 'noimg', 'guide'] as const) flag(k, s[k]);
}

export function writeA11y(s: A11ySettings) {
  try {
    const changed = Object.entries(s).some(([k, v]) => A11Y_DEFAULTS[k as keyof A11ySettings] !== v);
    if (changed) localStorage.setItem(A11Y_KEY, JSON.stringify(s));
    else localStorage.removeItem(A11Y_KEY);
  } catch {
    /* private mode: still applied for this page */
  }
  applyA11y(s);
  window.dispatchEvent(new CustomEvent(A11Y_EVENT, { detail: s }));
}

/** True when the visitor asked for no motion — here or in their device settings. */
export function motionOff() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute('data-a11y-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
