'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Cookie, X } from 'lucide-react';
import {
  CONSENT_CATEGORIES,
  CONSENT_CATEGORY_INFO,
  CONSENT_REGISTRY,
  CONSENT_VERSION,
  OPTIONAL_CATEGORIES,
  type ConsentCategory,
  type ConsentChoices,
} from '@reberon/contracts';
import { OPEN_SETTINGS_EVENT, privacySignal, readConsent, writeConsent } from '@/lib/consent';
import { recordConsent } from '@/app/actions';
import { cn } from '@/lib/cn';

const NONE: ConsentChoices = { preferences: false, analytics: false, media: false };
const ALL: ConsentChoices = { preferences: true, analytics: true, media: true };

const save = (choices: ConsentChoices, method: 'accept_all' | 'reject_all' | 'custom' | 'gpc') =>
  writeConsent(choices, method, (s, m) => void recordConsent({ id: s.id, version: CONSENT_VERSION, choices: s.choices, method: m, path: location.pathname }));

/**
 * The cookie banner and settings. Accept and reject weigh the same; nothing optional
 * runs before a choice; Global Privacy Control counts as "no"; any "Cookie settings"
 * link (href="#cookie-settings") reopens it.
 */
export function CookieConsent() {
  const [banner, setBanner] = useState(false);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    // Not inside the House's live preview frame.
    if (window.self !== window.top) return;
    if (!readConsent()) {
      if (privacySignal()) save(NONE, 'gpc');
      else setBanner(true);
    }
    const open = () => {
      setPanel(true);
      setBanner(false);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href$="#cookie-settings"]');
      if (!a) return;
      e.preventDefault();
      open();
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    document.addEventListener('click', onClick);
    if (location.hash === '#cookie-settings') open();
    return () => {
      window.removeEventListener(OPEN_SETTINGS_EVENT, open);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      {banner && !panel && (
        <section
          role="region"
          aria-label="Cookie choices"
          className="tone-moss fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[70] rounded-[var(--r-lg)] p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/.55)] ring-1 ring-[var(--line)] md:inset-x-auto md:bottom-6 md:left-6 md:max-w-[26rem] motion-safe:animate-[rb-rise_.5s_cubic-bezier(.2,.8,.2,1)]"
        >
          <div className="flex items-start gap-3">
            <Cookie className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" aria-hidden />
            <div className="grid gap-2">
              <p className="text-[15px] font-semibold">Your choice, your data</p>
              <p className="text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
                We use only what the site needs to work. With your yes, we also remember you in Sipi Concierge, count virtual-tour visits anonymously, and play videos from YouTube or Vimeo. No advertising, ever.{' '}
                <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-[var(--fg)]">
                  Cookie policy
                </Link>
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (save(NONE, 'reject_all'), setBanner(false))} className="rounded-full border border-[var(--line-strong)] px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[var(--surface-2)]">
              Reject all
            </button>
            <button type="button" onClick={() => (save(ALL, 'accept_all'), setBanner(false))} className="rounded-full border border-[var(--line-strong)] px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[var(--surface-2)]">
              Accept all
            </button>
          </div>
          <button type="button" onClick={() => setPanel(true)} className="mt-3 w-full text-center text-[13px] font-medium text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg)]">
            Choose what to allow
          </button>
        </section>
      )}
      {panel && <CookieSettings onClose={() => setPanel(false)} />}
    </>
  );
}

function CookieSettings({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = readConsent();
  const [choices, setChoices] = useState<ConsentChoices>(current?.choices ?? NONE);
  const [open, setOpen] = useState<ConsentCategory | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const done = (c: ConsentChoices, method: 'accept_all' | 'reject_all' | 'custom') => {
    save(c, method);
    ref.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="rb-cookie-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto max-h-[min(92dvh,44rem)] w-[min(36rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--r-lg)] bg-[var(--bg)] p-0 text-[var(--fg)] shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
          <div>
            <h2 id="rb-cookie-title" className="text-[1.2rem] font-semibold">
              Cookie settings
            </h2>
            <p className="mt-1 text-[13.5px] text-[var(--fg-muted)]">Turn on only what you are happy with. You can come back here any time from the footer.</p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="-mr-2 grid size-9 place-items-center rounded-full hover:bg-[var(--surface-2)]">
            <X className="size-4" />
          </button>
        </header>
        <div className="grid gap-3 overflow-y-auto px-6 py-5">
          {CONSENT_CATEGORIES.map((cat) => {
            const info = CONSENT_CATEGORY_INFO[cat];
            const items = CONSENT_REGISTRY.filter((i) => i.category === cat);
            const on = cat === 'necessary' ? true : choices[cat];
            const id = `rb-consent-${cat}`;
            return (
              <div key={cat} className="rounded-[var(--r-md)] border border-[var(--line)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <label htmlFor={id} className="text-[14.5px] font-semibold">
                      {info.label}
                    </label>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--fg-muted)]">{info.description}</p>
                  </div>
                  <label htmlFor={id} className={cn('relative inline-flex shrink-0', cat === 'necessary' ? 'cursor-not-allowed' : 'cursor-pointer')}>
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      checked={on}
                      disabled={cat === 'necessary'}
                      aria-checked={on}
                      onChange={(e) => cat !== 'necessary' && setChoices({ ...choices, [cat]: e.target.checked })}
                    />
                    <span className={cn('block h-7 w-12 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2', on ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]', cat === 'necessary' && 'opacity-60')} aria-hidden />
                    <span className={cn('pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} aria-hidden />
                  </label>
                </div>
                <button type="button" onClick={() => setOpen(open === cat ? null : cat)} aria-expanded={open === cat} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]">
                  {cat === 'necessary' ? 'Always on' : on ? 'On' : 'Off'} · {items.length} item{items.length === 1 ? '' : 's'}
                  <ChevronDown className={cn('size-3.5 transition-transform', open === cat && 'rotate-180')} />
                </button>
                {open === cat && (
                  <ul className="mt-2 grid gap-2 border-t border-[var(--line)] pt-2">
                    {items.map((i) => (
                      <li key={i.name} className="text-[12.5px] leading-snug">
                        <span className="font-mono font-medium">{i.name}</span> <span className="text-[var(--fg-subtle)]">· {i.provider} · {i.kind} · {i.duration}</span>
                        <span className="block text-[var(--fg-muted)]">{i.purpose}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <p className="text-[12.5px] text-[var(--fg-subtle)]">
            Saying no never stops you booking or contacting us. Full details in our{' '}
            <Link href="/legal/cookies" className="underline underline-offset-2" onClick={() => ref.current?.close()}>
              cookie policy
            </Link>
            .
          </p>
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-[var(--line)] px-6 py-4 sm:grid-cols-3">
          <button type="button" onClick={() => done(NONE, 'reject_all')} className="rounded-full border border-[var(--line-strong)] px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[var(--surface-2)]">
            Reject all
          </button>
          <button type="button" onClick={() => done(ALL, 'accept_all')} className="rounded-full border border-[var(--line-strong)] px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[var(--surface-2)]">
            Accept all
          </button>
          <button type="button" onClick={() => done(choices, OPTIONAL_CATEGORIES.every((c) => choices[c]) ? 'accept_all' : OPTIONAL_CATEGORIES.every((c) => !choices[c]) ? 'reject_all' : 'custom')} className="col-span-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[var(--accent-hover)] sm:col-span-1">
            Save my choices
          </button>
        </footer>
      </div>
    </dialog>
  );
}

/** Page block: the live cookie table, straight from the registry. */
export function CookieTableContent() {
  return (
    <div className="grid gap-10">
      {CONSENT_CATEGORIES.map((cat) => {
        const items = CONSENT_REGISTRY.filter((i) => i.category === cat);
        return (
          <section key={cat} aria-labelledby={`ct-${cat}`}>
            <h3 id={`ct-${cat}`} className="text-step-1 font-medium">
              {CONSENT_CATEGORY_INFO[cat].label} {cat === 'necessary' && <span className="text-sm font-normal text-fg-muted">— always on</span>}
            </h3>
            <p className="mt-1 max-w-2xl text-fg-muted">{CONSENT_CATEGORY_INFO[cat].description}</p>
            <div className="mt-4 overflow-x-auto rounded-[var(--r-md)] border border-line">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-surface-2 text-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Set by</th>
                    <th className="px-4 py-2.5 font-medium">What for</th>
                    <th className="px-4 py-2.5 font-medium">How long</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((i) => (
                    <tr key={i.name} className="align-top">
                      <td className="px-4 py-3 font-mono text-[0.82rem]">
                        {i.name}
                        <span className="block font-sans text-xs text-fg-subtle">{i.kind}</span>
                      </td>
                      <td className="px-4 py-3">{i.provider}</td>
                      <td className="px-4 py-3">{i.purpose}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{i.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
