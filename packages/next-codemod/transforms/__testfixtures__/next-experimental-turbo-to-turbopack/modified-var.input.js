// CommonJS configuration with variable declaration and modification
const config = {
  experimental: {
    turbo: {
      resolveAlias: {
        underscore: 'lodash',
      },
      memoryLimit: 4096,
    },
    typedRoutes: true,
  },
};

// Add additional configuration before export
config.images = {
  formats: ['image/avif', 'image/webp']
};

// Add more to turbo config
config.experimental.turbo.sourceMaps = true;

module.exports = config;
