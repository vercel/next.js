module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: {
    css: true,
    // Intentionally set false to ensure we force to true.
    granularChunks: false,
  },
  webpack(cfg) {
    cfg.devtool = 'source-map'
    return cfg
  },
}
