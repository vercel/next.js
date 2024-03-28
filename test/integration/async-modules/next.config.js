module.exports = {
  webpack: (config) => {
    config.experiments = config.experiments || {}
    config.experiments.topLevelAwait = true
    return config
  },
  experimental: {
    amp: {
      validator: require.resolve('../../lib/amp-validator-wasm.js'),
    },
  },
}
