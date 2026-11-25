'use client';
import { useEffect, useState } from 'react';
import {
  CONSENT_COOKIE,
  CONSENT_KEYS,
  CONSENT_MAX_AGE_DAYS,
  CONSENT_VERSION,
  OPTIONAL_CATEGORIES,
  type ConsentChoices,
  type ConsentState,
  type OptionalCategory,
} from '@reberon/contracts';

/**
 * The visitor's cookie choices, in a first-party cookie the server can also read.
 * Nothing optional is stored, loaded or sent until the matching category is on.
 */

export const CONSENT_EVENT = 'rb:consent';
export const OPEN_SETTINGS_EVENT = 'rb:cookie-settings';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`).toLowerCase();

export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1))) as ConsentState;
    // A newer policy asks again.
    if (v.v !== CONSENT_VERSION || !v.choices || !v.id) return null;
    return v;
  } catch {
    return null;
  }
}

export function hasConsent(cat: OptionalCategory): boolean {
  return readConsent()?.choices[cat] === true;
}

/** Global Privacy Control (and Do Not Track): a standing "no" to anything optional. */
export function privacySignal(): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

/** Delete what an "off" category had stored, at once. */
function purge(choices: ConsentChoices) {
  for (const cat of OPTIONAL_CATEGORIES) {
    if (choices[cat]) continue;
    for (const key of CONSENT_KEYS[cat]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* private mode */
      }
    }
  }
}

export function writeConsent(choices: ConsentChoices, method: 'accept_all' | 'reject_all' | 'custom' | 'gpc', log?: (s: ConsentState, method: string) => void): ConsentState {
  const prev = readConsent();
  const state: ConsentState = { v: CONSENT_VERSION, id: prev?.id ?? newId(), at: new Date().toISOString(), choices };
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${CONSENT_MAX_AGE_DAYS * 86_400}; SameSite=Lax${secure}`;
  purge(choices);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  log?.(state, method);
  return state;
}

export const openCookieSettings = () => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));

/** Live consent for components (re-renders when the visitor changes their mind). */
export function useConsent() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(readConsent());
    setReady(true);
    const on = (e: Event) => setState((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, []);
  return { state, ready, allowed: (cat: OptionalCategory) => state?.choices[cat] === true };
}

/**
 * Storage for things the visitor may want remembered (Preferences): kept between visits
 * only with consent; otherwise just for this tab, gone when it closes.
 */
export const preferenceStore = {
  get(key: string): string | null {
    try {
      return (hasConsent('preferences') ? localStorage.getItem(key) : null) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      if (hasConsent('preferences')) localStorage.setItem(key, value);
      else sessionStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};
