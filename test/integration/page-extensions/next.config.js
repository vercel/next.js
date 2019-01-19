const withTypescript = require('@zeit/next-typescript')
module.exports = withTypescript({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  }
})
