'use client';
/**
 * Shell actions that menus, shortcuts and the dock can trigger from anywhere.
 * The shell listens for these events (it owns the palette, sidebar and help).
 */
export const shellAction = (name: 'palette' | 'sidebar' | 'shortcuts' | 'theme' | 'navigator') => window.dispatchEvent(new CustomEvent(`rb:${name}`));

export function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('rb-admin-theme', next);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent('rb:theme-changed', { detail: next }));
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = () => (isMac() ? '⌘' : 'Ctrl');
