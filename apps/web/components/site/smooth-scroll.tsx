'use client';
import { useEffect } from 'react';
import { A11Y_EVENT, motionOff } from '@/lib/a11y';

/** Lenis on desktop pointer devices only; native scroll on touch and for reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (!matchMedia('(pointer: fine) and (min-width: 1024px)').matches) return;
    if (motionOff()) return;
    let raf = 0;
    let destroy = () => {};
    // Turning on "Stop animations" switches smooth scrolling off at once.
    const onA11y = () => {
      if (motionOff()) {
        cancelAnimationFrame(raf);
        destroy();
      }
    };
    window.addEventListener(A11Y_EVENT, onA11y);
    import('lenis').then(({ default: Lenis }) => {
      const lenis = new Lenis({ duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 4), anchors: { offset: -88 } });
      const loop = (time: number) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      destroy = () => lenis.destroy();
    });
    return () => {
      window.removeEventListener(A11Y_EVENT, onA11y);
      cancelAnimationFrame(raf);
      destroy();
    };
  }, []);
  return null;
}
