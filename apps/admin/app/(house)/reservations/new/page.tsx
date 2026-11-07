'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, BadgePercent, Check, ChevronDown, Crown, HandCoins, Minus, Plus, Search, UserCheck, X } from 'lucide-react';
import type { AvailabilityDTO, GuestSummaryDTO, WaitlistEntryDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/field';

const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const roundDeposit = (amount: bigint, currency: string) => {
  const step = currency === 'UGX' ? 1000n : 100n;
  return ((amount + step - 1n) / step) * step;
};
const major = (m: bigint, currency: string) => (currency === 'USD' ? (Number(m) / 100).toFixed(2) : String(m));

const METHODS = [['CASH', 'Cash'], ['MOBILE_MONEY', 'Mobile money'], ['CARD', 'Card'], ['BANK', 'Bank transfer']] as const;
const SOURCES = [['WALK_IN', 'At the desk'], ['PHONE', 'Phone'], ['WHATSAPP', 'WhatsApp'], ['DIRECT', 'Email / other']] as const;

function Stepper({ value, set, min = 0, max = 99, label }: { value: number; set: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <span className="inline-flex h-10 items-center justify-between rounded-xl border border-line-strong bg-surface">
      <button type="button" className="grid size-10 place-items-center disabled:opacity-30" disabled={value <= min} onClick={() => set(value - 1)} aria-label={`Fewer ${label}`}><Minus className="size-3.5" /></button>
      <span className="min-w-8 text-center font-medium tabular">{value}</span>
      <button type="button" className="grid size-10 place-items-center disabled:opacity-30" disabled={value >= max} onClick={() => set(value + 1)} aria-label={`More ${label}`}><Plus className="size-3.5" /></button>
    </span>
  );
}

function NewReservation() {
  const params = useSearchParams();
  const router = useRouter();
  const can = useCan();
  const fromWaitlist = params.get('waitlist');
  const walkIn = params.get('walkin') === '1';
  const today = kampalaToday();
  const [arrival, setArrival] = useState(params.get('arrival') ?? (walkIn ? today : plus(today, 7)));
  const [departure, setDeparture] = useState(params.get('departure') ?? (walkIn ? plus(today, 1) : plus(today, 9)));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [currency, setCurrency] = useState<'UGX' | 'USD'>('UGX');
  const [pick, setPick] = useState<{ roomTypeId: string; ratePlanId: string; rooms: number } | null>(null);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState({ name: '', phone: '', email: '', country: '' });
  const [known, setKnown] = useState<GuestSummaryDTO | null>(null);
  const [source, setSource] = useState(walkIn ? 'WALK_IN' : 'PHONE');
  const [confirmNow, setConfirmNow] = useState(walkIn);
  const [eta, setEta] = useState('');
  const [requests, setRequests] = useState('');
  const [notes, setNotes] = useState('');
  const [showNightly, setShowNightly] = useState(false);
  const [discountOn, setDiscountOn] = useState(false);
  const [discount, setDiscount] = useState({ amount: '', reason: '' });
  const [payMode, setPayMode] = useState<'none' | 'deposit' | 'full' | 'other'>(walkIn ? 'full' : 'none');
  const [payment, setPayment] = useState({ amount: '', method: 'CASH', reference: '' });

  const nights = nightsBetween(arrival, departure);
  const valid = nights > 0;
  const setNights = (n: number) => setDeparture(plus(arrival, Math.max(1, n)));
  const changeArrival = (v: string) => {
    if (!v) return;
    const keep = Math.max(1, nights);
    setArrival(v);
    setDeparture(plus(v, keep));
  };
  const weekend = (() => {
    const d = (5 - weekday(today) + 7) % 7;
    return plus(today, d);
  })();

  /* first-stay list conversion */
  const wl = useQuery({ queryKey: ['waitlist-entry', fromWaitlist], queryFn: () => get<WaitlistEntryDTO>(`/waitlist/${fromWaitlist}`), enabled: !!fromWaitlist });
  useEffect(() => {
    const w = wl.data;
    if (!w) return;
    setGuest({ name: w.contact.name, phone: w.contact.phone ?? '', email: w.contact.email ?? '', country: '' });
    if (w.preferredFrom && w.preferredTo && w.preferredFrom >= today) {
      setArrival(w.preferredFrom);
      setDeparture(w.preferredTo);
    }
    setAdults(w.adults);
    setChildren(w.children);
    setSource('WHATSAPP');
    if (w.note) setNotes(`From the first-stay list (${w.reference}): ${w.note}`);
  }, [wl.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* returning-guest lookup */
  const [lookupOpen, setLookupOpen] = useState(false);
  const term = useDebounced((guest.phone.replace(/\D/g, '').length >= 4 ? guest.phone : guest.name).trim(), 300);
  const lookup = useQuery({
    queryKey: ['guest-lookup', term],
    queryFn: () => get<{ data: GuestSummaryDTO[] }>(`/guests?q=${encodeURIComponent(term)}`),
    enabled: can('guests:read') && term.length >= 3 && !known,
    staleTime: 30_000,
  });
  const matches = (lookup.data?.data ?? []).slice(0, 5);
  const pickGuest = (g: GuestSummaryDTO) => {
    setKnown(g);
    setGuest({ name: g.name, phone: g.phone ?? '', email: g.email ?? '', country: g.country ?? '' });
    setLookupOpen(false);
  };

  /* availability & price */
  const q = useQuery({
    queryKey: ['quote', arrival, departure, adults, children, currency],
    queryFn: () => get<AvailabilityDTO>(`/reservations-quote?arrival=${arrival}&departure=${departure}&adults=${adults}&children=${children}&currency=${currency}`),
    enabled: valid,
  });
  useEffect(() => setPick(null), [arrival, departure, adults, children, currency]);
  const offers = useMemo(() => [...(q.data?.offers ?? [])].sort((a, b) => Number(!!a.unavailableReason) - Number(!!b.unavailableReason)), [q.data]);

  const offer = q.data?.offers.find((o) => o.roomType.id === pick?.roomTypeId);
  const plan = offer?.plans.find((p) => p.ratePlanId === pick?.ratePlanId);
  const perRoom = plan ? BigInt(plan.totalMinor) / BigInt(offer!.roomsNeeded) : 0n;
  const roomsTotal = perRoom * BigInt(pick?.rooms ?? 0);
  const extrasTotal = Object.entries(extras).reduce((a, [id, n]) => {
    const e = q.data?.extras.find((x) => x.id === id);
    const unit = e ? BigInt(currency === 'UGX' ? e.price.ugx : (e.price.usd ?? '0')) : 0n;
    return a + unit * BigInt(n) * (e?.unit === 'PER_NIGHT' ? BigInt(q.data!.nights) : 1n);
  }, 0n);
  const discountMinor = discountOn ? BigInt(toMinorStr(discount.amount, currency) ?? '0') : 0n;
  const total = roomsTotal + extrasTotal - discountMinor;
  const deposit = plan ? (plan.depositPercent > 0 ? roundDeposit((total * BigInt(plan.depositPercent)) / 100n, currency) : total) : 0n;
  const depositDue = deposit > total ? total : deposit;
  useEffect(() => {
    if (payMode === 'deposit') setPayment((p) => ({ ...p, amount: major(depositDue, currency) }));
    if (payMode === 'full') setPayment((p) => ({ ...p, amount: major(total < 0n ? 0n : total, currency) }));
  }, [payMode, depositDue, total, currency]);
  const paying = confirmNow && can('payments:record') && payMode !== 'none';
  const payMinor = paying ? BigInt(toMinorStr(payment.amount, currency) ?? '0') : 0n;

  const problems: string[] = [];
  if (!valid) problems.push('Departure must be after arrival');
  if (!pick) problems.push('Choose a room and rate');
  if (guest.name.trim().length < 2) problems.push('Guest name');
  if (guest.phone.trim().length < 7) problems.push('Guest phone');
  if (discountOn && discountMinor > 0n && discount.reason.trim().length < 3) problems.push('Reason for the discount');
  if (discountMinor >= roomsTotal + extrasTotal && discountMinor > 0n) problems.push('Discount is more than the stay');
  if (paying && payMinor <= 0n) problems.push('Payment amount');
  if (paying && payMinor > total) problems.push('Payment is more than the total');

  const create = useMutation({
    mutationFn: () =>
      post<{ id: string; code: string; paymentLink: string | null; paymentError?: string | null }>('/reservations', {
        arrival, departure, adults, children, currency, roomTypeId: pick!.roomTypeId, ratePlanId: pick!.ratePlanId, rooms: pick!.rooms,
        extras: Object.entries(extras).filter(([, n]) => n > 0).map(([extraId, quantity]) => ({ extraId, quantity })),
        guest: { name: guest.name, phone: guest.phone, email: guest.email, country: guest.country || undefined },
        source, confirmNow,
        eta: eta || undefined,
        notes: requests || undefined,
        staffNotes: notes || undefined,
        fromWaitlistId: fromWaitlist ?? undefined,
        discount: discountOn && discountMinor > 0n ? { amount: discountMinor.toString(), reason: discount.reason } : undefined,
        payment: paying && payMinor > 0n ? { amount: payMinor.toString(), method: payment.method, reference: payment.reference || undefined } : undefined,
      }),
    onSuccess: (r) => {
      if (r.paymentError) toast.warning(`${r.code} booked, but the payment was not recorded: ${r.paymentError}`, { duration: 10_000 });
      else toast.success(confirmNow ? `${r.code} confirmed${payMinor > 0n ? ` · ${money(payMinor, currency)} received` : ''}` : `${r.code} held for 24 hours${r.paymentLink ? ' — payment link ready' : ''}`);
      router.replace(confirmNow && arrival <= today && walkIn ? `/reservations/${r.id}?checkin=1` : `/reservations/${r.id}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not create'),
  });

  const submitLabel = walkIn && confirmNow && arrival <= today ? 'Book and go to check-in' : confirmNow ? 'Confirm reservation' : 'Hold and create payment link';

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={walkIn ? [{ label: 'Front desk', href: '/desk' }, { label: 'Walk-in' }] : [{ label: 'Reservations', href: '/reservations' }, { label: 'New' }]}
        title={walkIn ? 'Walk-in' : 'New reservation'}
        description={walkIn ? 'Someone at the desk now. Book tonight, take payment, then check them straight in.' : fromWaitlist ? 'Converting a name from the first-stay list.' : 'For a phone call, a WhatsApp chat or someone at the desk.'}
        actions={!walkIn ? <Button size="sm" href="/reservations/new?walkin=1">Switch to walk-in</Button> : <Button size="sm" href="/reservations/new">Future booking instead</Button>}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_23rem]">
        <div className="grid gap-5">
          {/* 1 — dates and party */}
          <Section title="1 · When and who">
            <div className="mb-4 flex flex-wrap gap-1.5">
              {([
                ['Tonight', today, 1],
                ['Tomorrow', plus(today, 1), 1],
                ['This weekend', weekend, 2],
                ['Next week', plus(today, 7), 2],
              ] as const).map(([l, a, n]) => {
                const on = arrival === a && nights === n;
                return <button key={l} type="button" onClick={() => { setArrival(a); setDeparture(plus(a, n)); }} className={cn('rounded-full border px-3 py-1 text-[12.5px] font-medium transition', on ? 'border-fg bg-fg text-bg' : 'border-line-strong text-fg-muted hover:text-fg')}>{l}</button>;
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_auto_1.2fr_auto_auto_1fr]">
              <TextInput label="Arrival" type="date" value={arrival} min={walkIn ? undefined : today} onChange={(e) => changeArrival(e.target.value)} hint={arrival === today ? 'Today' : dateShort(arrival)} />
              <div className="grid gap-1.5"><span className="label">Nights</span><Stepper value={Math.max(nights, 0)} set={setNights} min={1} max={60} label="nights" /></div>
              <TextInput label="Departure" type="date" value={departure} min={plus(arrival, 1)} onChange={(e) => setDeparture(e.target.value)} error={valid ? undefined : 'After arrival'} hint={valid ? dateShort(departure) : undefined} />
              <div className="grid gap-1.5"><span className="label">Adults</span><Stepper value={adults} set={setAdults} min={1} max={12} label="adults" /></div>
              <div className="grid gap-1.5"><span className="label">Children</span><Stepper value={children} set={setChildren} max={12} label="children" /></div>
              <SelectInput label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as 'UGX' | 'USD')}><option value="UGX">UGX</option><option value="USD">USD</option></SelectInput>
            </div>
          </Section>

          {/* 2 — guest */}
          <Section title="2 · Guest" description={can('guests:read') ? 'Start typing a name or phone — returning guests are found automatically.' : undefined}>
            {known && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-[13px]">
                <UserCheck className="size-4 text-success" />
                <span className="font-medium">Returning guest</span>
                <span className="text-fg-muted">{known.stays} stay{known.stays === 1 ? '' : 's'}{known.lastStay ? ` · last ${dateShort(known.lastStay)}` : ''}{known.nextStay ? ` · next ${dateShort(known.nextStay)}` : ''}</span>
                {known.isVip && <Pill tone="amber"><Crown className="mr-1 inline size-3" />VIP</Pill>}
                {known.tags.map((tg) => <Pill key={tg}>{tg}</Pill>)}
                <button type="button" className="ml-auto inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg" onClick={() => { setKnown(null); setGuest({ name: '', phone: '', email: '', country: '' }); }}><X className="size-3.5" /> Different guest</button>
              </div>
            )}
            <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextInput label="Name" required value={guest.name} onFocus={() => setLookupOpen(true)} onChange={(e) => { setGuest({ ...guest, name: e.target.value }); setKnown(null); setLookupOpen(true); }} autoFocus={walkIn} />
              <TextInput label="Phone" required inputMode="tel" value={guest.phone} onFocus={() => setLookupOpen(true)} onChange={(e) => { setGuest({ ...guest, phone: e.target.value }); setKnown(null); setLookupOpen(true); }} placeholder="07xx… or +256…" />
              <TextInput label="Email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} hint="For the confirmation" />
              <TextInput label="Country" value={guest.country} onChange={(e) => setGuest({ ...guest, country: e.target.value })} placeholder="Uganda" />
              {lookupOpen && !known && matches.length > 0 && (
                <div className="absolute left-0 right-0 top-[4.6rem] z-20 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lg sm:right-1/2">
                  <p className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle"><Search className="size-3" /> Guests on file</p>
                  {matches.map((g) => (
                    <button key={g.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickGuest(g)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                      <span><span className="font-medium">{g.name}</span>{g.isVip && <Crown className="ml-1 inline size-3 text-warning" />}<span className="block text-[12px] text-fg-muted">{[g.phone, g.email].filter(Boolean).join(' · ')}</span></span>
                      <span className="text-right text-[11.5px] text-fg-subtle">{g.stays} stay{g.stays === 1 ? '' : 's'}{g.nextStay ? <span className="block text-warning">booked {dateShort(g.nextStay)}</span> : null}</span>
                    </button>
                  ))}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLookupOpen(false)} className="w-full border-t border-line px-3 py-1.5 text-left text-[12px] text-fg-muted hover:text-fg">New guest — keep typing</button>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectInput label="Booked by" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
              <TextInput label="Expected arrival" value={eta} onChange={(e) => setEta(e.target.value)} placeholder={walkIn ? 'Now' : 'e.g. around 16:00'} />
              <TextArea label="Guest requests" wrapClassName="sm:col-span-2" rows={1} value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Ground floor, extra blanket, vegetarian…" />
              <TextArea label="Notes for the desk (staff only)" wrapClassName="sm:col-span-2 lg:col-span-4" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Company paying, driver waiting, allergies…" />
            </div>
          </Section>

          {/* 3 — room and rate */}
          <Section title="3 · Room and rate" description={q.data ? `${q.data.nights} night${q.data.nights > 1 ? 's' : ''} · ${adults} adult${adults > 1 ? 's' : ''}${children ? ` + ${children} child${children > 1 ? 'ren' : ''}` : ''}` : undefined}>
            {q.isLoading && <Skeleton className="h-40" />}
            {q.isError && <p className="text-[13px] text-danger">Could not load prices. Check the dates.</p>}
            <ul className="grid gap-3">
              {offers.map((o) => (
                <li key={o.roomType.id} className={cn('rounded-2xl border p-4', pick?.roomTypeId === o.roomType.id ? 'border-fg' : 'border-line', o.unavailableReason && 'opacity-60')}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{o.roomType.name.en} <span className="text-[12px] font-normal text-fg-muted">sleeps {o.roomType.sleepsAdults}{o.roomType.sleepsChildren ? ` + ${o.roomType.sleepsChildren}` : ''}</span></p>
                    <p className={cn('text-[12.5px]', o.available <= 1 && !o.unavailableReason ? 'font-medium text-warning' : 'text-fg-muted')}>{o.available} free{o.roomsNeeded > 1 ? ` · party needs ${o.roomsNeeded}` : ''}</p>
                  </div>
                  {o.unavailableReason ? <p className="mt-1 text-[12.5px] text-fg-muted">{o.unavailableReason}</p> : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {o.plans.map((p) => {
                        const on = pick?.roomTypeId === o.roomType.id && pick.ratePlanId === p.ratePlanId;
                        const avg = BigInt(p.totalMinor) / BigInt(o.roomsNeeded) / BigInt(Math.max(1, p.nightly.length));
                        return (
                          <button key={p.ratePlanId} type="button" onClick={() => setPick({ roomTypeId: o.roomType.id, ratePlanId: p.ratePlanId, rooms: on ? pick.rooms : o.roomsNeeded })} className={cn('flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition', on ? 'border-fg bg-surface-2' : 'border-line hover:border-line-strong')}>
                            <span><span className="block text-[13px] font-medium">{p.name.en}</span><span className="text-[12px] text-fg-muted">{p.depositPercent}% deposit · {money(avg, currency)}/night</span></span>
                            <span className="flex items-center gap-2 text-right"><span className="font-semibold tabular">{money(p.totalMinor, currency)}</span>{on && <Check className="size-4" />}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* 4 — extras */}
          {pick && !!q.data?.extras.length && (
            <Section title="4 · Extras" description="Transfers, meals and experiences added to the bill">
              <ul className="grid gap-2 sm:grid-cols-2">
                {q.data.extras.map((e) => (
                  <li key={e.id} className={cn('flex items-center justify-between gap-3 rounded-xl border p-3 text-[13px]', extras[e.id] ? 'border-fg' : 'border-line')}>
                    <span><span className="block font-medium">{e.name.en}</span><span className="text-fg-muted">{money(currency === 'UGX' ? e.price.ugx : e.price.usd, currency)} {e.unit.toLowerCase().replace('_', ' ')}</span></span>
                    <Stepper value={extras[e.id] ?? 0} set={(n) => setExtras({ ...extras, [e.id]: n })} max={20} label={e.name.en ?? 'extra'} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* summary */}
        <aside className="card grid gap-4 p-5 xl:sticky xl:top-20">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Summary</p>
            {valid && <p className="text-[12px] text-fg-muted">{dateShort(arrival)} → {dateShort(departure)}</p>}
          </div>
          {!pick ? <p className="text-[13px] text-fg-muted">Choose a room and rate.</p> : (
            <>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span><span className="font-medium">{offer?.roomType.name.en}</span><span className="block text-[12px] text-fg-muted">{plan?.name.en}</span></span>
                <Stepper value={pick.rooms} set={(n) => setPick({ ...pick, rooms: Math.max(offer!.roomsNeeded, Math.min(n, offer!.available)) })} min={offer!.roomsNeeded} max={offer!.available} label="rooms" />
              </div>
              <dl className="grid gap-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-fg-muted"><button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setShowNightly((v) => !v)}>Rooms · {nights} night{nights > 1 ? 's' : ''} <ChevronDown className={cn('size-3 transition', showNightly && 'rotate-180')} /></button></dt>
                  <dd className="tabular">{money(roomsTotal, currency)}</dd>
                </div>
                {showNightly && plan && (
                  <div className="grid gap-0.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px]">
                    {plan.nightly.map((n) => <div key={n.date} className="flex justify-between text-fg-muted"><span>{dateShort(n.date)}</span><span className="tabular">{money(BigInt(n.amountMinor) * BigInt(pick.rooms), currency)}</span></div>)}
                  </div>
                )}
                {extrasTotal > 0n && <div className="flex justify-between"><dt className="text-fg-muted">Extras</dt><dd className="tabular">{money(extrasTotal, currency)}</dd></div>}
                {discountMinor > 0n && <div className="flex justify-between text-success"><dt>Discount</dt><dd className="tabular">−{money(discountMinor, currency)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><dt>Total</dt><dd className="tabular">{money(total, currency)}</dd></div>
                {plan && <div className="flex justify-between text-[12px] text-fg-muted"><dt>Deposit ({plan.depositPercent}%)</dt><dd className="tabular">{money(depositDue, currency)}</dd></div>}
              </dl>

              {can('payments:refund') && (
                <div className="grid gap-2">
                  <Switch label={<span className="inline-flex items-center gap-1.5"><BadgePercent className="size-3.5" /> Discount</span>} checked={discountOn} onChange={setDiscountOn} />
                  {discountOn && (
                    <div className="grid gap-2 rounded-xl bg-surface-2 p-3">
                      <TextInput label={`Amount off (${currency})`} inputMode="decimal" value={discount.amount} onChange={(e) => setDiscount({ ...discount, amount: e.target.value })} />
                      <div className="-mt-1 flex flex-wrap gap-1">{[5, 10, 15, 20].map((pct) => <button key={pct} type="button" className="rounded-full bg-surface px-2 py-0.5 text-[11.5px] text-fg-muted hover:text-fg" onClick={() => setDiscount({ ...discount, amount: major(((roomsTotal + extrasTotal) * BigInt(pct)) / 100n, currency) })}>{pct}%</button>)}</div>
                      <TextInput label="Why" value={discount.reason} onChange={(e) => setDiscount({ ...discount, reason: e.target.value })} placeholder="Long stay, returning guest, corporate…" />
                    </div>
                  )}
                </div>
              )}

              <Switch label="Confirm now" hint={confirmNow ? 'Rooms are sold now.' : 'Held for 24 hours with a payment link you can send on WhatsApp.'} checked={confirmNow} onChange={setConfirmNow} />

              {confirmNow && can('payments:record') && (
                <div className="grid gap-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium"><HandCoins className="size-3.5" /> Take payment now</p>
                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-line p-0.5 text-[12px]">
                    {([['none', 'Later'], ['deposit', 'Deposit'], ['full', 'Full'], ['other', 'Other']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setPayMode(v)} className={cn('rounded-lg py-1.5 font-medium transition', payMode === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>{l}</button>
                    ))}
                  </div>
                  {payMode !== 'none' && (
                    <div className="grid gap-2 rounded-xl bg-surface-2 p-3">
                      <TextInput label={`Amount (${currency})`} inputMode="decimal" value={payment.amount} onChange={(e) => { setPayment({ ...payment, amount: e.target.value }); setPayMode('other'); }} />
                      <div className="grid grid-cols-2 gap-1">{METHODS.map(([v, l]) => <button key={v} type="button" onClick={() => setPayment({ ...payment, method: v })} className={cn('rounded-lg border py-1.5 text-[12px] font-medium', payment.method === v ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-surface')}>{l}</button>)}</div>
                      {payment.method !== 'CASH' && <TextInput label="Reference" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="MoMo transaction ID…" />}
                      <p className="text-[12px] text-fg-muted">Balance after: <b className="tabular text-fg">{money(total - payMinor > 0n ? total - payMinor : 0n, currency)}</b></p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {problems.length > 0 && pick && (
            <ul className="grid gap-1 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-[12px]">
              {problems.map((p) => <li key={p} className="flex items-center gap-1.5 text-fg-muted"><AlertCircle className="size-3 text-warning" /> {p}</li>)}
            </ul>
          )}
          <Button variant="primary" size="lg" loading={create.isPending} disabled={problems.length > 0} onClick={() => create.mutate()}>{submitLabel}</Button>
        </aside>
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setV(value), ms);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [value, ms]);
  return v;
}

export default function Page() {
  return <Suspense><NewReservation /></Suspense>;
}
