'use client';
import { useState } from 'react';
import { Eye, KeyRound, LoaderCircle, Lock, LogOut, MapPin, MessageCircle, Mountain, Phone, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { SiteDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { whatsappLink } from '@reberon/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export function ComingSoonGate({ site }: { site: SiteDTO }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/admin/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-reberon-client': 'admin',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail ?? 'Invalid email or password.');
      }
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const phone = site.contact.phones?.[0] ?? '+256 768 262409';
  const wa = site.contact.whatsapp ?? phone;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0e0c] text-[#f4f5f1] selection:bg-[#cf8f2e] selection:text-[#0b0e0c]">
      {/* Subtle Ambient Mountain Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(207, 143, 46, 0.16), transparent 45%), radial-gradient(circle at 80% 80%, rgba(169, 45, 45, 0.14), transparent 50%)',
        }}
      />

      {/* Top Navigation Bar */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 40 24"
            className="h-6 w-10 text-[#f4f5f1]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M1 22 L11 9 L16 14 L24 3 L39 22" />
            <path d="M6 22 L13 15.5" opacity=".5" />
            <circle cx="30" cy="6" r="2.2" fill="#CF8F2E" stroke="none" />
          </svg>
          <div>
            <span className="font-display text-lg font-semibold tracking-tight">{site.name}</span>
            <span className="ml-2 hidden rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[#cf8f2e] sm:inline-block">
              Kapchorwa · Mount Elgon
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-[#f4f5f1] backdrop-blur-md transition hover:border-[#cf8f2e]/60 hover:bg-white/10 cursor-pointer"
        >
          <KeyRound className="size-3.5 text-[#cf8f2e]" />
          <span>Sign in to Preview</span>
        </button>
      </header>

      {/* Main Hero Content */}
      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-160px)] max-w-6xl items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1.3fr_0.9fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#cf8f2e]/30 bg-[#cf8f2e]/10 px-3.5 py-1.5 text-xs font-medium text-[#cf8f2e]">
            <Sparkles className="size-3.5" />
            <span>{t(site.openingLabel) || 'Coming Soon'} · Private Preview Mode</span>
          </div>

          <h1 className="mt-6 font-display text-4xl font-normal leading-[1.08] tracking-tight sm:text-6xl">
            A calm high-altitude sanctuary on the shoulder of Mount Elgon.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            We are putting the final touches on the official digital home of <strong className="font-medium text-white">{site.name}</strong> in Kapchorwa — above Sipi Falls, surrounded by Arabica coffee and mountain air at 1,900 metres.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center gap-2.5 rounded-full bg-[#b83b3b] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#a13232] cursor-pointer"
            >
              <Lock className="size-4" />
              <span>Authorized Preview Sign In</span>
            </button>

            {wa && (
              <a
                href={whatsappLink(wa, 'Hello Reberon Hotel, I would like to enquire about a stay.')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10"
              >
                <MessageCircle className="size-4 text-[#cf8f2e]" />
                <span>WhatsApp Desk</span>
              </a>
            )}
          </div>

          {/* Key Highlights */}
          <dl className="mt-12 grid grid-cols-2 gap-6 border-t border-white/10 pt-8 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-white/45">Altitude</dt>
              <dd className="mt-1 font-display text-xl text-white">1,900 m ASL</dd>
              <dd className="text-xs text-white/55">Kapchorwa Escarpment</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-white/45">Hospitality</dt>
              <dd className="mt-1 font-display text-xl text-white">Suites & Dining</dd>
              <dd className="text-xs text-white/55">Health Club, Spa & Gardens</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-white/45">Direct Enquiries</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-white">{site.contact.email || 'hello@reberonhotel.com'}</dd>
              <dd className="text-xs text-white/55">{phone}</dd>
            </div>
          </dl>
        </div>

        {/* Right Card: Private Preview & Direct Contact */}
        <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#cf8f2e]">Restricted Access</p>
              <h2 className="mt-1 font-display text-2xl">Preview the Website</h2>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
              <Mountain className="size-5" />
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-white/65">
            The public website is currently in <strong className="text-white">under-maintenance &amp; private review mode</strong>. Sign in with your authorized Reberon Hotel credentials below to unlock the full interactive website and booking preview.
          </p>

          <form onSubmit={handleSignIn} className="mt-6 grid gap-4">
            {error && (
              <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            <label className="grid gap-1.5 text-xs">
              <span className="font-medium text-white/80">Official Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="name@reberonhotel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
              />
            </label>

            <label className="grid gap-1.5 text-xs">
              <span className="font-medium text-white/80">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#cf8f2e] px-5 text-sm font-semibold text-[#0b0e0c] transition hover:bg-[#deb041] disabled:opacity-50 cursor-pointer"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}
              <span>{busy ? 'Signing in…' : 'Sign in & View Live Website'}</span>
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-xs text-white/55">
            <MapPin className="size-4 shrink-0 text-[#cf8f2e]" />
            <span>{t(site.contact.address) || 'Kapchorwa, along the Mbale–Kapchorwa road, Eastern Uganda'}</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-6 text-xs text-white/45 sm:px-10">
        <span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span>
        <span>
          Technology created and managed by{' '}
          <a href="https://ecadelgroup.com" target="_blank" rel="noreferrer" className="text-white/70 underline-offset-4 hover:underline">
            ECADEL GROUP LIMITED
          </a>
        </span>
      </footer>

      {/* Modal Sign-In Triggered from Header */}
      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setLoginOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-[#121614] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-[#cf8f2e]" />
                <h3 className="font-display text-xl">Authorized Preview Access</h3>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(false)}
                className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-white/65">
              Sign in with your Reberon Hotel account to view and test the full public website while maintenance mode is active.
            </p>
            <form onSubmit={handleSignIn} className="mt-5 grid gap-3.5">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-white/80">Email</span>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@reberonhotel.com"
                  className="h-10 rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-white/80">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-10 rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !email || !password}
                className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#cf8f2e] px-4 text-sm font-semibold text-[#0b0e0c] hover:bg-[#deb041] disabled:opacity-50 cursor-pointer"
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                <span>{busy ? 'Verifying…' : 'Unlock Website Preview'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function StaffPreviewBar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch(`${API}/v1/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-reberon-client': 'admin' },
      });
    } catch {}
    window.location.reload();
  }

  return (
    <div className="fixed bottom-3 left-3 z-[70] flex items-center gap-2.5 rounded-full border border-white/15 bg-[#121614]/95 py-1.5 pl-3.5 pr-2 text-xs text-white shadow-xl backdrop-blur-md print:hidden">
      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="font-medium">
        Preview Mode <span className="hidden text-white/60 sm:inline">({userName || userEmail})</span>
      </span>
      <a
        href="https://reberonhotel.com:8443"
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20 transition"
      >
        The House
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/30 transition cursor-pointer"
        title="Exit preview and return to Coming Soon view"
      >
        <LogOut className="size-3" />
        <span>Lock</span>
      </button>
    </div>
  );
}
