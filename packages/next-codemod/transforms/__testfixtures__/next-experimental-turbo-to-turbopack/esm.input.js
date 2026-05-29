export default {
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
    serverActions: true,
    typedRoutes: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}
