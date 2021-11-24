module.exports = {
  // target: 'experimental-serverless-trace',
  webpack: (config, options) => {
    config.experiments = {
      topLevelAwait: true,
    }
    return config
  },
}
