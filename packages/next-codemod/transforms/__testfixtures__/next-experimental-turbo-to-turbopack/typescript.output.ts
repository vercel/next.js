import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    // Removed serverActions due to TypeScript compatibility
    typedRoutes: true,

    turbopackMemoryLimit: 4096,
    turbopackMinify: true,
    turbopackTreeShaking: false,
    turbopackSourceMaps: true
  },

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  turbopack: {
    resolveAlias: {
      underscore: 'lodash',
      mocha: { browser: 'mocha/browser-entry.js' },
    }
  }
};

export default config;
