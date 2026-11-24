'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { PIN_LENGTH, pinWeakness, type PinCheckDTO } from '@reberon/contracts';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';

/* ───────────────────────── Four digit boxes ───────────────────────── */

export function PinBoxes({
  value,
  onChange,
  label,
  reveal,
  autoFocus,
  invalid,
  valid,
  onComplete,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  reveal: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  valid?: boolean;
  onComplete?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(PIN_LENGTH - 1, i))]?.focus();

  const setAt = (i: number, d: string) => {
    const chars = value.padEnd(PIN_LENGTH, ' ').split('');
    chars[i] = d;
    const next = chars.join('').replace(/\s+$/, '').replace(/\s/g, '');
    onChange(next.slice(0, PIN_LENGTH));
    return next;
  };

  return (
    <div role="group" aria-label={label} className="grid gap-1.5">
      <span className="text-[12.5px] font-semibold text-fg">{label}</span>
      <div className="flex gap-2">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
              if (i === 0 && inputRef) inputRef.current = el;
            }}
            aria-label={`${label}, digit ${i + 1}`}
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus && i === 0}
            type={reveal ? 'text' : 'password'}
            maxLength={1}
            value={value[i] ?? ''}
            onMouseDown={(e) => {
              // A click past the digits typed so far lands on the first empty box.
              if (i > value.length) {
                e.preventDefault();
                focus(value.length);
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            onPaste={(e) => {
              const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
              if (!digits) return;
              e.preventDefault();
              onChange(digits);
              focus(digits.length);
              if (digits.length === PIN_LENGTH) onComplete?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace') {
                e.preventDefault();
                if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1));
                else if (i > 0) {
                  onChange(value.slice(0, i - 1));
                  focus(i - 1);
                }
              } else if (e.key === 'ArrowLeft') focus(i - 1);
              else if (e.key === 'ArrowRight') focus(i + 1);
              else if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
            }}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(-1);
              if (!d) return;
              const next = setAt(i, d);
              if (i < PIN_LENGTH - 1) focus(i + 1);
              else if (next.length === PIN_LENGTH) onComplete?.();
            }}
            className={cn(
              'input h-13 w-12 text-center text-[22px] font-semibold tabular-nums tracking-normal',
              invalid && 'border-danger focus:border-danger',
              valid && 'border-emerald-500/70',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Live checklist ───────────────────────── */

type Status = 'idle' | 'wait' | 'ok' | 'bad';

function Rule({ status, children }: { status: Status; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-start gap-2 text-[12.5px]', status === 'ok' ? 'text-fg' : status === 'bad' ? 'text-danger' : 'text-fg-muted')}>
      <span
        className={cn(
          'mt-px grid size-4 shrink-0 place-items-center rounded-full',
          status === 'ok' ? 'bg-emerald-500 text-white' : status === 'bad' ? 'bg-danger text-white' : 'border border-line-strong',
        )}
        aria-hidden
      >
        {status === 'ok' ? <Check className="size-2.5" strokeWidth={3} /> : status === 'bad' ? <X className="size-2.5" strokeWidth={3} /> : status === 'wait' ? <Loader2 className="size-2.5 animate-spin" /> : null}
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Choose a 4-digit PIN with live checks: 4 digits, not easy to guess, nobody else in the
 * hotel has it (asked of the server as you type), and typed the same twice.
 */
export function PinSetter({
  check,
  onSubmit,
  needPassword,
  submitLabel = 'Save PIN',
  onCancel,
}: {
  check: (pin: string) => Promise<PinCheckDTO>;
  onSubmit: (pin: string, password: string) => Promise<void>;
  needPassword?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ pin: string; res?: PinCheckDTO; error?: string } | null>(null);
  const cache = useRef(new Map<string, PinCheckDTO>());
  const againRef = useRef<HTMLInputElement | null>(null);
  const passWrap = useRef<HTMLDivElement | null>(null);

  const full = pin.length === 4;
  const weak = full ? pinWeakness(pin) : null;

  // Ask the server whether anyone else has it, once the PIN is otherwise fine.
  useEffect(() => {
    setServerError(null);
    if (!full || weak) return setRemote(null);
    const hit = cache.current.get(pin);
    if (hit) return setRemote({ pin, res: hit });
    setRemote({ pin });
    let live = true;
    const t = setTimeout(() => {
      check(pin)
        .then((res) => {
          cache.current.set(pin, res);
          if (live) setRemote({ pin, res });
        })
        .catch((e) => live && setRemote({ pin, error: e instanceof ApiError ? e.message : 'Could not check right now' }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pin, full, weak, check]);

  const r = remote?.pin === pin ? remote : null;
  const uniqueStatus: Status = !full || weak ? 'idle' : !r || (!r.res && !r.error) ? 'wait' : r.error || !r.res!.ok ? 'bad' : 'ok';
  const uniqueText = r?.error ?? (r?.res?.same ? 'That is already your PIN — choose a new one' : r?.res && r.res.available === false ? 'Not available — choose another' : 'Available');
  const matchStatus: Status = again.length < 4 ? 'idle' : again === pin ? 'ok' : 'bad';
  const ready = full && !weak && uniqueStatus === 'ok' && matchStatus === 'ok' && (!needPassword || password.length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setServerError(null);
    setPasswordError(null);
    try {
      await onSubmit(pin, password);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not save the PIN';
      if (e instanceof ApiError && e.fieldErrors().password) setPasswordError(msg);
      else {
        setServerError(msg);
        if (e instanceof ApiError && e.status === 409) {
          cache.current.delete(pin);
          setRemote({ pin, res: { digits: true, weak: null, available: false, same: false, ok: false } });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <PinBoxes label="New PIN" value={pin} onChange={setPin} reveal={reveal} autoFocus invalid={!!weak || uniqueStatus === 'bad'} valid={uniqueStatus === 'ok'} onComplete={() => againRef.current?.focus()} />
        <PinBoxes
          label="Type it again"
          value={again}
          onChange={setAgain}
          reveal={reveal}
          inputRef={againRef}
          invalid={matchStatus === 'bad'}
          valid={matchStatus === 'ok'}
          onComplete={() => passWrap.current?.querySelector('input')?.focus()}
        />
        <button type="button" onClick={() => setReveal((v) => !v)} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted hover:text-fg" aria-pressed={reveal}>
          {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {reveal ? 'Hide' : 'Show'}
        </button>
      </div>

      <ul className="grid gap-1.5 rounded-xl border border-line bg-surface-2/60 p-3" aria-live="polite">
        <Rule status={pin.length === 0 ? 'idle' : full ? 'ok' : 'wait'}>Exactly 4 digits{pin.length > 0 && !full ? ` — ${4 - pin.length} to go` : ''}</Rule>
        <Rule status={!full ? 'idle' : weak ? 'bad' : 'ok'}>{weak ? `Too easy to guess: ${weak.charAt(0).toLowerCase()}${weak.slice(1)}` : 'Not easy to guess (no 1111, 1234, 1212 or years)'}</Rule>
        <Rule status={uniqueStatus}>{uniqueStatus === 'wait' ? 'Checking it is available…' : uniqueText}</Rule>
        <Rule status={matchStatus}>{matchStatus === 'bad' ? 'The two PINs are different' : 'Both entries match'}</Rule>
      </ul>

      {needPassword && (
        <div ref={passWrap}>
        <TextInput
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(null);
          }}
          error={passwordError ?? undefined}
          hint="Confirms it is really you"
        />
        </div>
      )}
      {serverError && (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {serverError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
