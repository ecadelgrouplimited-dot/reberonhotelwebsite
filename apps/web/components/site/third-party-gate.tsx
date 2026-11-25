'use client';
import { useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { CONSENT_VERSION } from '@reberon/contracts';
import { openCookieSettings, readConsent, useConsent, writeConsent } from '@/lib/consent';
import { recordConsent } from '@/app/actions';

/**
 * Third-party players (YouTube, Vimeo, 3-D tours) load only with the visitor's yes:
 * either "Videos & 3-D tours" in cookie settings, or a one-off "play this one".
 */
export function ThirdPartyGate({ provider, what, children, tone = 'dark' }: { provider: string; what: string; children: ReactNode; tone?: 'dark' | 'light' }) {
  const { allowed, ready } = useConsent();
  const [once, setOnce] = useState(false);
  if (!ready) return null;
  if (once || allowed('media')) return <>{children}</>;
  const always = () => {
    const prev = readConsent();
    writeConsent({ preferences: prev?.choices.preferences ?? false, analytics: prev?.choices.analytics ?? false, media: true }, 'custom', (s, method) => void recordConsent({ id: s.id, version: CONSENT_VERSION, choices: s.choices, method, path: location.pathname }));
  };
  return (
    <div className={`absolute inset-0 grid place-items-center p-5 text-center ${tone === 'dark' ? 'bg-[#0d1024]/92 text-white' : 'bg-white/95 text-[#1A1E43]'}`}>
      <div className="grid max-w-sm justify-items-center gap-3">
        <ShieldCheck className="size-7 opacity-80" aria-hidden />
        <p className="text-[15px] font-semibold">This {what} is played by {provider}</p>
        <p className="text-[13px] leading-relaxed opacity-80">{provider} may set its own cookies once it loads. Nothing is loaded until you choose.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => setOnce(true)} className="rounded-full bg-[#D76E1B] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#E88432]">
            Play this {what}
          </button>
          <button type="button" onClick={always} className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${tone === 'dark' ? 'border-white/40 hover:bg-white/10' : 'border-[#1A1E43]/30 hover:bg-black/5'}`}>
            Always allow
          </button>
        </div>
        <button type="button" onClick={openCookieSettings} className="text-[12px] underline underline-offset-2 opacity-70 hover:opacity-100">
          Cookie settings
        </button>
      </div>
    </div>
  );
}
