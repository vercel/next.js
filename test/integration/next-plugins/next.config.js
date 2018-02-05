const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  cssModules: true
})
