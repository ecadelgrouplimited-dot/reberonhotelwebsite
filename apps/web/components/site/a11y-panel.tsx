'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accessibility,
  ALargeSmall,
  Baseline,
  Contrast,
  EyeOff,
  Keyboard,
  Link2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  Square,
  SunDim,
  Type,
  Volume2,
  X,
  ZapOff,
  type LucideIcon,
} from 'lucide-react';
import { A11Y_DEFAULTS, TEXT_SCALES, readA11y, writeA11y, type A11ySettings } from '@/lib/a11y';
import { cn } from '@/lib/cn';

type Flag = Exclude<keyof A11ySettings, 'text'>;

const TOGGLES: { key: Flag; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'contrast', label: 'Stronger contrast', hint: 'Darker text and edges', icon: Contrast },
  { key: 'spacing', label: 'Readable spacing', hint: 'More room between lines and letters', icon: Rows3 },
  { key: 'font', label: 'Readable font', hint: 'A plain, open typeface', icon: Type },
  { key: 'links', label: 'Highlight links', hint: 'Underline and mark every link and button', icon: Link2 },
  { key: 'motion', label: 'Stop animations', hint: 'No moving, fading or sliding', icon: ZapOff },
  { key: 'guide', label: 'Reading guide', hint: 'A line that follows your pointer', icon: Baseline },
  { key: 'cursor', label: 'Big cursor', hint: 'Easier to see the pointer', icon: MousePointer2 },
  { key: 'focus', label: 'Keyboard focus', hint: 'A bold outline on what is selected', icon: Keyboard },
  { key: 'gray', label: 'Greyscale', hint: 'Remove colour', icon: SunDim },
  { key: 'noimg', label: 'Hide images', hint: 'Fewer distractions', icon: EyeOff },
];

const PROFILES: { label: string; hint: string; set: Partial<A11ySettings> }[] = [
  { label: 'Low vision', hint: 'Bigger text, contrast, clear focus', set: { text: 140, contrast: true, focus: true, links: true, cursor: true } },
  { label: 'Dyslexia', hint: 'Readable font and spacing', set: { font: true, spacing: true, guide: true } },
  { label: 'Motion sensitive', hint: 'Everything stays still', set: { motion: true } },
  { label: 'Keyboard only', hint: 'Clear focus, marked links', set: { focus: true, links: true } },
];

/** Paragraph-sized pieces of the page's main content, in reading order. */
function readableBlocks(): HTMLElement[] {
  const main = document.getElementById('main') ?? document.body;
  return [...main.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, li, blockquote, figcaption, dd, td')].filter((el) => {
    if (!el.innerText?.trim()) return false;
    if (el.closest('[aria-hidden="true"], dialog, nav, form')) return false;
    // Skip a block whose parent block will be read anyway.
    if (el.parentElement?.closest('p, li, blockquote, td')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/**
 * Accessibility: a floating tab on the left edge (the concierge lives bottom-right,
 * the action bar along the bottom on phones), opening a panel of one-tap profiles,
 * text size, ten display choices and read-aloud. Alt+A opens it from anywhere.
 */
export function A11yPanel() {
  const [s, setS] = useState<A11ySettings>(A11Y_DEFAULTS);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [canSpeak, setCanSpeak] = useState(false);
  const [guideY, setGuideY] = useState<number | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const queue = useRef<HTMLElement[]>([]);

  useEffect(() => {
    setS(readA11y());
    setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window);
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      d.close();
      btn.current?.focus();
    }
  }, [open]);

  // Reading guide follows the pointer (and the keyboard focus).
  useEffect(() => {
    if (!s.guide) return setGuideY(null);
    const move = (e: PointerEvent) => setGuideY(e.clientY);
    const focus = (e: FocusEvent) => {
      const r = (e.target as HTMLElement | null)?.getBoundingClientRect?.();
      if (r) setGuideY(r.top + r.height / 2);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('focusin', focus);
    };
  }, [s.guide]);

  const update = (next: A11ySettings) => {
    setS(next);
    writeA11y(next);
  };
  const toggle = (k: Flag) => update({ ...s, [k]: !s[k] });
  const activeCount = Object.entries(s).filter(([k, v]) => A11Y_DEFAULTS[k as keyof A11ySettings] !== v).length;

  /* ── Read aloud ── */
  const clearMark = () => document.querySelectorAll('.rb-reading').forEach((el) => el.classList.remove('rb-reading'));
  const stop = useCallback(() => {
    queue.current = [];
    window.speechSynthesis?.cancel();
    clearMark();
    setReading('idle');
  }, []);
  const speakNext = useCallback(() => {
    const el = queue.current.shift();
    clearMark();
    if (!el) return setReading('idle');
    el.classList.add('rb-reading');
    el.scrollIntoView({ block: 'center', behavior: document.documentElement.hasAttribute('data-a11y-motion') ? 'auto' : 'smooth' });
    const u = new SpeechSynthesisUtterance(el.innerText.trim());
    u.lang = 'en-GB';
    u.rate = 0.98;
    u.onend = () => speakNext();
    u.onerror = () => stop();
    window.speechSynthesis.speak(u);
  }, [stop]);
  const read = () => {
    if (reading === 'playing') {
      window.speechSynthesis.pause();
      return setReading('paused');
    }
    if (reading === 'paused') {
      window.speechSynthesis.resume();
      return setReading('playing');
    }
    window.speechSynthesis.cancel();
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      const u = new SpeechSynthesisUtterance(sel);
      u.lang = 'en-GB';
      u.onend = () => setReading('idle');
      window.speechSynthesis.speak(u);
      setReading('playing');
      return;
    }
    queue.current = readableBlocks();
    setReading('playing');
    setOpen(false);
    speakNext();
  };
  useEffect(() => () => stop(), [stop]);

  const textIdx = TEXT_SCALES.indexOf(s.text);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Accessibility options${activeCount ? ` (${activeCount} on)` : ''} — Alt + A`}
        title="Accessibility (Alt + A)"
        className="rb-float fixed left-0 top-1/2 z-[55] grid size-11 -translate-y-1/2 place-items-center rounded-r-2xl bg-[#1A1E43] text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/.5)] ring-1 ring-white/15 transition-[width,background-color] hover:w-14 hover:bg-[#2F3672] focus-visible:w-14 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#D76E1B] print:hidden md:size-12"
      >
        <Accessibility className="size-5 md:size-6" aria-hidden />
        {activeCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#D76E1B] text-[10px] font-bold text-white">{activeCount}</span>}
      </button>

      {reading !== 'idle' && (
        <div role="region" aria-label="Reading aloud" className="rb-float fixed left-1/2 top-20 z-[56] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1A1E43] py-1.5 pl-4 pr-1.5 text-sm text-white shadow-2xl ring-1 ring-white/15">
          <Volume2 className="size-4" aria-hidden /> {reading === 'paused' ? 'Paused' : 'Reading the page'}
          <button type="button" onClick={read} className="grid size-8 place-items-center rounded-full hover:bg-white/15" aria-label={reading === 'paused' ? 'Resume' : 'Pause'}>
            {reading === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
          <button type="button" onClick={stop} className="grid size-8 place-items-center rounded-full hover:bg-white/15" aria-label="Stop reading">
            <Square className="size-3.5" />
          </button>
        </div>
      )}

      {s.guide && guideY !== null && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 z-[54]" style={{ top: guideY - 22 }}>
          <div className="h-11 border-y-2 border-[#D76E1B] bg-[rgb(255_214_0/0.12)] shadow-[0_0_0_100vmax_rgb(0_0_0/0.28)]" />
        </div>
      )}

      <dialog
        ref={dlg}
        aria-labelledby="rb-a11y-title"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dlg.current && setOpen(false)}
        className="m-0 ml-3 mt-auto mb-3 max-h-[calc(100dvh-1.5rem)] w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--r-lg)] bg-[var(--bg)] p-0 text-[var(--fg)] shadow-2xl backdrop:bg-black/40 sm:my-auto sm:ml-4"
      >
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 id="rb-a11y-title" className="flex items-center gap-2 text-[1.1rem] font-semibold">
                <Accessibility className="size-5 text-[var(--accent)]" aria-hidden /> Accessibility
              </h2>
              <p className="mt-0.5 text-[13px] text-[var(--fg-muted)]">Make the site easier to see, read and use. Your choices stay on this device.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close accessibility options" className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full hover:bg-[var(--surface-2)]">
              <X className="size-4" />
            </button>
          </header>

          <div className="grid gap-5 overflow-y-auto px-5 py-4">
            <section aria-labelledby="a11y-profiles">
              <h3 id="a11y-profiles" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
                Quick profiles
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {PROFILES.map((p) => {
                  const on = Object.entries(p.set).every(([k, v]) => s[k as keyof A11ySettings] === v);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => update(on ? { ...s, ...Object.fromEntries(Object.keys(p.set).map((k) => [k, A11Y_DEFAULTS[k as keyof A11ySettings]])) } : { ...s, ...p.set })}
                      className={cn('rounded-[var(--r-md)] border p-3 text-left transition-colors', on ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]' : 'border-[var(--line-strong)] hover:bg-[var(--surface-2)]')}
                    >
                      <span className="block text-[13.5px] font-semibold">{p.label}</span>
                      <span className="block text-[12px] leading-snug text-[var(--fg-muted)]">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="a11y-text" className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id="a11y-text" className="flex items-center gap-2 text-[14px] font-semibold">
                  <ALargeSmall className="size-4" aria-hidden /> Text size
                </h3>
                <div className="flex items-center gap-1" role="group" aria-labelledby="a11y-text">
                  <button type="button" onClick={() => update({ ...s, text: TEXT_SCALES[Math.max(0, textIdx - 1)]! })} disabled={textIdx <= 0} aria-label="Smaller text" className="grid size-9 place-items-center rounded-full border border-[var(--line-strong)] text-[13px] font-bold disabled:opacity-35">
                    A−
                  </button>
                  <output className="w-14 text-center text-[13px] font-semibold tabular-nums" aria-live="polite">
                    {s.text}%
                  </output>
                  <button type="button" onClick={() => update({ ...s, text: TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, textIdx + 1)]! })} disabled={textIdx >= TEXT_SCALES.length - 1} aria-label="Bigger text" className="grid size-9 place-items-center rounded-full border border-[var(--line-strong)] text-[15px] font-bold disabled:opacity-35">
                    A+
                  </button>
                </div>
              </div>
            </section>

            {canSpeak && (
              <button type="button" onClick={read} className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--line-strong)] p-3 text-left hover:bg-[var(--surface-2)]">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">{reading === 'playing' ? <Pause className="size-4" /> : <Volume2 className="size-4" />}</span>
                <span>
                  <span className="block text-[14px] font-semibold">{reading === 'playing' ? 'Pause reading' : reading === 'paused' ? 'Resume reading' : 'Read the page aloud'}</span>
                  <span className="block text-[12px] text-[var(--fg-muted)]">Or select some text first to hear just that.</span>
                </span>
              </button>
            )}

            <section aria-labelledby="a11y-display">
              <h3 id="a11y-display" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
                Display &amp; reading
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {TOGGLES.map((tg) => (
                  <button
                    key={tg.key}
                    type="button"
                    role="switch"
                    aria-checked={s[tg.key]}
                    onClick={() => toggle(tg.key)}
                    className={cn('flex flex-col items-start gap-1.5 rounded-[var(--r-md)] border p-3 text-left transition-colors', s[tg.key] ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]' : 'border-[var(--line-strong)] hover:bg-[var(--surface-2)]')}
                  >
                    <span className="flex w-full items-center justify-between">
                      <tg.icon className={cn('size-5', s[tg.key] ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)]')} aria-hidden />
                      <span className={cn('h-4 w-7 rounded-full p-0.5 transition-colors', s[tg.key] ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]')} aria-hidden>
                        <span className={cn('block size-3 rounded-full bg-white transition-transform', s[tg.key] && 'translate-x-3')} />
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold leading-tight">{tg.label}</span>
                    <span className="text-[11.5px] leading-snug text-[var(--fg-muted)]">{tg.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3">
            <span className="text-[12px] text-[var(--fg-subtle)]">
              Shortcut: <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-sans text-[11px]">Alt</kbd> + <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-sans text-[11px]">A</kbd>
            </span>
            <button type="button" onClick={() => update({ ...A11Y_DEFAULTS })} disabled={!activeCount} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3.5 py-2 text-[13px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-40">
              <RotateCcw className="size-3.5" aria-hidden /> Reset all
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
