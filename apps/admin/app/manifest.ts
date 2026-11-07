import type { MetadataRoute } from 'next';

/** Installable House app: full-screen, own icon, shortcuts on long-press. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'The House · Reberon Hotel',
    short_name: 'The House',
    description: 'Reberon Hotel management — front desk, rooms, POS, money and staff. Works offline.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#F4F5F7',
    theme_color: '#1A1E43',
    categories: ['business', 'productivity', 'travel'],
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
      { src: '/brand/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/badge-96.png', sizes: '96x96', type: 'image/png', purpose: 'monochrome' },
    ],
    shortcuts: [
      { name: 'Front desk', short_name: 'Desk', url: '/desk?source=shortcut', icons: [{ src: '/pwa/maskable-192.png', sizes: '192x192' }] },
      { name: 'Walk-in', short_name: 'Walk-in', url: '/reservations/new?walkin=1', icons: [{ src: '/pwa/maskable-192.png', sizes: '192x192' }] },
      { name: 'POS: Kitchen & Bar', short_name: 'POS', url: '/pos', icons: [{ src: '/pwa/maskable-192.png', sizes: '192x192' }] },
      { name: 'Housekeeping', short_name: 'Rooms', url: '/housekeeping', icons: [{ src: '/pwa/maskable-192.png', sizes: '192x192' }] },
      { name: 'Owner brief', short_name: 'Brief', url: '/brief', icons: [{ src: '/pwa/maskable-192.png', sizes: '192x192' }] },
    ],
  };
}
