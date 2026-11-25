import Link from 'next/link';
import type { Metadata } from 'next';
import { t } from '@reberon/contracts';
import { rsvpByToken } from '@/lib/api';
import { evWhen } from '@/lib/life-format';
import { CancelRsvpButton } from './cancel-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your event booking', robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { CONFIRMED: 'Confirmed', WAITLISTED: 'On the waiting list', CANCELLED: 'Cancelled', ATTENDED: 'Attended — thank you for coming' };

export default async function ManageRsvp({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const r = token ? await rsvpByToken(token) : null;
  return (
    <section className="container-x max-w-2xl pb-24 pt-32 md:pt-40">
      <p className="eyebrow">Your event booking</p>
      {!r ? (
        <>
          <h1 className="mt-4 text-step-4">We could not find that booking</h1>
          <p className="mt-4 text-fg-muted">The link may be incomplete. Open it again from your confirmation email, or contact us with your reference.</p>
          <Link href="/events" className="btn mt-8"><span className="btn-label">See events</span></Link>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-step-4">{t(r.event.title)}</h1>
          <dl className="mt-8 grid gap-4 rounded-[var(--r-lg)] border border-line bg-surface p-6">
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">Name</dt><dd className="font-medium">{r.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">When</dt><dd className="text-right font-medium">{evWhen(r.event, true)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">Places</dt><dd className="font-medium">{r.partySize}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">Reference</dt><dd className="font-mono font-semibold">{r.code}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-fg-muted">Status</dt><dd className="font-semibold">{r.event.status === 'CANCELLED' ? 'The event is cancelled' : STATUS[r.status]}</dd></div>
          </dl>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={`/events/${r.event.slug}`} className="btn btn-secondary"><span className="btn-label">See the event</span></Link>
            {r.canCancel && token && <CancelRsvpButton token={token} waiting={r.status === 'WAITLISTED'} />}
          </div>
        </>
      )}
    </section>
  );
}
