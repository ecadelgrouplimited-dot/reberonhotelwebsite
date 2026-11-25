import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, Clock, MapPin, Ticket, Users } from 'lucide-react';
import { t } from '@reberon/contracts';
import { api, orNull } from '@/lib/api';
import { buildMetadata, JsonLd, WEB_URL } from '@/lib/seo';
import { RichText } from '@/components/ui/rich-text';
import { MediaImage } from '@/components/ui/media-image';
import { GalleryGrid } from '@/components/blocks/gallery';
import { EventCard } from '@/components/blocks/life-cards';
import { ShareSheet } from '@/components/site/share-sheet';
import { Countdown } from '@/components/site/countdown';
import { CalendarLinks, RsvpForm } from '@/components/forms/rsvp-form';
import { evAvailability, evCategory, evPrice, evWhen } from '@/lib/life-format';
import { cn } from '@/lib/cn';

export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const res = await api.events().catch(() => null);
  return [...(res?.upcoming ?? []), ...(res?.past ?? [])].map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [site, e] = await Promise.all([api.site(), orNull(api.event(slug))]);
  if (!e) return {};
  return buildMetadata(site, {
    title: e.title,
    seo: e.seo,
    path: `/events/${slug}`,
    image: e.cover,
    description: `${evWhen(e, true)}${e.venue ? ` · ${e.venue}` : ''}. ${e.summary ? t(e.summary) : ''}`.trim(),
  });
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const [site, e] = await Promise.all([api.site(), orNull(api.event(slug))]);
  if (!e) notFound();
  const url = `${WEB_URL}/events/${e.slug}`;
  const avail = evAvailability(e);
  const cancelled = e.status === 'CANCELLED';
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 3 * 3600_000).toISOString();

  // Rich results in search: https://schema.org/Event
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: t(e.title),
    description: e.summary ? t(e.summary) : undefined,
    startDate: e.startsAt,
    endDate: end,
    eventStatus: cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: e.cover ? [e.cover.url.replace(/\/\d+\.webp$/, '/1280.webp')] : undefined,
    url,
    location: {
      '@type': 'Place',
      name: e.venue ?? site.name,
      address: { '@type': 'PostalAddress', streetAddress: e.venueDetail ?? undefined, addressLocality: 'Kapchorwa', addressCountry: 'UG' },
    },
    organizer: { '@type': 'Organization', name: site.name, url: WEB_URL },
    offers: {
      '@type': 'Offer',
      url,
      price: e.priceMinor && e.currency ? (e.currency === 'USD' ? Number(e.priceMinor) / 100 : Number(e.priceMinor)) : 0,
      priceCurrency: e.currency ?? 'UGX',
      availability: e.seatsLeft === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      validFrom: e.startsAt,
    },
  };

  return (
    <article className="pb-24">
      <JsonLd data={ld} />
      <header className="relative isolate overflow-hidden pt-28 md:pt-36">
        {e.cover && (
          <>
            <MediaImage media={e.cover} sizes="100vw" priority className="absolute inset-0 -z-20" />
            <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(14_17_38/.55)_0%,rgb(14_17_38/.82)_70%,var(--bg)_100%)]" aria-hidden />
          </>
        )}
        <div className={cn('container-x pb-14 md:pb-20', e.cover && 'text-white')}>
          <Link href="/events" className={cn('inline-flex items-center gap-2 text-sm', e.cover ? 'text-white/75 hover:text-white' : 'text-fg-muted hover:text-fg')}>
            <ArrowLeft className="size-4" /> All events
          </Link>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className={cn('eyebrow', e.cover && '!text-[#F5B47E]')}>{evCategory(e)}</span>
            {!cancelled && <Countdown startsAt={e.startsAt} endsAt={e.endsAt} />}
          </div>
          <h1 className="mt-4 max-w-4xl text-step-5">{t(e.title)}</h1>
          {e.summary && <p className={cn('mt-5 max-w-2xl text-[1.15rem]', e.cover ? 'text-white/85' : 'text-fg-muted')}>{t(e.summary)}</p>}
          <dl className={cn('mt-8 grid gap-3 text-[1rem] sm:grid-cols-3', e.cover ? 'text-white/90' : '')}>
            <div className="flex items-start gap-3"><Clock className="mt-0.5 size-5 shrink-0" /><div><dt className="sr-only">When</dt><dd>{evWhen(e, true)}</dd></div></div>
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0" /><div><dt className="sr-only">Where</dt><dd>{e.venue ?? site.name}{e.venueDetail && <span className="block text-sm opacity-75">{e.venueDetail}</span>}</dd></div></div>
            <div className="flex items-start gap-3"><Ticket className="mt-0.5 size-5 shrink-0" /><div><dt className="sr-only">Price</dt><dd>{evPrice(e)}{e.priceNote && t(e.priceNote) && <span className="block text-sm opacity-75">{t(e.priceNote)}</span>}</dd></div></div>
          </dl>
        </div>
      </header>

      {cancelled && (
        <div className="container-x">
          <p role="status" className="flex items-center gap-3 rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-5 py-4 text-danger">
            <Ban className="size-5 shrink-0" /> This event has been cancelled. Everyone who booked has been told by email.
          </p>
        </div>
      )}

      <div className="container-x mt-12 grid gap-14 lg:grid-cols-[1fr_26rem] lg:gap-20">
        <div className="min-w-0">
          {e.body && <RichText value={e.body} className="text-[1.1rem]" />}
          {e.gallery.length > 0 && (
            <div className={e.body ? 'mt-12' : ''}>
              <GalleryGrid items={e.gallery} variant="mosaic" />
            </div>
          )}
          <ShareSheet url={url} title={t(e.title)} text={evWhen(e, true)} className={e.body || e.gallery.length ? 'mt-12' : ''} />
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start" id="book">
          <div className="rounded-[var(--r-lg)] border border-line bg-surface p-6 md:p-7">
            {e.rsvpOpen ? (
              <>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-step-2">Book your place</h2>
                  {e.seatsLeft !== null && (
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', avail?.tone === 'bad' ? 'bg-danger/10 text-danger' : avail?.tone === 'warn' ? 'bg-[#FDF0E4] text-[#9A4A0C]' : 'bg-surface-2 text-fg-muted')}>
                      <Users className="size-4" /> {e.seatsLeft === 0 ? 'Full' : `${e.seatsLeft} left`}
                    </span>
                  )}
                </div>
                <RsvpForm e={e} webUrl={WEB_URL} />
              </>
            ) : (
              <div className="grid gap-4">
                <h2 className="text-step-2">{cancelled ? 'Cancelled' : e.past ? 'This event has happened' : 'Booking is closed'}</h2>
                <p className="text-fg-muted">
                  {cancelled
                    ? 'We hope to see you at another evening soon.'
                    : e.past
                      ? 'Thank you to everyone who came. See what is coming up next.'
                      : 'Places are not being taken online for this one. Ask us — we may still fit you in.'}
                </p>
                <Link href={e.past || cancelled ? '/events' : '/contact'} className="btn">
                  <span className="btn-label">{e.past || cancelled ? 'See upcoming events' : 'Contact us'}</span>
                </Link>
              </div>
            )}
            {!e.past && !cancelled && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-3 text-sm text-fg-muted">Add it to your calendar</p>
                <CalendarLinks e={e} webUrl={WEB_URL} />
              </div>
            )}
          </div>
          <p className="mt-4 text-sm text-fg-subtle">Staying the night? <Link href="/rooms" className="underline underline-offset-4 hover:text-fg">See the rooms</Link> and make a night of it.</p>
        </aside>
      </div>

      {e.more.length > 0 && (
        <section className="container-x mt-24" aria-labelledby="more-events">
          <h2 id="more-events" className="mb-8 text-step-3">Also coming up</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {e.more.map((m, i) => (
              <EventCard key={m.id} e={m} i={i} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
