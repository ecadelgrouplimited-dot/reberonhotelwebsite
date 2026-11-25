'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Check as CheckIcon, Hourglass, LoaderCircle, Minus, Plus } from 'lucide-react';
import { t, type EventDetailDTO } from '@reberon/contracts';
import { formatMoney, type Currency } from '@reberon/utils';
import { submitRsvp, type FormState } from '@/app/actions';
import { Check, Field, Honeypot, TextArea } from './fields';
import { useIdempotencyKey } from './use-idempotency';

const initial: FormState = { status: 'idle' };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function googleCalendarUrl(e: Pick<EventDetailDTO, 'title' | 'startsAt' | 'endsAt' | 'venue' | 'summary' | 'slug'>, webUrl: string) {
  const s = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 3 * 3600_000).toISOString();
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: t(e.title),
    dates: `${s(e.startsAt)}/${s(end)}`,
    details: `${e.summary ? `${t(e.summary)}\n\n` : ''}${webUrl}/events/${e.slug}`,
    location: `${e.venue ?? 'Reberon Hotel'}, Kapchorwa, Uganda`,
    ctz: 'Africa/Kampala',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function CalendarLinks({ e, webUrl }: { e: EventDetailDTO; webUrl: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn btn-secondary" href={googleCalendarUrl(e, webUrl)} target="_blank" rel="noopener noreferrer">
        <CalendarPlus className="size-4" /> <span className="btn-label">Google Calendar</span>
      </a>
      <a className="btn btn-secondary" href={`${API}/v1/public/events/${e.slug}/calendar.ics`}>
        <CalendarPlus className="size-4" /> <span className="btn-label">Apple / Outlook (.ics)</span>
      </a>
    </div>
  );
}

/** Book places: party size with a live total, contact, consent. Full events go to the waiting list. */
export function RsvpForm({ e, webUrl }: { e: EventDetailDTO; webUrl: string }) {
  const [state, action, pending] = useActionState(submitRsvp.bind(null, e.slug), initial);
  const key = useIdempotencyKey();
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  const max = Math.max(1, e.maxPartySize);
  // Start with what still fits (2 by default), so nobody lands on the waiting list by accident.
  const [party, setParty] = useState(() => Math.max(1, Math.min(max, Number(v.partySize) || Math.min(2, e.seatsLeft || 2))));
  const full = e.seatsLeft !== null && e.seatsLeft === 0;
  const willWait = e.seatsLeft !== null && party > e.seatsLeft;
  const total = e.priceMinor && e.currency && e.priceMinor !== '0' ? formatMoney(BigInt(e.priceMinor) * BigInt(party), e.currency as Currency).replace(/\.00$/, '') : null;

  if (state.status === 'success' && state.reference) {
    const waiting = state.data?.rsvpStatus === 'WAITLISTED';
    return (
      <div role="status" aria-live="polite" className="fade-up grid gap-5 rounded-[var(--r-lg)] border border-line bg-surface p-6 text-center md:p-8">
        <span className={`mx-auto grid size-14 place-items-center rounded-full ${waiting ? 'bg-[#FDF0E4] text-[#9A4A0C]' : 'bg-moss-700 text-mist-50'}`}>{waiting ? <Hourglass className="size-6" /> : <CheckIcon className="size-7" strokeWidth={1.8} />}</span>
        <div>
          <h3 className="text-step-2">{waiting ? 'You are on the waiting list' : 'You are booked — see you there!'}</h3>
          <p className="mx-auto mt-2 max-w-sm text-fg-muted">
            {waiting
              ? 'If places free up we confirm them in the order people joined, and tell you straight away.'
              : `${state.data?.partySize ?? ''} place${state.data?.partySize === '1' ? '' : 's'} held for ${t(e.title)}.${state.data?.email ? ' A confirmation with a calendar invite is on its way to your email.' : ''}`}
          </p>
        </div>
        <p className="text-sm text-fg-subtle">
          Your reference <span className="ml-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-base font-semibold tracking-wider text-fg">{state.reference}</span>
        </p>
        {!waiting && <div className="justify-self-center"><CalendarLinks e={e} webUrl={webUrl} /></div>}
        {state.data?.manageUrl && (
          <Link href={state.data.manageUrl.replace(/^https?:\/\/[^/]+/, '')} className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
            Change of plans? Manage your booking
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="relative grid gap-5" noValidate>
      <Honeypot />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="partySize" value={party} />
      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="field">
        <span className="text-sm font-medium" id="party-label">How many people?</span>
        <div className="flex items-center gap-4" role="group" aria-labelledby="party-label">
          <button type="button" className="grid size-11 place-items-center rounded-full border border-line-strong hover:border-fg disabled:opacity-40" onClick={() => setParty((p) => Math.max(1, p - 1))} disabled={party <= 1} aria-label="One fewer">
            <Minus className="size-4" />
          </button>
          <output className="min-w-10 text-center font-display text-step-3 tabular-nums" aria-live="polite">{party}</output>
          <button type="button" className="grid size-11 place-items-center rounded-full border border-line-strong hover:border-fg disabled:opacity-40" onClick={() => setParty((p) => Math.min(max, p + 1))} disabled={party >= max} aria-label="One more">
            <Plus className="size-4" />
          </button>
          {total && <span className="ml-auto text-right text-sm text-fg-muted">Total <span className="block text-base font-semibold text-fg">{total}</span>paid at the event</span>}
        </div>
        {err.partySize && <p className="error">{err.partySize}</p>}
        {(full || willWait) && (
          <p className="hint text-accent">{full ? 'This event is full — you will join the waiting list.' : `Only ${e.seatsLeft} place${e.seatsLeft === 1 ? '' : 's'} left — this booking will join the waiting list.`}</p>
        )}
      </div>
      <Field label="Your name" name="name" required autoComplete="name" defaultValue={v.name} error={err.name} />
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={err.email} hint="For your confirmation and calendar invite" />
        <Field label="Phone or WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" defaultValue={v.phone} error={err.phone} />
      </div>
      <TextArea label="Anything we should know? (optional)" name="notes" rows={2} placeholder="Dietary needs, accessibility, a celebration…" defaultValue={v.notes} error={err.notes} />
      <Check name="consent" required error={err.consent} label={<>I agree that Reberon Hotel may use these details to manage my booking for this event. <Link href="/legal/privacy" className="underline">Privacy</Link></>} />
      <button type="submit" className="btn btn-lg w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
        <span className="btn-label">{full || willWait ? 'Join the waiting list' : `Book ${party} place${party === 1 ? '' : 's'}`}</span>
      </button>
    </form>
  );
}
