// CommonJS with object property assignment
const config = {
  experimental: {
    turbo: {
      resolveAlias: {
        underscore: 'lodash',
      }
    },
    typedRoutes: true,
  },
};

// Add properties to the turbo object
config.experimental.turbo.resolveAlias.foo = 'bar';
config.experimental.turbo.minify = true;
config.experimental.turbo.memoryLimit = 4096;

// Add regular property
config.images = {
  formats: ['image/avif', 'image/webp'],
};

module.exports = config;
