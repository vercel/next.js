const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: {
    css: true,
  },
  webpack(cfg) {
    cfg.devtool = 'source-map'
    return cfg
  },
})
