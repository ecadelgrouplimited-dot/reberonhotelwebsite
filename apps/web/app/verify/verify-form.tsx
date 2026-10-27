'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react';
import { formatMoney, type Currency } from '@reberon/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type Result =
  | { valid: false }
  | { valid: true; kind: string; number: string; issuedAt: string; currency: string; amountMinor: string; voided: boolean };

export function VerifyForm() {
  const params = useSearchParams();
  const [number, setNumber] = useState(params.get('number')?.toUpperCase() ?? '');
  const [check, setCheck] = useState(params.get('check')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

  async function runVerify(num: string, chk: string) {
    if (!num.trim() || !chk.trim()) return;
    setBusy(true);
    const res = await fetch(
      `${API}/v1/public/documents/verify?number=${encodeURIComponent(num)}&check=${encodeURIComponent(chk)}`,
    ).catch(() => null);
    setR(res?.ok ? ((await res.json()) as Result) : { valid: false });
    setBusy(false);
  }

  useEffect(() => {
    const qNum = params.get('number');
    const qChk = params.get('check');
    if (qNum && qChk) {
      setNumber(qNum.toUpperCase());
      setCheck(qChk.toUpperCase());
      void runVerify(qNum.toUpperCase(), qChk.toUpperCase());
    }
  }, [params]);

  return (
    <form
      className="mt-8 grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        await runVerify(number, check);
      }}
    >
      <label className="field">
        <span className="text-sm font-semibold">Document number</span>
        <input
          className="input font-mono uppercase"
          placeholder="RCT-2026-00042 or QUO-2026-00001"
          value={number}
          onChange={(e) => {
            setNumber(e.target.value.toUpperCase());
            setR(null);
          }}
          required
        />
      </label>
      <label className="field">
        <span className="text-sm font-semibold">Check code</span>
        <input
          className="input font-mono uppercase"
          placeholder="AB12-CD34"
          value={check}
          onChange={(e) => {
            setCheck(e.target.value.toUpperCase());
            setR(null);
          }}
          required
        />
      </label>
      <button type="submit" className="btn btn-lg" disabled={busy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        <span className="btn-label">Verify authenticity</span>
      </button>
      {r &&
        (r.valid ? (
          <div
            role="status"
            className={`rounded-[var(--r-lg)] border p-5 ${r.voided ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/5'}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {r.voided ? <CircleX className="size-5 text-warning" /> : <CircleCheck className="size-5 text-success" />}
              {r.voided ? 'Genuine, but it was voided or expired' : 'Genuine Reberon Hotel Document'}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {r.kind} <span className="font-mono font-semibold">{r.number}</span> ·{' '}
              {formatMoney(BigInt(r.amountMinor), r.currency as Currency).replace(/\.00$/, '')} ·{' '}
              {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Kampala' }).format(
                new Date(r.issuedAt),
              )}
            </p>
          </div>
        ) : (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-[var(--r-lg)] border border-danger/30 bg-danger/5 p-5 font-semibold text-danger"
          >
            <CircleX className="size-5" /> We did not issue a document with that number and code.
          </p>
        ))}
    </form>
  );
}
