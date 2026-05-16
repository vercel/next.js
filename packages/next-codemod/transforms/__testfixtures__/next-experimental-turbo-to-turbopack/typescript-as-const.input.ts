import type { NextConfig } from 'next';

const config = {
  experimental: {
    turbo: {
      resolveAlias: {
        underscore: 'lodash',
        mocha: { browser: 'mocha/browser-entry.js' },
      },
      memoryLimit: 4096,
      minify: true,
      treeShaking: false,
      sourceMaps: true,
    },
    typedRoutes: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
} as const;

export default config;
