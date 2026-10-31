import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { draftMode } from 'next/headers';
import { api, getStaffSession } from '@/lib/api';
import { hotelJsonLd, JsonLd, WEB_URL } from '@/lib/seo';
import { BootScript } from '@/components/site/boot-script';
import { SiteProvider } from '@/components/site/site-provider';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';
import { ActionBar } from '@/components/site/action-bar';
import { EnquirySheet } from '@/components/site/enquiry-sheet';
import { SmoothScroll } from '@/components/site/smooth-scroll';
import { RevealFallback } from '@/components/site/reveal-fallback';
import { PreviewBanner } from '@/components/site/preview-banner';
import { ComingSoonGate, StaffPreviewBar } from '@/components/site/coming-soon-gate';
import { SipiConciergeWidget } from '@/components/concierge/sipi-concierge-widget';
import { t } from '@reberon/contracts';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], axes: ['opsz', 'SOFT'], variable: '--font-fraunces', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap', preload: false });

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e110f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  const site = await api.site();
  return {
    metadataBase: new URL(WEB_URL),
    title: { default: site.seo.defaultTitle, template: site.seo.titleTemplate },
    description: t(site.seo.defaultDescription),
    applicationName: site.name,
    formatDetection: { telephone: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, rooms, draft, staffSession] = await Promise.all([api.site(), api.roomTypes(), draftMode(), getStaffSession()]);
  const isMaintenance = site.features.maintenanceMode ?? true;
  const canViewSite = !isMaintenance || draft.isEnabled || !!staffSession;

  return (
    <html lang="en-UG" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <BootScript />
        <JsonLd data={hotelJsonLd(site)} />
      </head>
      <body>
        <SiteProvider site={site} rooms={rooms}>
          {canViewSite ? (
            <>
              {draft.isEnabled && <PreviewBanner />}
              {isMaintenance && staffSession && <StaffPreviewBar userName={staffSession.name} userEmail={staffSession.email} />}
              <Header />
              <main id="main">{children}</main>
              <Footer site={site} />
              <ActionBar />
              <EnquirySheet />
              <SmoothScroll />
              <RevealFallback />
            </>
          ) : (
            <ComingSoonGate site={site} rooms={rooms} />
          )}
          <SipiConciergeWidget initialStaffUser={staffSession ? { name: staffSession.name, email: staffSession.email } : null} />
        </SiteProvider>
      </body>
    </html>
  );
}
