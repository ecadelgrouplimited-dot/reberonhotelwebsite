import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { resolve } from 'node:path';

// One .env for the whole monorepo.
loadEnvConfig(resolve(import.meta.dirname, '../..'), process.env.NODE_ENV !== 'production', { info: () => {}, error: console.error }, true);

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image (traces only what it needs from the monorepo).
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
  // CVs (≤ 5 MB) travel through the careers application action.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  transpilePackages: ['@reberon/contracts', '@reberon/utils'],
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    deviceSizes: [320, 640, 960, 1280, 1920, 2560],
    imageSizes: [96, 160, 240],
    qualities: [75],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The concierge's voice input needs the microphone on this site only (the browser still asks).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          // Only the House may frame the site (live preview in the page builder).
          { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${process.env.ADMIN_URL ?? 'http://localhost:3001'}` },
        ],
      },
    ];
  },
};

export default config;
