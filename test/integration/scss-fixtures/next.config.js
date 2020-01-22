module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: { scss: true },
  webpack(cfg) {
    cfg.devtool = 'source-map'
    return cfg
  },
}
