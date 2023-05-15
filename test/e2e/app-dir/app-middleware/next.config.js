module.exports = {
  webpack(config) {
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };
    return config;
  },
  experimental: {
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
  },
}
