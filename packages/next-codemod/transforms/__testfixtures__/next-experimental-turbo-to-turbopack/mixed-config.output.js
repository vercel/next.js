module.exports = {
  experimental: {
    serverActions: true,
    typedRoutes: false,
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
}

module.exports.turbopack.resolveAlias.chai = {
  browser: 'chai/chai.js',
};
