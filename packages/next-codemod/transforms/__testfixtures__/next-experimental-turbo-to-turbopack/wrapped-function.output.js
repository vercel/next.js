// Next.js config with wrapper function
const nextConfig = {
  experimental: {
    typedRoutes: true,
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

// Wrapper function
const withMDX = require("@next/mdx")();
module.exports = withMDX(nextConfig);
