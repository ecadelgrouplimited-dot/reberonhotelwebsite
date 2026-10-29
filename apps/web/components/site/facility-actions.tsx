'use client';
import { ArrowRight, Bed, MessageCircle, Phone, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { whatsappLink } from '@reberon/utils';
import { useSite } from './site-provider';
import type { FacilityFeatureData } from '@/lib/facility-features';

export function FacilityActions({
  facilityName,
  facilitySlug,
  isComingSoon,
  features,
}: {
  facilityName: string;
  facilitySlug: string;
  isComingSoon: boolean;
  features: FacilityFeatureData;
}) {
  const { site, openEnquiry } = useSite();

  const phone = site.contact.phones?.[0] ?? '+256 768 262409';
  const wa = site.contact.whatsapp ?? phone;

  function handleOpenEnquiry() {
    openEnquiry({
      intent: features.ctaIntent,
      roomName: facilityName,
    });
  }

  return (
    <div className="rounded-[var(--r-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
      {/* Header status */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <span className="eyebrow block text-[0.7rem] uppercase tracking-widest">
            {features.badge || (isComingSoon ? 'Being Built' : 'Guest Amenity')}
          </span>
          <h3 className="mt-1 font-display text-xl">{facilityName}</h3>
        </div>
        <span
          className={`size-3 rounded-full ${
            isComingSoon ? 'bg-[#cf8f2e] animate-pulse' : 'bg-emerald-500'
          }`}
          title={isComingSoon ? 'Being built' : 'Available now'}
        />
      </div>

      {/* Note / Promise */}
      {features.note && (
        <p className="mt-4 text-xs leading-relaxed text-fg-muted">
          {features.note}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-6 grid gap-3">
        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleOpenEnquiry}
          className="btn w-full justify-center shadow-md cursor-pointer"
        >
          <Send className="size-4" />
          <span>{features.ctaLabel}</span>
        </button>

        {/* WhatsApp Concierge Action */}
        {wa && (
          <a
            href={whatsappLink(wa, features.whatsappText)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            <MessageCircle className="size-4" />
            <span>Chat on WhatsApp</span>
          </a>
        )}

        {/* Phone Call Hotline */}
        <a
          href={`tel:${phone.replace(/\s+/g, '')}`}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-fg transition hover:border-line-strong hover:bg-surface-2"
        >
          <Phone className="size-4 text-brand" />
          <span>Call Front Desk ({phone})</span>
        </a>
      </div>

      {/* Room link teaser */}
      <div className="mt-6 rounded-2xl border border-line bg-surface-2/60 p-4 text-xs">
        <div className="flex items-center gap-2 font-medium text-fg">
          <Bed className="size-4 text-brand" />
          <span>Planning an overnight stay?</span>
        </div>
        <p className="mt-1 text-fg-muted">
          Pair {facilityName.toLowerCase()} with one of our high-altitude escarpment suites.
        </p>
        <Link
          href="/rooms"
          className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
        >
          <span>Explore Sanctuary Rooms</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
