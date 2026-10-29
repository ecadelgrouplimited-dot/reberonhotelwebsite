import type { Metadata } from 'next';
import type { MediaRef, SeoDTO, SiteDTO, LText } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { cleanMediaCaption } from './media-clean';

export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export function buildMetadata(site: SiteDTO, opts: { title?: LText | string; seo?: SeoDTO; path: string; image?: MediaRef | null; media?: Record<string, MediaRef>; description?: string }): Metadata {
  const pageTitle = t(opts.seo?.title) || (typeof opts.title === 'string' ? opts.title : t(opts.title));
  const description = t(opts.seo?.description) || opts.description || t(site.seo.defaultDescription);
  const share = (opts.seo?.shareImageId && opts.media?.[opts.seo.shareImageId]) || opts.image || site.seo.shareImage;
  const shareUrl = share ? share.url.replace(/\/\d+\.webp$/, '/1280.webp') : undefined;
  const isHome = opts.path === '/';
  return {
    metadataBase: new URL(WEB_URL),
    // Already formatted here, so the layout's template must not wrap it a second time.
    title: { absolute: isHome ? site.seo.defaultTitle : site.seo.titleTemplate.replace('%s', pageTitle || site.name) },
    description,
    alternates: { canonical: opts.path },
    robots: opts.seo?.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: pageTitle || site.seo.defaultTitle,
      description,
      url: opts.path,
      locale: 'en_UG',
      images: shareUrl
        ? [
            {
              url: shareUrl,
              width: 1280,
              height: Math.round(1280 * ((share!.height ?? 800) / (share!.width ?? 1280))),
              alt: cleanMediaCaption(null, t(share!.alt)) || pageTitle || site.name,
            },
          ]
        : undefined,
    },
    twitter: { card: 'summary_large_image', title: pageTitle || site.seo.defaultTitle, description, images: shareUrl ? [shareUrl] : undefined },
  };
}

export function hotelJsonLd(site: SiteDTO) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: site.name,
    description: t(site.seo.defaultDescription),
    url: WEB_URL,
    telephone: site.contact.phones[0],
    email: site.contact.email ?? undefined,
    address: { '@type': 'PostalAddress', streetAddress: t(site.contact.address), addressLocality: 'Kapchorwa', addressCountry: 'UG' },
    geo: site.contact.geo ? { '@type': 'GeoCoordinates', latitude: site.contact.geo.lat, longitude: site.contact.geo.lng } : undefined,
    checkinTime: site.checkInTime,
    checkoutTime: site.checkOutTime,
    currenciesAccepted: site.currencies.join(', '),
    image: site.seo.shareImage?.url,
  };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
