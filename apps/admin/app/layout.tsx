import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';
import { FONT_CLASSES } from '@/lib/fonts';
import { typographyBootScript } from '@/lib/typography-boot';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'The House · Reberon Hotel PMS', template: '%s · The House' },
  robots: { index: false, follow: false },
  applicationName: 'The House',
  appleWebApp: { capable: true, title: 'The House', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1A1E43' };

const themeScript = `try{var t=localStorage.getItem('rb-admin-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={FONT_CLASSES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + typographyBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
