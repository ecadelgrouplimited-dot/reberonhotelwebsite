'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CircleCheck, CircleX, ExternalLink, LoaderCircle, Printer, ShieldCheck } from 'lucide-react';
import { formatMoney, type Currency } from '@reberon/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type Result =
  | { valid: false }
  | {
      valid: true;
      kind: string;
      number: string;
      checkCode?: string;
      issuedToName?: string;
      summary?: string;
      issuedAt: string;
      currency: string;
      amountMinor: string;
      voided: boolean;
      publicPrintUrl?: string;
    };

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
      `${API}/v1/public/documents/verify?number=${encodeURIComponent(num.trim())}&check=${encodeURIComponent(chk.trim())}`,
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
    <div className="mt-8 grid gap-6">
      {r &&
        (r.valid ? (
          <div
            role="status"
            className={`rounded-[var(--r-lg)] border p-6 shadow-sm ${
              r.voided ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-success">
                  {r.voided ? (
                    <>
                      <CircleX className="size-4 text-warning" /> Voided / Expired Document
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4 text-success" /> Verified Authentic Document
                    </>
                  )}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold">
                  {r.kind} · <span className="font-mono">{r.number}</span>
                </h2>
              </div>
              <CircleCheck className={`size-7 shrink-0 ${r.voided ? 'text-warning' : 'text-success'}`} />
            </div>

            <dl className="mt-4 grid gap-2.5 border-t border-line pt-4 text-sm">
              {r.issuedToName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Issued To</dt>
                  <dd className="text-right font-semibold">{r.issuedToName}</dd>
                </div>
              )}
              {r.summary && (
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Description</dt>
                  <dd className="text-right">{r.summary}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Verified Amount</dt>
                <dd className="text-right font-mono text-base font-bold">
                  {formatMoney(BigInt(r.amountMinor), r.currency as Currency).replace(/\.00$/, '')}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Date Issued</dt>
                <dd className="text-right">
                  {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Kampala' }).format(
                    new Date(r.issuedAt),
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Verification Code</dt>
                <dd className="text-right font-mono font-semibold">{r.checkCode ?? check}</dd>
              </div>
            </dl>

            {r.publicPrintUrl && (
              <div className="mt-5 border-t border-line pt-4">
                <a
                  href={r.publicPrintUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-md w-full justify-center"
                >
                  <Printer className="size-4" />
                  <span className="btn-label">View / Print Official Copy</span>
                  <ExternalLink className="size-3.5 opacity-70" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-[var(--r-lg)] border border-danger/30 bg-danger/5 p-5 font-semibold text-danger"
          >
            <CircleX className="size-5 shrink-0" /> We did not issue a document with that number and check code.
          </p>
        ))}

      <form
        className="grid gap-5 rounded-[var(--r-lg)] border border-line bg-surface p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          await runVerify(number, check);
        }}
      >
        <label className="field">
          <span className="text-sm font-semibold">Document number</span>
          <input
            className="input font-mono uppercase"
            placeholder="RCT-2026-00001, INV-2026-00001, or QUO-2026-00001"
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
          <span className="btn-label">Verify Authenticity</span>
        </button>
      </form>
    </div>
  );
}
