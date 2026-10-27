'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Frown,
  LoaderCircle,
  Meh,
  MessageSquare,
  Printer,
  ShieldCheck,
  Smile,
  X,
} from 'lucide-react';
import type { GuestStayDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { formatMoney, whatsappLink, type Currency } from '@reberon/utils';
import { cn } from '@/lib/cn';
import { useSite } from '@/components/site/site-provider';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const money = (m: string, c: string) => formatMoney(BigInt(m), c as Currency).replace(/\.00$/, '');
const DOC = { RECEIPT: 'Receipt', REFUND: 'Refund note', INVOICE: 'Invoice' } as const;
const fmt = (s: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${s}T12:00:00Z`),
  );

export function StayView({ code, token, waitForPayment }: { code: string; token: string; waitForPayment?: boolean }) {
  const { site, openEnquiry } = useSite();
  const [s, setS] = useState<GuestStayDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [waited, setWaited] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<GuestStayDTO['documents'][number] | null>(null);

  useEffect(() => {
    let stop = false;
    let n = 0;
    const load = async () => {
      const r = await fetch(`${API}/v1/public/bookings/${code}?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) return setError('We could not find that booking. Check the link, or look it up with your code and phone number.');
      const j = (await r.json()) as GuestStayDTO;
      if (stop) return;
      setS(j);
      n++;
      setWaited(n);
      // After returning from the payment page, keep checking until the payment lands.
      if (waitForPayment && j.status === 'HELD' && n < 30) setTimeout(load, 2000);
    };
    void load();
    return () => {
      stop = true;
    };
  }, [code, token, waitForPayment]);

  async function pay() {
    setPaying(true);
    const r = await fetch(`${API}/v1/public/bookings/${code}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: token }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.detail ?? 'Could not start the payment');
      setPaying(false);
      return;
    }
    window.location.href = j.redirectUrl;
  }

  if (error)
    return (
      <p role="alert" className="rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-4 py-3 text-danger">
        {error}
      </p>
    );
  if (!s)
    return (
      <div className="grid place-items-center py-24">
        <LoaderCircle className="size-6 animate-spin text-fg-subtle" />
      </div>
    );

  const confirmed = ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'].includes(s.status);
  const balance = BigInt(s.balanceMinor);
  const heading =
    s.status === 'HELD'
      ? waitForPayment && waited < 30
        ? 'Confirming your payment…'
        : 'Your room is held — payment not received yet'
      : s.status === 'CONFIRMED'
        ? waitForPayment
          ? `You are booked, ${s.guestName.split(' ')[0]}.`
          : `Your stay, ${s.guestName.split(' ')[0]}`
        : s.status === 'IN_HOUSE'
          ? `Welcome to Reberon, ${s.guestName.split(' ')[0]}.`
          : s.status === 'CHECKED_OUT'
            ? `Thank you for staying, ${s.guestName.split(' ')[0]}.`
            : s.status === 'CANCELLED'
              ? 'This booking is cancelled'
              : s.status === 'EXPIRED'
                ? 'This hold has ended'
                : 'Your stay';

  return (
    <>
      {/* ───────────── Printable Official Stay Voucher Header (Print Only) ───────────── */}
      <div className="hidden print:block mb-6 pb-4 border-b-2 border-stone-900">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <svg
                viewBox="0 0 40 24"
                className="h-6 w-10 text-stone-900"
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
              <span className="font-display text-2xl font-bold tracking-tight text-stone-900">{site.name}</span>
            </div>
            <p className="mt-1 text-xs text-stone-600">{t(site.contact.address) || 'Kapchorwa, Mount Elgon, Uganda'}</p>
            <p className="text-xs text-stone-600">
              {[site.contact.phones?.[0], site.contact.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-stone-900 text-white font-mono text-xs uppercase tracking-wider font-bold rounded">
              {s.status === 'CONFIRMED' ? (balance <= 0n ? 'Confirmed · Paid in Full' : 'Confirmed · Balance Due') : s.status}
            </span>
            <p className="mt-2 text-xs font-mono text-stone-500 uppercase tracking-wider">Booking Reference</p>
            <p className="font-mono text-xl font-bold text-stone-900 tracking-wider">{s.code}</p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-stone-200 flex justify-between text-xs text-stone-600">
          <div>
            <b>Guest Name:</b> <span className="font-semibold text-stone-900">{s.guestName}</span>
          </div>
          <div>
            <b>Stay:</b> {s.nights} night{s.nights === 1 ? '' : 's'} · {s.adults} adult{s.adults > 1 ? 's' : ''}
            {s.children ? `, ${s.children} child${s.children > 1 ? 'ren' : ''}` : ''}
          </div>
          <div>
            <b>Confirmation Date:</b>{' '}
            {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Kampala' }).format(new Date())}
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem] print:block print:space-y-6">
        <div>
          {/* On-screen Header */}
          <div className="print:hidden">
            <div className="flex items-center gap-3">
              <p className="eyebrow">
                Booking <span className="font-mono tracking-normal font-bold text-fg">{s.code}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(s.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-muted hover:border-fg hover:text-fg transition cursor-pointer"
                title="Copy booking code"
              >
                {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <h1 className="mt-4 flex items-center gap-4 text-step-5">
              {heading}
              {s.status === 'HELD' && waitForPayment && waited < 30 && (
                <LoaderCircle className="size-8 animate-spin text-fg-subtle" />
              )}
            </h1>
            {confirmed && waitForPayment && (
              <p className="mt-4 text-step-1 text-fg-muted">
                Your confirmation is on its way by email. Everything is below — bookmark this page.
              </p>
            )}
            {s.status === 'HELD' && s.holdExpiresAt && (!waitForPayment || waited >= 30) && (
              <p className="mt-4 text-step-1 text-fg-muted">
                We hold your room until{' '}
                {new Date(s.holdExpiresAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Africa/Kampala',
                })}
                . If the payment did not go through, try again below.
              </p>
            )}
            {s.status === 'EXPIRED' && (
              <p className="mt-4 text-step-1 text-fg-muted">
                No payment arrived in time, so the room is free again. Nothing was charged.{' '}
                <a className="underline" href={`/book?arrival=${s.arrival}&departure=${s.departure}&adults=${s.adults}`}>
                  Start again
                </a>
                .
              </p>
            )}
          </div>

          {/* Dates Card */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:mt-0 print:gap-4 stay-print-card">
            <div className="rounded-[var(--r-lg)] border border-line p-5 print:border-stone-300 print:p-4 bg-surface">
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <CalendarCheck className="size-4" /> Arrive
              </p>
              <p className="mt-2 text-lg font-medium">{fmt(s.arrival)}</p>
              <p className="text-sm text-fg-muted">from {s.checkIn}</p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-line p-5 print:border-stone-300 print:p-4 bg-surface">
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Clock className="size-4" /> Leave
              </p>
              <p className="mt-2 text-lg font-medium">{fmt(s.departure)}</p>
              <p className="text-sm text-fg-muted">by {s.checkOut}</p>
            </div>
          </div>

          {/* Reserved Rooms */}
          <ul className="mt-6 grid gap-4 print:mt-4 print:gap-3 stay-print-card">
            {s.rooms.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-4 rounded-[var(--r-lg)] border border-line p-3.5 print:border-stone-300 print:p-3 bg-surface"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-2 print:size-16">
                  {r.hero && <Image src={r.hero.url} alt="" fill sizes="80px" className="object-cover" />}
                </div>
                <div>
                  <p className="text-lg font-medium print:text-base">
                    {r.quantity > 1 ? `${r.quantity} × ` : ''}
                    {t(r.name)}
                  </p>
                  <p className="text-sm text-fg-muted print:text-xs">
                    {s.nights} night{s.nights === 1 ? '' : 's'} · {s.adults} adult{s.adults > 1 ? 's' : ''}
                    {s.children ? `, ${s.children} child${s.children > 1 ? 'ren' : ''}` : ''} · {t(s.ratePlan.name)}
                  </p>
                  {s.extras.length > 0 && (
                    <p className="mt-1 text-sm text-fg-muted print:text-xs">
                      With {s.extras.map((e) => `${t(e.name)} × ${e.quantity}`).join(', ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Before you drive */}
          {confirmed && (
            <div className="mt-8 rounded-[var(--r-lg)] bg-surface-2 p-6 text-sm leading-relaxed print:mt-4 print:p-4 print:border print:border-stone-200 print:bg-stone-50 stay-print-card">
              <p className="font-semibold text-stone-900">Before you drive</p>
              <p className="mt-1.5 text-fg-muted print:text-stone-700">
                Leave Kampala by 6:30 to miss the Jinja traffic — six to seven hours with a lunch stop in Mbale. The last
                kilometre is murram; take it slowly after rain. Call us from Mbale if you will arrive after dark; the gate is
                staffed all night.
              </p>
              <a className="mt-2 inline-block underline print:hidden" href="/kapchorwa/getting-here">
                Directions and the road, stop by stop
              </a>
            </div>
          )}
          <p className="mt-6 text-sm text-fg-subtle print:mt-3 print:text-xs stay-print-card">
            <b>Cancellation:</b> {t(s.cancellation)}
          </p>

          {/* Feedback Form (Screen Only) */}
          {s.canGiveFeedback && (
            <div className="print:hidden">
              <Feedback
                code={s.code}
                token={token}
                initial={s.feedback}
                after={s.status === 'CHECKED_OUT'}
                onSaved={(f) => setS({ ...s, feedback: f })}
              />
            </div>
          )}
        </div>

        {/* Aside: Financial Summary, Formatted Receipts & Actions */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-28 print:static print:block print:space-y-4 print:mt-6">
          {/* Financial summary card */}
          <div className="rounded-[var(--r-lg)] border border-line bg-surface p-6 print:border-stone-300 print:p-4 stay-print-card">
            <p className="hidden print:block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Financial Summary
            </p>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Total</dt>
                <dd className="font-semibold tabular">{money(s.totalMinor, s.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Paid</dt>
                <dd className="tabular font-semibold text-success print:text-stone-900">{money(s.paidMinor, s.currency)}</dd>
              </div>
              <div
                className={cn(
                  'flex justify-between border-t border-line pt-2 text-base font-semibold',
                  balance <= 0n && 'text-success print:text-stone-900',
                )}
              >
                <dt>
                  {balance > 0n
                    ? s.status === 'HELD'
                      ? 'To pay'
                      : 'Balance at the house'
                    : 'Paid in full'}
                </dt>
                <dd className="tabular">{balance > 0n ? money(s.balanceMinor, s.currency) : '✓ Paid in full'}</dd>
              </div>
            </dl>
            {s.canPayBalance && balance > 0n && (
              <button
                type="button"
                className="btn mt-5 w-full print:hidden"
                disabled={paying}
                onClick={pay}
              >
                {paying && <LoaderCircle className="size-4 animate-spin" />}
                <span className="btn-label">
                  {s.status === 'HELD' ? 'Pay the deposit' : `Pay ${money(s.balanceMinor, s.currency)} now`}
                </span>
              </button>
            )}
          </div>

          {/* Formatted Receipts & Invoices */}
          {s.documents.length > 0 && (
            <div className="rounded-[var(--r-lg)] border border-line bg-surface p-5 print:border-stone-300 print:p-4 stay-print-card">
              <p className="text-sm font-semibold">Receipts and invoices</p>

              {/* Screen list: interactive modal trigger with rich feedback */}
              <ul className="mt-3 grid gap-1.5 print:hidden">
                {s.documents.map((d) => (
                  <li key={d.number}>
                    <button
                      type="button"
                      onClick={() => setSelectedDoc(d)}
                      className="flex w-full items-center gap-3 rounded-[var(--r-md)] border border-transparent px-3 py-2.5 text-left text-sm transition hover:border-line hover:bg-surface-2 group cursor-pointer"
                    >
                      <FileText className="size-4 shrink-0 text-fg-subtle group-hover:text-brand" aria-hidden />
                      <span className="flex-1">
                        <span className="block font-medium">{DOC[d.kind]}</span>
                        <span className="font-mono text-xs text-fg-muted">{d.number}</span>
                      </span>
                      <span className="tabular font-medium">
                        {d.kind === 'REFUND' ? '−' : ''}
                        {money(d.amountMinor, s.currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fg-subtle print:hidden">
                Click any receipt to view formatted details, switch paper size, or print.
              </p>

              {/* Print list: cleanly formatted itemized records */}
              <ul className="hidden print:block mt-2 divide-y divide-stone-200 text-xs">
                {s.documents.map((d) => (
                  <li key={d.number} className="flex justify-between py-2">
                    <span>
                      <b className="text-stone-900">{DOC[d.kind]}</b>{' '}
                      <span className="font-mono text-stone-600">({d.number})</span>
                    </span>
                    <span className="tabular font-semibold text-stone-900">
                      {d.kind === 'REFUND' ? '−' : ''}
                      {money(d.amountMinor, s.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hidden print:block mt-2 text-[11px] text-stone-500">
                Official documents carry a unique check code verifiable at ecadelgroup.com / reberon.com/verify
              </p>
            </div>
          )}

          {/* Interactive action buttons (hidden in print) */}
          <div className="grid gap-2.5 print:hidden">
            <button type="button" className="btn btn-secondary w-full" onClick={() => openEnquiry({ intent: 'STAY' })}>
              <MessageSquare className="size-4" /> Ask for something
            </button>
            {site.contact.whatsapp && (
              <a
                className="btn btn-secondary w-full"
                href={whatsappLink(site.contact.whatsapp, `Hello, this is ${s.guestName} about booking ${s.code}.`)}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp the desk
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost justify-self-center cursor-pointer"
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> <span className="btn-label">Print confirmation voucher</span>
            </button>
          </div>
        </aside>
      </div>

      {/* ───────────── Printable Official Stay Voucher Footer (Print Only) ───────────── */}
      <div className="hidden print:block pt-5 mt-6 border-t border-stone-800 text-xs text-stone-600 text-center stay-print-card">
        <p className="font-semibold text-stone-900">
          Official Confirmation Voucher · Reberon Hotel, Kapchorwa, Mount Elgon, Uganda
        </p>
        <p className="mt-1">Please present this voucher upon check-in. Valid government-issued photo ID required.</p>
        <p className="mt-2 text-[11px] text-stone-500">
          Technology created and managed by{' '}
          <span className="font-semibold text-stone-700">ECADEL GROUP LIMITED</span> (
          <a href="https://ecadelgroup.com" className="underline">
            ecadelgroup.com
          </a>
          )
        </p>
      </div>

      {/* ───────────── In-App Formatted Receipt Viewer Modal ───────────── */}
      {selectedDoc && (
        <ReceiptModal
          doc={selectedDoc}
          currency={s.currency}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </>
  );
}

interface ReceiptModalProps {
  doc: GuestStayDTO['documents'][number] | null;
  currency: string;
  onClose: () => void;
}

function ReceiptModal({ doc, currency, onClose }: ReceiptModalProps) {
  const [paper, setPaper] = useState<'A4' | '80MM'>('A4');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!doc) return null;

  const docUrlWithPaper = `${doc.url}&paper=${paper}`;

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    } else {
      window.open(docUrlWithPaper, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 no-print"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-basalt-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[92vh] rounded-[var(--r-xl)] border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-surface-2/70">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-[var(--r-md)] bg-brand/10 text-brand">
              <FileText className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">{DOC[doc.kind]}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface border border-line font-bold">
                  {doc.number}
                </span>
              </div>
              <p className="text-xs text-fg-muted">
                Amount: {doc.kind === 'REFUND' ? '−' : ''}
                {money(doc.amountMinor, currency)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-fg-subtle hover:bg-surface hover:text-fg transition cursor-pointer"
            aria-label="Close receipt"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-2.5 bg-surface text-xs">
          <div className="flex items-center gap-2">
            <span className="text-fg-subtle font-medium">Paper format:</span>
            <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-2/60">
              <button
                type="button"
                onClick={() => setPaper('A4')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition cursor-pointer',
                  paper === 'A4' ? 'bg-surface shadow-xs text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                A4 Page
              </button>
              <button
                type="button"
                onClick={() => setPaper('80MM')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition cursor-pointer',
                  paper === '80MM' ? 'bg-surface shadow-xs text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                80mm Thermal
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 font-semibold text-bg transition hover:opacity-90 cursor-pointer"
            >
              <Printer className="size-3.5" />
              <span>Print receipt</span>
            </button>
            <a
              href={docUrlWithPaper}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-fg-muted transition hover:border-fg/40 hover:text-fg"
            >
              <ExternalLink className="size-3.5" />
              <span>Open in tab</span>
            </a>
            <a
              href={`/verify?number=${encodeURIComponent(doc.number)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-fg-muted transition hover:border-fg/40 hover:text-fg"
            >
              <ShieldCheck className="size-3.5" />
              <span>Verify</span>
            </a>
          </div>
        </div>

        {/* Modal Iframe Body */}
        <div className="relative flex-1 bg-stone-200/50 p-2 sm:p-4 overflow-auto">
          <iframe
            ref={iframeRef}
            src={docUrlWithPaper}
            title={`${DOC[doc.kind]} ${doc.number}`}
            className="w-full h-[62vh] border-0 rounded-lg shadow-sm bg-white"
          />
        </div>
      </div>
    </div>
  );
}

const FACES = [
  ['GOOD', 'Good', Smile],
  ['OK', 'OK', Meh],
  ['BAD', 'Not good', Frown],
] as const;
type Score = (typeof FACES)[number][0];

/** One tap is enough. Words and permission to quote are optional. */
function Feedback({
  code,
  token,
  initial,
  after,
  onSaved,
}: {
  code: string;
  token: string;
  initial: GuestStayDTO['feedback'];
  after: boolean;
  onSaved: (f: NonNullable<GuestStayDTO['feedback']>) => void;
}) {
  const [score, setScore] = useState<Score | null>(initial?.score ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [allowPublic, setAllowPublic] = useState(initial?.allowPublic ?? false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(initial ? 'saved' : 'idle');
  const [message, setMessage] = useState('');

  async function send(next: Score = score!) {
    setState('saving');
    const r = await fetch(`${API}/v1/public/bookings/${code}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: token, score: next, comment: comment || undefined, allowPublic }),
    });
    if (!r.ok) {
      setMessage(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? 'Could not send. Try again.');
      return setState('error');
    }
    setState('saved');
    onSaved({ score: next, comment: comment || null, allowPublic });
  }

  return (
    <section id="feedback" className="mt-10 scroll-mt-28 rounded-[var(--r-xl)] border border-line p-6 sm:p-8">
      <h2 className="text-step-2">{after ? 'How was your stay?' : 'How is your stay so far?'}</h2>
      <p className="mt-2 text-fg-muted">
        {after
          ? 'One tap is enough. The owner reads every answer.'
          : 'If something is not right, tell us now — we would rather fix it tonight.'}
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Your answer">
        {FACES.map(([v, l, Icon]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={score === v}
            onClick={() => {
              setScore(v);
              if (!initial && state === 'idle') void send(v);
              else setState('idle');
            }}
            className={cn(
              'flex h-24 flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] border text-base font-medium transition cursor-pointer',
              score === v ? 'border-fg bg-fg text-bg' : 'border-line hover:border-fg/40',
            )}
          >
            <Icon className="size-7" aria-hidden /> {l}
          </button>
        ))}
      </div>
      {score && (
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">
              {score === 'GOOD' ? 'What did you like?' : 'What should we do better?'}{' '}
              <span className="font-normal text-fg-muted">(optional)</span>
            </span>
            <textarea
              className="min-h-28 rounded-[var(--r-md)] border border-line bg-surface p-3 text-base"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (state === 'saved') setState('idle');
              }}
              maxLength={2000}
            />
          </label>
          {score === 'GOOD' && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={allowPublic}
                onChange={(e) => {
                  setAllowPublic(e.target.checked);
                  if (state === 'saved') setState('idle');
                }}
              />
              <span>You may quote my words on the Reberon website, with my first name and country.</span>
            </label>
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="btn"
              disabled={state === 'saving' || state === 'saved'}
              onClick={() => send()}
            >
              {state === 'saving' && <LoaderCircle className="size-4 animate-spin" />}
              <span className="btn-label">{state === 'saved' ? 'Sent — thank you' : 'Send'}</span>
            </button>
            {state === 'error' && (
              <p role="alert" className="text-sm text-danger">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
