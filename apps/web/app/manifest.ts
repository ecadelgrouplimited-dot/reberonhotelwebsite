import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reberon Hotel, Kapchorwa — Stay In Comfort, Leave With Memories',
    short_name: 'Reberon Hotel',
    description: 'Highland Luxury Sanctuary in Kapchorwa on the northern shoulder of Mount Elgon, Uganda.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4F5F7',
    theme_color: '#1A1E43',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { src: '/brand/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { src: '/brand/icon-128x128.png', sizes: '128x128', type: 'image/png' },
      { src: '/brand/icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { src: '/brand/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { src: '/brand/icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { src: '/brand/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-384x384.png', sizes: '384x384', type: 'image/png' },
      { src: '/brand/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
