'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, BedDouble, Building2, Check, LoaderCircle, Minus, Plus, Rotate3d, ShieldCheck, Users } from 'lucide-react';
import type { AvailabilityDTO, BookingStartedDTO, OfferDTO, OfferPlanDTO, TourDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { formatMoney, type Currency } from '@reberon/utils';
import { cn } from '@/lib/cn';
import { useSite } from '@/components/site/site-provider';
import { CurrencyToggle } from '@/components/site/price';
import { TourPlayer, walkedSession } from '@/components/tours/tour-player';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const fmt = (s: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s}T12:00:00Z`));
const money = (m: string | bigint, c: string) => formatMoney(BigInt(m), c as Currency).replace(/\.00$/, '');
const MEAL: Record<string, string> = { RO: 'Room only', BB: 'Breakfast included', HB: 'Breakfast and dinner', FB: 'All meals' };

function Stepper({ value, set, min, max, label }: { value: number; set: (n: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <span className="inline-flex items-center rounded-full border border-line-strong">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => set(value - 1)} className="grid size-10 place-items-center disabled:opacity-30"><Minus className="size-4" /></button>
        <span className="w-8 text-center font-semibold tabular" aria-live="polite">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + 1)} className="grid size-10 place-items-center disabled:opacity-30"><Plus className="size-4" /></button>
      </span>
    </div>
  );
}

export function BookingFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const { currency, site } = useSite();
  const today = iso(new Date());
  const [arrival, setArrival] = useState(params.get('arrival') ?? addDays(today, 14));
  const [departure, setDeparture] = useState(params.get('departure') ?? addDays(today, 16));
  const [adults, setAdults] = useState(Number(params.get('adults')) || 2);
  const [children, setChildren] = useState(Number(params.get('children')) || 0);
  const [step, setStep] = useState<'search' | 'rooms' | 'details'>('search');
  const [data, setData] = useState<AvailabilityDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ offer: OfferDTO; plan: OfferPlanDTO } | null>(null);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState({ name: '', phone: '', email: '', eta: '', notes: '' });
  const [payOption, setPayOption] = useState<'premises' | 'deposit' | 'full'>('premises');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const preferRoom = params.get('room');
  // Movement III: walks for the rooms on offer (empty while tours are switched off).
  const [tours, setTours] = useState<TourDTO[]>([]);
  useEffect(() => {
    fetch(`${API}/v1/public/tours`).then((r) => (r.ok ? r.json() : [])).then(setTours).catch(() => undefined);
  }, []);

  async function search() {
    if (arrival >= departure) return setError('Your departure must be after your arrival.');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/v1/public/availability?arrival=${arrival}&departure=${departure}&adults=${adults}&children=${children}&currency=${currency}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? 'Something went wrong');
      setData(j);
      setPick(null);
      setStep('rooms');
      router.replace(`/book?arrival=${arrival}&departure=${departure}&adults=${adults}&children=${children}${preferRoom ? `&room=${preferRoom}` : ''}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Re-quote when the visitor switches currency on the results.
  useEffect(() => {
    if (step !== 'search' && data && data.currency !== currency) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const nights = data?.nights ?? Math.max(0, Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000));
  const extrasTotal = useMemo(() => {
    if (!data) return 0n;
    return Object.entries(extras).reduce((a, [id, n]) => {
      const e = data.extras.find((x) => x.id === id);
      if (!e || !n) return a;
      const unit = BigInt(data.currency === 'UGX' ? e.price.ugx : (e.price.usd ?? '0'));
      return a + unit * BigInt(n) * (e.unit === 'PER_NIGHT' ? BigInt(nights) : 1n);
    }, 0n);
  }, [extras, data, nights]);
  const total = pick ? BigInt(pick.plan.totalMinor) + extrasTotal : 0n;
  const depositPct = pick?.plan.depositPercent ?? 30;
  const deposit = pick ? (depositPct >= 100 ? total : (((total * BigInt(depositPct)) / 100n + (data!.currency === 'UGX' ? 999n : 99n)) / (data!.currency === 'UGX' ? 1000n : 100n)) * (data!.currency === 'UGX' ? 1000n : 100n)) : 0n;

  async function book() {
    if (!pick || !data) return;
    setSubmitting(true);
    setFieldErrors({});
    setError(null);
    try {
      const res = await fetch(`${API}/v1/public/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          arrival: data.arrival, departure: data.departure, adults, children, currency: data.currency,
          roomTypeId: pick.offer.roomType.id, ratePlanId: pick.plan.ratePlanId, rooms: pick.offer.roomsNeeded,
          extras: Object.entries(extras).filter(([, n]) => n > 0).map(([extraId, quantity]) => ({ extraId, quantity })),
          payAtPremises: payOption === 'premises',
          payInFull: payOption === 'full' || (payOption !== 'premises' && depositPct >= 100),
          guest: { name: guest.name, phone: guest.phone, email: guest.email },
          eta: guest.eta || undefined, notes: guest.notes || undefined, consent, tourSessionId: walkedSession(),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFieldErrors(Object.fromEntries((j.errors ?? []).map((e: { path: string; message: string }) => [e.path, e.message])));
        throw new Error(res.status === 409 ? `${j.detail} Please choose another room or dates.` : (j.detail ?? 'Something went wrong'));
      }
      const started = j as BookingStartedDTO;
      try {
        sessionStorage.setItem(`rb-booking-${started.code}`, started.accessToken);
      } catch {}
      window.location.href = started.payment.redirectUrl;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
      if ((e as Error).message.includes('taken')) setStep('rooms');
    }
  }

  const Summary = () => (
    <div className="rounded-[var(--r-lg)] border border-line bg-surface p-6">
      <p className="eyebrow">Your stay</p>
      <p className="mt-3 font-display text-step-2">{fmt(arrival)} → {fmt(departure)}</p>
      <p className="mt-1 text-sm text-fg-muted">{nights} night{nights === 1 ? '' : 's'} · {adults} adult{adults > 1 ? 's' : ''}{children ? `, ${children} child${children > 1 ? 'ren' : ''}` : ''}</p>
      {pick && data && (
        <dl className="mt-5 grid gap-2 border-t border-line pt-5 text-sm">
          <div className="flex justify-between gap-4"><dt>{pick.offer.roomsNeeded > 1 ? `${pick.offer.roomsNeeded} × ` : ''}{t(pick.offer.roomType.name)}</dt><dd className="tabular">{money(pick.plan.totalMinor, data.currency)}</dd></div>
          <div className="text-xs text-fg-subtle">{t(pick.plan.name)} · {MEAL[pick.plan.mealPlan]}</div>
          {Object.entries(extras).filter(([, n]) => n).map(([id, n]) => {
            const e = data.extras.find((x) => x.id === id)!;
            return <div key={id} className="flex justify-between gap-4 text-fg-muted"><dt>{t(e.name)} × {n}</dt></div>;
          })}
          {extrasTotal > 0n && <div className="flex justify-between gap-4"><dt>Extras</dt><dd className="tabular">{money(extrasTotal, data.currency)}</dd></div>}
          <div className="mt-2 flex justify-between gap-4 border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd className="tabular">{money(total, data.currency)}</dd></div>
          <p className="text-xs text-fg-subtle">{t(data.taxNote)}</p>
        </dl>
      )}
    </div>
  );

  return (
    <div className="container-x pb-24 pt-28 md:pt-36">
      <nav aria-label="Steps" className="mb-10 flex flex-wrap items-center gap-2 text-sm">
        {(['search', 'rooms', 'details'] as const).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-line-strong" />}
            <span className={cn('flex items-center gap-2 rounded-full px-3 py-1.5', step === s ? 'bg-fg text-bg' : 'text-fg-muted')}>
              <span className="tabular">{i + 1}</span> {['Dates', 'Room', 'Your details'][i]}
            </span>
          </span>
        ))}
      </nav>

      {error && <p role="alert" className="mb-6 rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

      {step === 'search' && (
        <section className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h1 className="text-step-5">When are you coming?</h1>
            <p className="mt-4 max-w-lg text-step-1 text-fg-muted">See every room and its price for your dates. Nothing is charged until the last step.</p>
          </div>
          <form className="grid gap-6 rounded-[var(--r-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field"><span className="text-sm font-semibold">Arriving</span><input className="input" type="date" min={today} value={arrival} onChange={(e) => { setArrival(e.target.value); if (e.target.value >= departure) setDeparture(addDays(e.target.value, 2)); }} required /></label>
              <label className="field"><span className="text-sm font-semibold">Leaving</span><input className="input" type="date" min={addDays(arrival, 1)} value={departure} onChange={(e) => setDeparture(e.target.value)} required /></label>
            </div>
            <Stepper label="Adults" value={adults} set={setAdults} min={1} max={12} />
            <Stepper label="Children" value={children} set={setChildren} min={0} max={8} />
            <div className="flex items-center justify-between"><span className="text-sm font-medium">Show prices in</span><CurrencyToggle /></div>
            <button type="submit" className="btn btn-lg" disabled={loading}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : null}<span className="btn-label">See rooms</span></button>
          </form>
        </section>
      )}

      {step === 'rooms' && data && (
        <section className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div>
            <button type="button" onClick={() => setStep('search')} className="mb-6 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Change dates</button>
            <h1 className="text-step-4">Rooms for {fmt(data.arrival)} → {fmt(data.departure)}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-fg-muted">{data.nights} night{data.nights === 1 ? '' : 's'}, prices for your whole stay.</p><CurrencyToggle /></div>
            <ul className="mt-8 grid gap-6">
              {[...data.offers].sort((a, b) => Number(b.roomType.slug === preferRoom) - Number(a.roomType.slug === preferRoom)).map((o) => (
                <li key={o.roomType.id} className={cn('overflow-hidden rounded-[var(--r-lg)] border bg-surface', o.plans.length ? 'border-line' : 'border-line opacity-70')}>
                  <div className="grid sm:grid-cols-[16rem_1fr]">
                    <div className="relative aspect-[4/3] sm:aspect-auto" style={{ backgroundColor: o.roomType.hero?.dominantColor ?? undefined }}>
                      {o.roomType.hero && <Image src={o.roomType.hero.url} alt={t(o.roomType.hero.alt)} fill sizes="(min-width:640px) 16rem, 100vw" className="object-cover" placeholder={o.roomType.hero.lqip ? 'blur' : 'empty'} blurDataURL={o.roomType.hero.lqip ?? undefined} />}
                    </div>
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-step-2">{t(o.roomType.name)}</h2>
                        <span className="flex items-center gap-4">
                          {(() => {
                            const tour = tours.find((x) => x.space === 'ROOM_TYPE' && x.roomTypeId === o.roomType.id);
                            return tour ? <TourPlayer tour={tour} context="CHECKOUT">{(open) => <button type="button" onClick={open} className="flex items-center gap-1.5 text-sm font-medium text-brand underline-offset-4 hover:underline"><Rotate3d className="size-4" aria-hidden /> Walk it</button>}</TourPlayer> : null;
                          })()}
                          <Link href={`/rooms/${o.roomType.slug}`} target="_blank" className="text-sm text-fg-muted underline-offset-4 hover:underline">About this room</Link>
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-fg-muted"><span className="flex items-center gap-1"><Users className="size-4" /> sleeps {o.roomType.sleepsAdults}{o.roomType.sleepsChildren ? ` + ${o.roomType.sleepsChildren}` : ''}</span><span className="flex items-center gap-1"><BedDouble className="size-4" /> {t(o.roomType.bedConfig)}</span></p>
                      {o.roomsNeeded > 1 && o.plans.length > 0 && <p className="mt-2 text-sm font-medium text-brand">Your party needs {o.roomsNeeded} of these rooms — prices below are for all of them.</p>}
                      {!o.plans.length ? <p className="mt-4 text-sm text-fg-muted">{o.unavailableReason}</p> : (
                        <ul className="mt-4 grid gap-2">
                          {o.plans.map((p) => (
                            <li key={p.ratePlanId}>
                              <button type="button" onClick={() => { setPick({ offer: o, plan: p }); setStep('details'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="group flex w-full flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-line px-4 py-3 text-left transition hover:border-fg">
                                <span>
                                  <span className="block font-medium">{t(p.name)}</span>
                                  <span className="text-sm text-fg-muted">{MEAL[p.mealPlan]} · {p.depositPercent >= 100 ? 'pay in full now' : `${p.depositPercent}% deposit now`}</span>
                                </span>
                                <span className="flex items-center gap-3">
                                  <span className="text-right"><span className="block text-lg font-semibold tabular">{money(p.totalMinor, data.currency)}</span><span className="text-xs text-fg-subtle">{money(BigInt(p.totalMinor) / BigInt(data.nights), data.currency)} a night</span></span>
                                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {o.available > 0 && o.available <= 2 && o.plans.length > 0 && <p className="mt-3 text-xs font-medium text-accent">Only {o.available} left for these dates</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-fg-subtle">{t(data.taxNote)}</p>
          </div>
          <aside className="lg:sticky lg:top-28 lg:self-start"><Summary /></aside>
        </section>
      )}

      {step === 'details' && data && pick && (
        <section className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <form className="grid gap-10" onSubmit={(e) => { e.preventDefault(); void book(); }} noValidate>
            <div>
              <button type="button" onClick={() => setStep('rooms')} className="mb-6 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Choose another room</button>
              <h1 className="text-step-4">Almost there</h1>
            </div>
            {data.extras.length > 0 && (
              <fieldset>
                <legend className="mb-4 text-step-2 font-display">Add to your stay <span className="font-sans text-sm text-fg-subtle">(optional)</span></legend>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.extras.map((e) => (
                    <li key={e.id} className={cn('rounded-[var(--r-md)] border p-4 transition', extras[e.id] ? 'border-fg' : 'border-line')}>
                      <p className="font-medium">{t(e.name)}</p>
                      <p className="mt-1 text-sm text-fg-muted">{t(e.summary)}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm tabular">{money(data.currency === 'UGX' ? e.price.ugx : (e.price.usd ?? '0'), data.currency)} <span className="text-fg-subtle">{e.unit.toLowerCase().replace('_', ' ')}</span></span>
                        <span className="inline-flex items-center rounded-full border border-line-strong">
                          <button type="button" aria-label={`Remove ${t(e.name)}`} disabled={!extras[e.id]} onClick={() => setExtras({ ...extras, [e.id]: (extras[e.id] ?? 0) - 1 })} className="grid size-9 place-items-center disabled:opacity-30"><Minus className="size-3.5" /></button>
                          <span className="w-6 text-center text-sm font-semibold tabular">{extras[e.id] ?? 0}</span>
                          <button type="button" aria-label={`Add ${t(e.name)}`} onClick={() => setExtras({ ...extras, [e.id]: (extras[e.id] ?? 0) + 1 })} className="grid size-9 place-items-center"><Plus className="size-3.5" /></button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <fieldset className="grid gap-5">
              <legend className="mb-2 text-step-2 font-display">Who is coming</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="field sm:col-span-2"><span className="text-sm font-semibold">Full name *</span><input className="input" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} aria-invalid={!!fieldErrors['guest.name']} />{fieldErrors['guest.name'] && <span className="error">{fieldErrors['guest.name']}</span>}</label>
                <label className="field"><span className="text-sm font-semibold">Phone / WhatsApp *</span><input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} aria-invalid={!!fieldErrors['guest.phone']} />{fieldErrors['guest.phone'] && <span className="error">{fieldErrors['guest.phone']}</span>}</label>
                <label className="field"><span className="text-sm font-semibold">Email *</span><input className="input" type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} aria-invalid={!!fieldErrors['guest.email']} /><span className="hint">Your confirmation goes here.</span></label>
                <label className="field"><span className="text-sm font-semibold">Arriving around</span><input className="input" placeholder="e.g. 16:00" value={guest.eta} onChange={(e) => setGuest({ ...guest, eta: e.target.value })} /></label>
                <label className="field"><span className="text-sm font-semibold">Anything we should know</span><input className="input" placeholder="Vegetarian, an anniversary…" value={guest.notes} onChange={(e) => setGuest({ ...guest, notes: e.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-step-2 font-display">Payment</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={cn('flex cursor-pointer gap-3 rounded-[var(--r-md)] border p-4 transition', payOption === 'premises' ? 'border-fg bg-surface-2/60' : 'border-line')}>
                  <input type="radio" name="pay" checked={payOption === 'premises'} onChange={() => setPayOption('premises')} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <span className="flex items-center gap-1.5 font-medium"><Building2 className="size-4 text-accent" /> Pay at the premises</span>
                    <span className="mt-0.5 block text-sm tabular text-fg-muted">{money(total, data.currency)} upon arrival at the hotel desk</span>
                  </span>
                </label>
                {depositPct < 100 && (
                  <label className={cn('flex cursor-pointer gap-3 rounded-[var(--r-md)] border p-4 transition', payOption === 'deposit' ? 'border-fg bg-surface-2/60' : 'border-line')}>
                    <input type="radio" name="pay" checked={payOption === 'deposit'} onChange={() => setPayOption('deposit')} className="mt-1 accent-[var(--accent)]" />
                    <span>
                      <span className="block font-medium">Pay a {depositPct}% deposit</span>
                      <span className="mt-0.5 block text-sm tabular text-fg-muted">{money(deposit, data.currency)} now, {money(total - deposit, data.currency)} at the house</span>
                    </span>
                  </label>
                )}
                <label className={cn('flex cursor-pointer gap-3 rounded-[var(--r-md)] border p-4 transition', payOption === 'full' ? 'border-fg bg-surface-2/60' : 'border-line')}>
                  <input type="radio" name="pay" checked={payOption === 'full'} onChange={() => setPayOption('full')} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-medium">Pay in full now</span>
                    <span className="mt-0.5 block text-sm tabular text-fg-muted">{money(total, data.currency)} online now</span>
                  </span>
                </label>
              </div>
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <ShieldCheck className="size-4 text-success" />
                {payOption === 'premises'
                  ? 'Your reservation is confirmed immediately. Settle by Cash, Mobile Money (MTN / Airtel), or Card at the front desk upon check-in.'
                  : 'MTN MoMo, Airtel Money, Visa or Mastercard through Pesapal. We never see your card.'}
              </p>
            </fieldset>
            <div className="grid gap-4 rounded-[var(--r-md)] bg-surface-2 p-5 text-sm">
              <p><b>Cancellation:</b> {t(pick.plan.cancellation)}</p>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" /><span>I accept the <Link className="underline" href="/legal/booking-terms" target="_blank">booking terms</Link> and <Link className="underline" href="/legal/privacy" target="_blank">privacy notice</Link>.</span></label>
            </div>
            <button type="submit" className="btn btn-lg justify-self-start" disabled={submitting || !consent || !guest.name || !guest.phone || !guest.email}>
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              <span className="btn-label">
                {submitting
                  ? 'Confirming your reservation…'
                  : payOption === 'premises'
                    ? `Confirm booking · Pay ${money(total, data.currency)} at the premises`
                    : `Hold my room and pay ${money(payOption === 'full' || depositPct >= 100 ? total : deposit, data.currency)}`}
              </span>
            </button>
            <p className="-mt-6 text-sm text-fg-subtle">
              {payOption === 'premises'
                ? 'Instant confirmation voucher sent to your email.'
                : 'Your room is held for 20 minutes while you pay.'}{' '}
              Questions? <a className="underline" href={site.contact.whatsapp ? `https://wa.me/${site.contact.whatsapp.replace(/\D/g, '')}` : '/contact'}>WhatsApp us</a>.
            </p>
          </form>
          <aside className="lg:sticky lg:top-28 lg:self-start"><Summary /></aside>
        </section>
      )}
    </div>
  );
}
