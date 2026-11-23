'use client';
import { useEffect, useState } from 'react';

/**
 * What this person opened recently on this device (apps, bookings, guests,
 * conversations) — for “Jump back in” on Home and the top of search.
 */
export interface RecentItem {
  href: string;
  label: string;
  /** Second line, e.g. booking code and dates. */
  detail?: string;
  kind: 'app' | 'booking' | 'guest' | 'conversation' | 'page';
  at: number;
}

const KEY = 'rb-recents';
const MAX = 16;
const EVENT = 'rb:recents';

export function readRecents(): RecentItem[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentItem[]).filter((r) => r && r.href && r.label);
  } catch {
    return [];
  }
}

export function addRecent(item: Omit<RecentItem, 'at'>) {
  try {
    const list = [{ ...item, at: Date.now() }, ...readRecents().filter((r) => r.href !== item.href)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

export function forgetRecent(href: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readRecents().filter((r) => r.href !== href)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

export function clearRecents() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* private mode */
  }
}

export function useRecents() {
  const [list, setList] = useState<RecentItem[]>([]);
  useEffect(() => {
    const read = () => setList(readRecents());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return list;
}

/** Detail pages call this once their record has loaded. */
export function useTrackRecent(item: Omit<RecentItem, 'at'> | null) {
  const key = item ? `${item.href}|${item.label}|${item.detail ?? ''}` : '';
  useEffect(() => {
    if (item) addRecent(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
