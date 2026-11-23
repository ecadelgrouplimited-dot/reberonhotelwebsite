'use client';
import { toast } from 'sonner';

/**
 * One-tap changes can be taken back: a toast with “Undo”, and Ctrl/⌘+Z works for
 * a few seconds too (except on screens with their own undo, marked data-own-undo).
 */
let last: { run: () => unknown; until: number; id: string | number } | null = null;

export function undoToast(message: string, undo: () => unknown, opts: { description?: string } = {}) {
  const id = toast.success(message, {
    description: opts.description,
    duration: 7000,
    action: {
      label: 'Undo',
      onClick: () => {
        last = null;
        void Promise.resolve(undo()).then(() => toast.info('Undone', { duration: 1800 }));
      },
    },
  });
  last = { run: undo, until: Date.now() + 7000, id };
}

if (typeof window !== 'undefined' && !(window as unknown as { __rbUndo?: boolean }).__rbUndo) {
  (window as unknown as { __rbUndo?: boolean }).__rbUndo = true;
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
    if (document.querySelector('[data-own-undo]')) return;
    if (!last || Date.now() > last.until) return;
    e.preventDefault();
    const { run, id } = last;
    last = null;
    toast.dismiss(id);
    void Promise.resolve(run()).then(() => toast.info('Undone', { duration: 1800 }));
  });
}
