// CommonJS with object property assignment
const config = {
  experimental: {
    typedRoutes: true
  },

  turbopack: {
    resolveAlias: {
      underscore: 'lodash',
    }
  }
};

// Add properties to the turbo object
config.turbopack.resolveAlias.foo = 'bar';
config.experimental.turbopackMinify = true;
config.experimental.turbopackMemoryLimit = 4096;

// Add regular property
config.images = {
  formats: ['image/avif', 'image/webp'],
};

module.exports = config;
