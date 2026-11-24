'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Delete, KeyRound, Lock, LogIn, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';
import type { MeDTO, TerminalPersonDTO } from '@reberon/contracts';
import { ApiError, get, lockState, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMe } from '@/lib/providers';
import { usePwa } from '@/components/pwa/pwa-provider';
import { ReberonHorizontalLogo } from '@/components/shell/brand-logo';
import { mod } from './actions';

/* ───────────────────────── Device setting: lock when idle ───────────────────────── */

const AUTOLOCK_KEY = 'rb-autolock';
const ACTIVE_KEY = 'rb-last-active';
export const AUTOLOCK_CHOICES = [0, 2, 5, 10, 15, 30] as const;

/** Minutes of no activity before this device locks itself (0 = never). A device setting, not a personal one. */
export function readAutoLock(): number {
  try {
    const n = Number(localStorage.getItem(AUTOLOCK_KEY) ?? 0);
    return AUTOLOCK_CHOICES.includes(n as (typeof AUTOLOCK_CHOICES)[number]) ? n : 0;
  } catch {
    return 0;
  }
}
export function writeAutoLock(min: number) {
  try {
    localStorage.setItem(AUTOLOCK_KEY, String(min));
    window.dispatchEvent(new CustomEvent('rb:autolock', { detail: min }));
  } catch {
    /* private mode */
  }
}

export const lockShortcut = () => `${mod()} ⇧ L`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const kampala = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', ...opts }).format(new Date());

/* ───────────────────────── Shared: pick a person, PIN pad ───────────────────────── */

function Avatar({ p, size = 'md' }: { p: Pick<TerminalPersonDTO, 'name' | 'avatarUrl'>; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-20 text-[24px]' : 'size-14 text-[17px]';
  return p.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.avatarUrl} alt="" className={cn(cls, 'rounded-full object-cover ring-2 ring-white/25')} />
  ) : (
    <span className={cn(cls, 'grid place-items-center rounded-full bg-gradient-to-br from-[#E88432] to-[#B4520F] font-semibold text-white ring-2 ring-white/25')}>{initials(p.name)}</span>
  );
}

function PinPad({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  useEffect(() => {
    if (!error) return;
    setPin('');
    setShake(true);
    const t = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(t);
  }, [error]);

  const press = useCallback(
    (k: string) => {
      if (busy) return;
      if (k === 'back') return setPin((p) => p.slice(0, -1));
      if (k === 'ok') {
        if (pinRef.current.length >= 4) onSubmit(pinRef.current);
        return;
      }
      setPin((p) => (p.length < 6 ? p + k : p));
    },
    [busy, onSubmit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
  return (
    <div className="grid justify-items-center gap-5">
      <div className={cn('flex h-4 items-center gap-3', shake && 'rb-shake')} aria-label={`${pin.length} digits entered`} role="status">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={cn('size-3 rounded-full border border-white/60 transition-colors', i < pin.length ? 'bg-white' : 'bg-transparent')} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={busy || (k === 'ok' && pin.length < 4)}
            aria-label={k === 'back' ? 'Delete' : k === 'ok' ? 'Unlock' : k}
            className={cn(
              'grid size-16 place-items-center rounded-full text-[22px] font-medium text-white transition active:scale-95 disabled:opacity-35',
              k === 'ok' ? 'bg-[#D76E1B] hover:bg-[#E88432]' : k === 'back' ? 'hover:bg-white/10' : 'bg-white/10 hover:bg-white/20',
            )}
          >
            {k === 'back' ? <Delete className="size-5" /> : k === 'ok' ? <LogIn className="size-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The people this device remembers, then a PIN pad (or password) for the one picked.
 * Used by the lock screen and by the sign-in page on a shared terminal.
 */
export function QuickSignIn({ onDone, preselect, onUseEmail }: { onDone: (me: MeDTO) => void | Promise<void>; preselect?: string; onUseEmail: () => void }) {
  const qc = useQueryClient();
  const { data: people = [], isLoading, isFetching } = useQuery({ queryKey: ['terminal-people'], queryFn: () => get<TerminalPersonDTO[]>('/auth/terminal'), staleTime: 0, refetchOnMount: 'always' });
  const [chosen, setChosen] = useState<string | null>(preselect ?? null);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);

  const person = people.find((p) => p.id === chosen) ?? null;
  const pinMode = !!person && person.hasPin && !person.pinBlocked && !usePassword;

  // Someone remembered but gone since (disabled, hours over) drops back to the list.
  useEffect(() => {
    if (!isFetching && chosen && !person) setChosen(null);
  }, [isFetching, chosen, person]);

  const choose = (id: string | null) => {
    setChosen(id);
    setUsePassword(false);
    setPassword('');
    setError(null);
  };

  const unlock = async (body: { pin: string } | { password: string }) => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      const me = await post<MeDTO>('/auth/unlock', { userId: person.id, ...body });
      await onDone(me);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.status === 0 ? 'No connection — unlocking needs the server.' : e.message) : 'Could not unlock.';
      setError(msg);
      setErrorTick((n) => n + 1);
      if (e instanceof ApiError && /password/i.test(e.message) && 'pin' in body) void qc.invalidateQueries({ queryKey: ['terminal-people'] });
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    if (!person) return;
    await post('/auth/terminal/forget', { userId: person.id }).catch(() => undefined);
    toast.success(`${person.name.split(' ')[0]} removed from this device`);
    choose(null);
    void qc.invalidateQueries({ queryKey: ['terminal-people'] });
  };

  if (isLoading || (chosen && !person && isFetching)) return <div className="h-40" />;

  if (!person) {
    return (
      <div className="grid justify-items-center gap-6">
        {people.length > 0 ? (
          <>
            <p className="text-[14px] text-white/75">Who’s working?</p>
            <ul className="flex max-w-xl flex-wrap justify-center gap-3">
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose(p.id)} className="grid w-28 justify-items-center gap-2 rounded-2xl px-2 py-3 text-center transition hover:bg-white/10 focus-visible:bg-white/10">
                    <Avatar p={p} />
                    <span className="line-clamp-1 text-[13.5px] font-semibold text-white">{p.name.split(' ')[0]}</span>
                    <span className="line-clamp-1 text-[11px] text-white/55">{p.jobTitle ?? (p.hasPin ? 'PIN' : 'Password')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="max-w-xs text-center text-[13.5px] text-white/70">Nobody has signed in on this device yet.</p>
        )}
        <button type="button" onClick={onUseEmail} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/10">
          <LogIn className="size-4" /> Someone else — sign in with email
        </button>
      </div>
    );
  }

  return (
    <div className="grid justify-items-center gap-5">
      <div className="grid justify-items-center gap-2">
        <Avatar p={person} size="lg" />
        <p className="text-[18px] font-semibold text-white">{person.name}</p>
        <p className="text-[12.5px] text-white/60">
          {pinMode ? 'Enter your PIN' : person.pinBlocked ? 'Too many wrong PINs — use your password this time' : person.hasPin ? 'Enter your password' : 'Enter your password (set a PIN under Your account to make this quicker)'}
        </p>
      </div>
      {error && (
        <p role="alert" className="max-w-xs rounded-xl bg-rose-500/20 px-3 py-2 text-center text-[12.5px] text-rose-100">
          {error}
        </p>
      )}
      {pinMode ? (
        <PinPad key={person.id} busy={busy} error={error ? `${error}#${errorTick}` : null} onSubmit={(pin) => void unlock({ pin })} />
      ) : (
        <form
          className="flex w-72 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void unlock({ password });
          }}
        >
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 flex-1 rounded-xl border border-white/20 bg-white/10 px-3.5 text-[14px] text-white placeholder:text-white/45 focus:border-white/50 focus:outline-none"
          />
          <button type="submit" disabled={busy || !password} aria-label="Unlock" className="grid size-11 place-items-center rounded-xl bg-[#D76E1B] text-white hover:bg-[#E88432] disabled:opacity-40">
            <LogIn className="size-4" />
          </button>
        </form>
      )}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12.5px] text-white/65">
        <button type="button" onClick={() => choose(null)} className="inline-flex items-center gap-1 hover:text-white">
          <ArrowLeft className="size-3.5" /> Switch person
        </button>
        {person.hasPin && !person.pinBlocked && (
          <button type="button" onClick={() => setUsePassword((v) => !v)} className="inline-flex items-center gap-1 hover:text-white">
            <KeyRound className="size-3.5" /> {usePassword ? 'Use PIN' : 'Use password'}
          </button>
        )}
        <button type="button" onClick={() => void forget()} className="inline-flex items-center gap-1 hover:text-white" title="Take them off this device’s lock screen">
          <UserRoundX className="size-3.5" /> Not on this device
        </button>
      </div>
    </div>
  );
}

/** The dark branded backdrop shared by the lock screen and the quick sign-in. */
export function LockBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh w-full place-items-center overflow-hidden bg-[#1A1E43] px-4 py-10 text-white">
      <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.12]" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {Array.from({ length: 22 }, (_, i) => (
          <ellipse key={i} cx={400 + Math.sin(i * 0.7) * 30} cy={480} rx={40 + i * 30} ry={26 + i * 19} fill="none" stroke="#D76E1B" strokeWidth="1" transform={`rotate(${-12 + i * 1.3} 400 480)`} />
        ))}
      </svg>
      <div className="relative grid w-full justify-items-center gap-8">{children}</div>
    </div>
  );
}

function Clock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid justify-items-center">
      <p className="display text-[4.2rem] leading-none tabular-nums text-white">{kampala({ hour: '2-digit', minute: '2-digit', hour12: false })}</p>
      <p className="mt-2 text-[14px] text-white/70">{kampala({ weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </div>
  );
}

/* ───────────────────────── The lock itself (inside the House) ───────────────────────── */

type LockMsg = { type: 'lock'; by: string } | { type: 'unlock'; userId: string };

/**
 * Locks the House on a shared terminal: by button, {mod}⇧L, or after the device's idle time.
 * Locking ends the session on the server (nothing behind the screen can be used, even
 * with dev tools); the people this device remembers come back with their PIN.
 */
export function LockScreen() {
  const me = useMe();
  const qc = useQueryClient();
  const pwa = usePwa();
  const ref = useRef<HTMLDialogElement>(null);
  const [locked, setLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const latest = useRef({ me, pending: pwa?.pending ?? 0, locked });
  latest.current = { me, pending: pwa?.pending ?? 0, locked };

  const showLocked = useCallback((by: string) => {
    lockState.locked = true;
    setLockedBy(by);
    setLocked(true);
    void qc.cancelQueries();
  }, [qc]);

  const lock = useCallback(
    async (why: 'manual' | 'idle' = 'manual') => {
      const { me: who, pending, locked: already } = latest.current;
      if (already) return;
      if (pending > 0) {
        if (why === 'manual') toast.error(`${pending} change${pending === 1 ? '' : 's'} made offline still need${pending === 1 ? 's' : ''} to sync`, { description: 'Lock once the connection is back and they are sent, so they are saved under your name.' });
        return;
      }
      showLocked(who.id);
      // End the session; offline it simply ends when the access pass runs out.
      await post('/auth/lock').catch(() => undefined);
      chan.current?.postMessage({ type: 'lock', by: who.id } satisfies LockMsg);
    },
    [showLocked],
  );

  // Other tabs on this device lock and unlock together.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel('rb-lock');
    chan.current = c;
    c.onmessage = (e: MessageEvent<LockMsg>) => {
      if (e.data.type === 'lock' && !latest.current.locked) showLocked(e.data.by);
      if (e.data.type === 'unlock' && latest.current.locked) {
        if (e.data.userId === latest.current.me.id) {
          lockState.locked = false;
          setLocked(false);
          void qc.invalidateQueries();
        } else window.location.assign('/');
      }
    };
    return () => c.close();
  }, [qc, showLocked]);

  // Lock button, menus and the keyboard.
  useEffect(() => {
    const onLock = () => void lock('manual');
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void lock('manual');
      }
    };
    window.addEventListener('rb:lock', onLock);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('rb:lock', onLock);
      window.removeEventListener('keydown', onKey);
    };
  }, [lock]);

  // Idle: activity in any tab on this device counts.
  useEffect(() => {
    let minutes = readAutoLock();
    let last = 0;
    const mark = () => {
      const now = Date.now();
      if (now - last < 5_000) return;
      last = now;
      try {
        localStorage.setItem(ACTIVE_KEY, String(now));
      } catch {
        /* private mode */
      }
    };
    mark();
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    for (const ev of events) window.addEventListener(ev, mark, { passive: true });
    const onSetting = () => {
      minutes = readAutoLock();
      last = 0;
      mark();
    };
    window.addEventListener('rb:autolock', onSetting);
    const timer = setInterval(() => {
      if (!minutes || latest.current.locked) return;
      let at = Date.now();
      try {
        at = Number(localStorage.getItem(ACTIVE_KEY) ?? at);
      } catch {
        /* private mode */
      }
      if (Date.now() - at >= minutes * 60_000) void lock('idle');
    }, 10_000);
    return () => {
      for (const ev of events) window.removeEventListener(ev, mark);
      window.removeEventListener('rb:autolock', onSetting);
      clearInterval(timer);
    };
  }, [lock]);

  // A modal dialog sits above every other dialog and makes the House behind it inert.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (locked && !d.open) d.showModal();
    if (!locked && d.open) d.close();
  }, [locked]);

  const done = async (who: MeDTO) => {
    chan.current?.postMessage({ type: 'unlock', userId: who.id } satisfies LockMsg);
    if (who.id === me.id) {
      lockState.locked = false;
      qc.setQueryData(['me'], who);
      setLocked(false);
      void qc.invalidateQueries();
      toast.success(`Welcome back, ${who.name.split(' ')[0]}`, { id: 'rb-unlock', duration: 1800 });
      return;
    }
    // A different person: nothing of the last person's may stay on screen or in memory.
    await pwa?.clearOfflineData().catch(() => undefined);
    qc.clear();
    window.location.assign('/');
  };

  return (
    <dialog
      ref={ref}
      aria-label="Screen locked"
      onCancel={(e) => e.preventDefault()}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-transparent p-0 backdrop:bg-[#1A1E43]"
    >
      {locked && (
        <LockBackdrop>
          <ReberonHorizontalLogo className="h-9 w-auto opacity-90" wordmarkColor="#FFFFFF" copperColor="#D76E1B" />
          <Clock />
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/75">
            <Lock className="size-3.5" /> Locked{lockedBy === me.id ? ` by ${me.name.split(' ')[0]}` : ''}
          </div>
          <QuickSignIn preselect={lockedBy ?? undefined} onDone={done} onUseEmail={() => window.location.assign('/login')} />
        </LockBackdrop>
      )}
    </dialog>
  );
}
