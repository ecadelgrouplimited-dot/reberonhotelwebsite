'use client';
import { useEffect, useRef } from 'react';
import type { MenuItem } from './context-menu';

/**
 * Each screen tells the House what you can do on it. Those actions lead the
 * right-click menu on empty space, appear under “On this screen” in search and
 * the shortcuts sheet, and an action with a `key` runs when that key is pressed
 * (single letters, no modifiers, never while typing). Reserved for the House:
 * g, r, /, ?.
 */
export type ScreenItem = MenuItem;
type Entry = { id: number; title: string; get: () => ScreenItem[] };

const stack: Entry[] = [];
let seq = 0;
export const RESERVED_KEYS = new Set(['g', 'r', '/', '?', '\\']);

export function useScreenActions(title: string, items: ScreenItem[]) {
  const ref = useRef(items);
  ref.current = items;
  useEffect(() => {
    const e: Entry = { id: ++seq, title, get: () => ref.current };
    stack.push(e);
    return () => {
      const i = stack.findIndex((x) => x.id === e.id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [title]);
}

/** The screen in front (the most recently opened one that registered actions). */
export function currentScreen(): { title: string; items: ScreenItem[] } | null {
  const e = stack.at(-1);
  if (!e) return null;
  const items = e.get();
  return items.some((it) => (it.kind ?? 'item') === 'item') ? { title: e.title, items } : null;
}

/** Put the cursor in the screen's own search box. */
export function focusSearch() {
  const el = document.querySelector<HTMLInputElement>('main input[type="search"], main input[placeholder^="Search" i], main input[placeholder*="search" i], main input[placeholder*="Name, phone" i]');
  el?.focus();
  el?.select?.();
}
