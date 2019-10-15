module.exports = {
  target: 'serverless',
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  // make sure error isn't thrown from empty publicRuntimeConfig
  publicRuntimeConfig: {}
}
