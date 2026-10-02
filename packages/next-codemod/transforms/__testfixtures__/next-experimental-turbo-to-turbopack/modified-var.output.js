// CommonJS configuration with variable declaration and modification
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

// Add additional configuration before export
config.images = {
  formats: ['image/avif', 'image/webp']
};

// Add more to turbo config
config.experimental.turbopackSourceMaps = true;

module.exports = config;
