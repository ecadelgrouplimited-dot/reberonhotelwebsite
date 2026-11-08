import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { resolve, join, relative, sep } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

loadEnvConfig(resolve(import.meta.dirname, '../..'), process.env.NODE_ENV !== 'production', { info: () => {}, error: console.error }, true);

const API = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Every signed-in screen, read from the app folder at build time, so the service worker
 * can save all of them for offline use (new pages are picked up automatically).
 * Dynamic segments get a placeholder id: that copy is the template for any record.
 */
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000000';
function appRoutes() {
  const root = resolve(import.meta.dirname, 'app/(house)');
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'page.tsx') {
        const parts = relative(root, dir).split(sep).filter(Boolean).filter((x) => !/^\(.*\)$/.test(x));
        if (parts.some((x) => x.startsWith('[[...'))) out.add('/' + parts.filter((x) => !x.startsWith('[[...')).join('/'));
        out.add('/' + parts.map((x) => (x.startsWith('[') ? TEMPLATE_ID : x)).join('/'));
      }
    }
  };
  walk(root);
  return [...out].map((r) => (r === '/' ? '/' : r.replace(/\/$/, ''))).sort();
}
const APP_ROUTES = appRoutes();
/** Changes every build so the service worker updates and old caches are dropped. */
const APP_VERSION = process.env.APP_VERSION ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (traces only what it needs from the monorepo).
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@reberon/contracts', '@reberon/utils'],
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION, NEXT_PUBLIC_APP_ROUTES: JSON.stringify(APP_ROUTES), NEXT_PUBLIC_WEB_URL: process.env.WEB_URL ?? 'http://localhost:3000', NEXT_PUBLIC_MEDIA_URL: process.env.MEDIA_PUBLIC_URL ?? 'http://localhost:4000/media' },
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
