import { Clock, Mail, MapPin, Phone, Plus } from 'lucide-react';
import type { Cta, FaqGroupDTO, LRich, LText, RoomTypeCardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { whatsappLink } from '@reberon/utils';
import { MediaImage } from '@/components/ui/media-image';
import { RichText } from '@/components/ui/rich-text';
import { SectionHeading } from '@/components/ui/section-heading';
import { Contour } from '@/components/ui/contour';
import { WhatsAppGlyph } from '@/components/ui/whatsapp-glyph';
import { CtaButton } from '@/components/site/cta-button';
import { EnquiryForm } from '@/components/forms/enquiry-form';
import { WaitlistForm } from '@/components/forms/waitlist-form';
import { resolveCta } from '@/lib/cta';
import { cn } from '@/lib/cn';
import { MapEmbed } from './map-embed';
import { formatPhone } from '@/lib/format';
import type { BlockProps } from './types';

type H = { eyebrow?: LText; heading?: LText; intro?: LText };

export function Quote({ block, media }: BlockProps<{ text: LText; attribution?: LText; media?: string }>) {
  const img = block.data.media ? media[block.data.media] : null;
  return (
    <figure className={cn('relative isolate overflow-hidden', img ? 'text-mist-50' : '')}>
      {img && (
        <div className="absolute inset-0 -z-10">
          <div className="parallax-slow absolute inset-[-8%_0]">
            <MediaImage media={img} sizes="100vw" className="absolute inset-0" />
          </div>
          <div className="absolute inset-0 bg-basalt-950/60" />
        </div>
      )}
      <div className="container-x py-[clamp(6rem,16vw,12rem)]">
        <blockquote className="mx-auto max-w-5xl text-center">
          <p className="font-display text-step-4 leading-[1.15]" data-reveal style={{ fontStyle: 'italic', fontWeight: 330 }}>
            <span aria-hidden className="text-gold-400">“</span>
            {t(block.data.text)}
            <span aria-hidden className="text-gold-400">”</span>
          </p>
          {t(block.data.attribution) && (
            <figcaption className="mt-8 text-sm uppercase tracking-[0.2em] opacity-80" data-reveal style={{ ['--i' as string]: 2 }}>
              {t(block.data.attribution)}
            </figcaption>
          )}
        </blockquote>
      </div>
    </figure>
  );
}

export function Faq({ block }: BlockProps<H, { group: FaqGroupDTO }>) {
  const g = block.resolved?.group;
  if (!g) return null;
  return (
    <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading ?? g.title} size="md" />
      </div>
      <div className="divide-y divide-line border-y border-line">
        {g.items.map((q, i) => (
          <details key={q.id} className="acc group" data-reveal="fade" style={{ ['--i' as string]: i % 4 }}>
            <summary className="flex cursor-pointer items-start justify-between gap-6 py-6 text-left">
              <span className="text-step-1 font-medium leading-snug">{t(q.question)}</span>
              <span className="acc-icon mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-line-strong group-hover:border-fg">
                <Plus className="size-4" strokeWidth={1.6} />
              </span>
            </summary>
            <div className="pb-7 pr-12">
              <RichText value={q.answer} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function ContactCard({ block, site }: BlockProps<H>) {
  const phone = site.contact.phones[0];
  const tiles = [
    site.contact.whatsapp && { href: whatsappLink(site.contact.whatsapp, 'Hello Reberon Hotel,'), icon: <WhatsAppGlyph className="size-6" />, label: 'WhatsApp', value: formatPhone(site.contact.whatsapp), note: 'Fastest. Voice notes welcome.', external: true },
    phone && { href: `tel:${phone.replace(/\s/g, '')}`, icon: <Phone className="size-6" strokeWidth={1.5} />, label: 'Call', value: formatPhone(phone), note: t(site.contact.hours) },
    site.contact.email && { href: `mailto:${site.contact.email}`, icon: <Mail className="size-6" strokeWidth={1.5} />, label: 'Email', value: site.contact.email, long: true, note: 'For quotes and anything long.' },
    { href: '#map', icon: <MapPin className="size-6" strokeWidth={1.5} />, label: 'Visit', value: t(site.contact.address), long: true, note: `Check-in from ${site.checkInTime}` },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string; value: string; note: string; external?: boolean; long?: boolean }[];
  return (
    <div className="container-x">
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} intro={block.data.intro} className="mb-12" />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((x, i) => (
          <li key={x.label} data-reveal style={{ ['--i' as string]: i }}>
            <a href={x.href} {...(x.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="group flex h-full flex-col rounded-[var(--r-lg)] border border-line bg-surface p-6 transition-all duration-500 hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-soft)]">
              <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-brand transition-colors group-hover:bg-accent group-hover:text-accent-fg">{x.icon}</span>
              <span className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-fg-subtle">{x.label}</span>
              <span className={cn('mt-1 font-medium [overflow-wrap:anywhere]', x.long ? 'text-base leading-snug' : 'text-step-1')}>{x.value}</span>
              <span className="mt-2 text-sm text-fg-muted">{x.note}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-center gap-2 text-sm text-fg-muted">
        <Clock className="size-4" aria-hidden /> {t(site.contact.responsePromise)}
      </p>
    </div>
  );
}

export function MapBlock({ block, site }: BlockProps<H & { directions?: LRich; zoom?: number }>) {
  const geo = site.contact.geo;
  return (
    <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr]" id="map">
      <div>
        <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} size="md" />
        <RichText value={block.data.directions} className="mt-6" />
      </div>
      {geo && <MapEmbed lat={geo.lat} lng={geo.lng} zoom={block.data.zoom ?? 13} label={site.name} />}
    </div>
  );
}

export function FormBlock({ block, kind }: BlockProps<H & { intent?: string; successMessage?: LText }> & { kind: 'enquiry' | 'waitlist' }) {
  const d = block.data;
  return (
    <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20" id={kind === 'enquiry' ? 'enquire' : 'waitlist'}>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <SectionHeading eyebrow={d.eyebrow} heading={d.heading} intro={d.intro} size="md" />
        <Contour className="mt-10 hidden h-24 lg:block" lines={5} seed={kind === 'enquiry' ? 2 : 6} />
      </div>
      <div className="rounded-[var(--r-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-10" data-reveal>
        {kind === 'enquiry' ? <EnquiryForm intent={d.intent} successMessage={t(d.successMessage)} /> : <WaitlistForm successMessage={t(d.successMessage)} />}
      </div>
    </div>
  );
}

export function CtaBand({ block, media, site, ctx }: BlockProps<{ heading: LText; sub?: LText; ctas?: Cta[]; media?: string }>) {
  const img = block.data.media ? media[block.data.media] : null;
  return (
    <div className="container-x">
      <div className={cn('grain relative isolate overflow-hidden rounded-[var(--r-xl)] px-6 py-20 text-center text-mist-50 md:px-16 md:py-28', !img && 'bg-moss-900')}>
        {img && (
          <div className="absolute inset-0 -z-10">
            <div className="parallax-slow absolute inset-[-10%_0]">
              <MediaImage media={img} sizes="100vw" className="absolute inset-0" />
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(18_21_19/.45),rgb(18_21_19/.78))]" />
          </div>
        )}
        <h2 className="mx-auto max-w-3xl text-step-5" data-reveal>{t(block.data.heading)}</h2>
        {t(block.data.sub) && <p className="mx-auto mt-6 max-w-xl text-step-1 text-mist-50/85" data-reveal style={{ ['--i' as string]: 1 }}>{t(block.data.sub)}</p>}
        {!!block.data.ctas?.length && (
          <div className="mt-10 flex flex-wrap justify-center gap-3" data-reveal style={{ ['--i' as string]: 2 }}>
            {block.data.ctas.map((c, i) => (
              <CtaButton key={i} cta={resolveCta(c, site, ctx)} style={c.style} size="lg" className={c.style === 'secondary' ? 'text-mist-50' : undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RichTextBlock({ block }: BlockProps<H & { body: LRich }>) {
  const wide = block.variant === 'wide';
  return (
    <div className={cn('container-x', !wide && 'max-w-[52rem]')}>
      <SectionHeading eyebrow={block.data.eyebrow} heading={block.data.heading} size="md" className="mb-10" />
      <RichText value={block.data.body} />
    </div>
  );
}

export function Spacer({ block }: BlockProps<{ size?: string }>) {
  const h = block.data.size === 'sm' ? 'h-8' : block.data.size === 'lg' ? 'h-32' : 'h-16';
  if (block.variant === 'space') return <div className={h} aria-hidden />;
  return (
    <div className={cn('container-x flex items-center', h)} aria-hidden>
      <Contour className="h-16" lines={4} seed={3} />
    </div>
  );
}

export type { RoomTypeCardDTO };
