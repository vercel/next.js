module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  webpack(cfg) {
    cfg.devtool = 'source-map'
    return cfg
  },
  productionBrowserSourceMaps: true,
}
