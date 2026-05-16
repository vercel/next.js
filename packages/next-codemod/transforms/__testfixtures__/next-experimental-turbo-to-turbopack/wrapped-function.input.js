// Next.js config with wrapper function
const nextConfig = {
  experimental: {
    turbo: {
      resolveAlias: {
        underscore: 'lodash',
        mocha: { browser: 'mocha/browser-entry.js' },
      },
      memoryLimit: 4096,
      minify: true,
      treeShaking: false,
      sourceMaps: true
    },
    typedRoutes: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

// Wrapper function
const withMDX = require("@next/mdx")();
module.exports = withMDX(nextConfig);
