module.exports = {
  webpack(config, { isServer, dev }) {
    if (!isServer && dev) {
      config.experiments.lazyCompilation = true
    }
    return config
  },
}
