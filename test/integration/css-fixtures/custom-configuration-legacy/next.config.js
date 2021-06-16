const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  // @zeit/next-css is not supported with webpack 5
  webpack5: false,
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  webpack(cfg) {
    cfg.devtool = 'source-map'
    return cfg
  },
})
