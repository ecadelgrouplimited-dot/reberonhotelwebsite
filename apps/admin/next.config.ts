import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { resolve } from 'node:path';

loadEnvConfig(resolve(import.meta.dirname, '../..'), process.env.NODE_ENV !== 'production', { info: () => {}, error: console.error }, true);

const API = process.env.API_URL ?? 'http://localhost:4000';
/** Changes every build so the service worker updates and old caches are dropped. */
const APP_VERSION = process.env.APP_VERSION ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (traces only what it needs from the monorepo).
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@reberon/contracts', '@reberon/utils'],
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION, NEXT_PUBLIC_WEB_URL: process.env.WEB_URL ?? 'http://localhost:3000', NEXT_PUBLIC_MEDIA_URL: process.env.MEDIA_PUBLIC_URL ?? 'http://localhost:4000/media' },
  // Same-origin API: cookies stay first-party, no CORS in the browser.
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${API}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // SAMEORIGIN (not DENY): "Download for offline" opens our own screens in a hidden frame.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default config;
