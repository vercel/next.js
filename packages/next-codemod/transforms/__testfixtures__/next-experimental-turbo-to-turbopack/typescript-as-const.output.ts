import type { NextConfig } from 'next';

const config = {
  experimental: {
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
} as const;

export default config;
