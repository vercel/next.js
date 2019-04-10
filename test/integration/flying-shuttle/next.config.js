module.exports = {
  target: 'serverless',
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  experimental: {
    flyingShuttle: true
  }
}
