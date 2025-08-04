import type { NextConfig } from 'next';

const config: NextConfig = {
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
    // Removed serverActions due to TypeScript compatibility
    typedRoutes: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default config;
