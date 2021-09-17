module.exports = {
  // target: 'experimental-serverless-trace',
  webpack: (config) => {
    config.experiments = {
      topLevelAwait: true,
    }
    return config
  },
}
