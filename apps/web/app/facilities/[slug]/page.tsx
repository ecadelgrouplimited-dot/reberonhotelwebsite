import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Compass, Sparkles } from 'lucide-react';
import type { FacilityDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { api, orNull } from '@/lib/api';
import { buildMetadata, JsonLd, WEB_URL } from '@/lib/seo';
import { RichText } from '@/components/ui/rich-text';
import { Icon } from '@/components/ui/icon';
import { MediaImage } from '@/components/ui/media-image';
import { FacilityGallery } from '@/components/site/facility-gallery';
import { FacilityActions } from '@/components/site/facility-actions';
import { getFacilityFeatures } from '@/lib/facility-features';

export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const list = await api.facilities().catch(() => []);
  return list.map((f) => ({ slug: f.slug }));
}

async function getFacilityWithFallback(slug: string): Promise<(FacilityDTO & { related: FacilityDTO[] }) | null> {
  // Try single endpoint first; fallback to all facilities
  const direct = await orNull(api.facility(slug));
  if (direct) return direct;

  const all = await api.facilities().catch(() => []);
  const f = all.find((item) => item.slug.toLowerCase() === slug.toLowerCase());
  if (!f) return null;
  const related = all.filter((item) => item.slug.toLowerCase() !== slug.toLowerCase()).slice(0, 3);
  return { ...f, related };
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [site, facility] = await Promise.all([api.site(), getFacilityWithFallback(slug)]);
  if (!facility) return {};
  const name = t(facility.name);
  const summary = t(facility.summary);
  return buildMetadata(site, {
    title: name,
    path: `/facilities/${slug}`,
    image: facility.media[0] ?? null,
    description: summary,
  });
}

export default async function FacilityPage({ params }: Props) {
  const { slug } = await params;
  const [site, facility] = await Promise.all([api.site(), getFacilityWithFallback(slug)]);
  if (!facility) notFound();

  const name = t(facility.name);
  const summary = t(facility.summary);
  const isComingSoon = facility.status === 'COMING_SOON';
  const features = getFacilityFeatures(facility);
  const photos = facility.media ?? [];

  return (
    <article className="pt-24 md:pt-28 pb-20">
      {/* Schema.org Structured Data */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': slug === 'restaurant' ? 'Restaurant' : slug === 'hall' ? 'EventVenue' : 'CivicStructure',
          name,
          description: summary,
          url: `${WEB_URL}/facilities/${slug}`,
          image: photos[0]?.url,
          containedInPlace: {
            '@type': 'Hotel',
            name: site.name,
            telephone: site.contact.phones[0],
            address: t(site.contact.address),
          },
        }}
      />

      {/* Top Header & Breadcrumbs */}
      <div className="container-x">
        <Link
          href="/facilities"
          className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition"
        >
          <ArrowLeft className="size-4" /> All Facilities
        </Link>

        {/* Hero title bar */}
        <div className="mt-8 flex flex-wrap items-start justify-between gap-6 border-b border-line pb-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-line-strong bg-surface-2 text-brand">
                <Icon name={facility.icon} className="size-5" />
              </span>
              <span className="eyebrow block">
                {features.badge || (isComingSoon ? 'Being Built' : 'Available')}
              </span>
            </div>

            <h1 className="mt-4 text-step-5 font-display font-light text-fg">{name}</h1>
            <p className="mt-4 text-step-1 leading-relaxed text-fg-muted">{summary}</p>

            {/* Quick feature tags */}
            <div className="mt-6 flex flex-wrap gap-2">
              {features.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-xs text-fg-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isComingSoon ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-gold-400/10 px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-gold-500">
                <span className="size-2 rounded-full bg-gold-500 animate-ping" />
                Being Built · Honest Label
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-500" />
                Available for Guests
              </span>
            )}
          </div>
        </div>

        {/* Interactive Photo Gallery */}
        <div className="mt-10">
          <FacilityGallery photos={photos} facilityName={name} />
        </div>
      </div>

      {/* Main Grid: Details, Features & Convertible Sidebar */}
      <div className="container-x mt-16 grid gap-14 lg:grid-cols-[1fr_24rem] lg:gap-20">
        <div>
          {/* Detailed Story / Body */}
          {facility.body ? (
            <section aria-labelledby="facility-detail">
              <h2 id="facility-detail" className="text-step-3 font-display">
                About the {name}
              </h2>
              <div className="mt-6">
                <RichText
                  value={facility.body}
                  className="max-w-2xl text-[1.12rem] leading-relaxed [&>p]:mb-5 [&>p:first-child]:font-display [&>p:first-child]:text-step-2 [&>p:first-child]:leading-snug [&>p:first-child]:text-fg"
                />
              </div>
            </section>
          ) : null}

          {/* Actionable Specifications & Operational Features */}
          <section className="mt-16 border-t border-line pt-12" aria-labelledby="facility-specs">
            <p className="eyebrow">Specifications</p>
            <h2 id="facility-specs" className="mt-2 text-step-3 font-display">
              Key Features &amp; Provisions
            </h2>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.specs.map((spec, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand">
                    <Icon name={spec.icon} className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle font-mono">
                      {spec.label}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-fg">{spec.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Signature Highlights */}
          {features.highlights && features.highlights.length > 0 && (
            <section className="mt-16 border-t border-line pt-12" aria-labelledby="facility-highlights">
              <p className="eyebrow">Highland Sanctuary Standard</p>
              <h2 id="facility-highlights" className="mt-2 text-step-3 font-display">
                What to Expect
              </h2>

              <ul className="mt-6 space-y-3.5">
                {features.highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-fg-muted">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/10 text-brand mt-0.5">
                      <Check className="size-3" />
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Convertible Action Sidebar */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <FacilityActions
            facilityName={name}
            facilitySlug={slug}
            isComingSoon={isComingSoon}
            features={features}
          />
        </aside>
      </div>

      {/* Related Facilities Section */}
      {facility.related && facility.related.length > 0 && (
        <section className="container-x mt-24 border-t border-line pt-16">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Discover More</p>
              <h2 className="mt-2 text-step-3 font-display">Other Facilities at the House</h2>
            </div>
            <Link
              href="/facilities"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              <span>View All Facilities</span>
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {facility.related.map((rel) => {
              const relFeatures = getFacilityFeatures(rel);
              return (
                <Link
                  key={rel.id}
                  href={`/facilities/${rel.slug}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface p-6 transition-all duration-300 hover:border-brand/40 hover:bg-surface-2 hover:shadow-[var(--shadow-lift)]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-brand">
                        <Icon name={rel.icon} className="size-5" />
                      </span>
                      {rel.status === 'COMING_SOON' && (
                        <span className="rounded-full border border-gold-400/50 bg-gold-400/10 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-gold-500">
                          Being built
                        </span>
                      )}
                    </div>

                    <h3 className="mt-5 font-display text-xl text-fg group-hover:text-brand transition">
                      {t(rel.name)}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted line-clamp-2">
                      {t(rel.summary)}
                    </p>

                    {/* Quick Tags */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {relFeatures.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {rel.media[0] && (
                    <div className="mt-6 aspect-[16/9] overflow-hidden rounded-[var(--r-md)] bg-surface-2">
                      <MediaImage
                        media={rel.media[0]}
                        sizes="(min-width: 1024px) 350px, 90vw"
                        className="size-full transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs font-semibold text-brand">
                    <span>Explore Details &amp; Gallery</span>
                    <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
}
