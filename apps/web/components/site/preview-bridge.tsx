'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Only in a draft preview framed by the House's page builder.
 *
 * Hovering a section outlines it with its block name; clicking it opens that block
 * in the builder. The builder tells us which block is selected (we scroll to it)
 * and when a save landed (we refresh in place, keeping the scroll position).
 */
export function PreviewBridge({ adminOrigin }: { adminOrigin: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement | null>(null);
  const selectedId = useRef<string | null>(null);

  useEffect(() => {
    if (window.parent === window) return;
    const origin = new URL(adminOrigin).origin;
    const send = (msg: Record<string, unknown>) => window.parent.postMessage(msg, origin);

    const outline = document.createElement('div');
    outline.setAttribute('aria-hidden', 'true');
    outline.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #D76E1B;border-radius:14px;box-shadow:0 0 0 4px rgba(215,110,27,.15);transition:all .12s ease;opacity:0';
    const tag = document.createElement('span');
    tag.style.cssText =
      'position:absolute;top:-1px;left:-1px;transform:translateY(-100%);background:#D76E1B;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:8px 8px 0 0;white-space:nowrap';
    outline.appendChild(tag);
    document.body.appendChild(outline);
    box.current = outline;

    let hovered: HTMLElement | null = null;
    const place = (el: HTMLElement | null, label?: string) => {
      if (!el) {
        outline.style.opacity = '0';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(outline.style, { opacity: '1', top: `${Math.max(r.top, 0) + 3}px`, left: `${r.left + 3}px`, width: `${r.width - 6}px`, height: `${Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) - 6}px` });
      tag.textContent = label ?? '';
      tag.style.transform = r.top < 24 ? 'none' : 'translateY(-100%)';
      tag.style.borderRadius = r.top < 24 ? '0 0 8px 0' : '8px 8px 0 0';
    };
    const blockOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest('[data-block-id]') as HTMLElement | null) : null);
    const label = (el: HTMLElement) => `${el.dataset.blockLabel ?? 'Block'} · click to edit`;

    const onOver = (e: MouseEvent) => {
      const el = blockOf(e.target);
      if (el === hovered) return;
      hovered = el;
      place(el, el ? label(el) : undefined);
    };
    const onLeave = () => {
      hovered = null;
      place(null);
    };
    const onScroll = () => hovered && place(hovered, label(hovered));
    const onClick = (e: MouseEvent) => {
      const el = blockOf(e.target);
      if (!el) return;
      // In the editor a click picks the block; links and buttons don't navigate away.
      e.preventDefault();
      e.stopPropagation();
      selectedId.current = el.dataset.blockId ?? null;
      send({ type: 'rb:select', id: el.dataset.blockId });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || !e.data || typeof e.data !== 'object') return;
      const msg = e.data as { type?: string; id?: string };
      if (msg.type === 'rb:refresh') router.refresh();
      if (msg.type === 'rb:focus' && msg.id) {
        selectedId.current = msg.id;
        const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(msg.id)}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.animate([{ boxShadow: 'inset 0 0 0 3px rgba(215,110,27,.9)' }, { boxShadow: 'inset 0 0 0 3px rgba(215,110,27,0)' }], { duration: 1400, easing: 'ease-out' });
      }
    };

    document.addEventListener('mouseover', onOver);
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener('message', onMessage);
    send({ type: 'rb:ready', path: location.pathname });
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('message', onMessage);
      outline.remove();
    };
  }, [adminOrigin, router]);

  return null;
}
