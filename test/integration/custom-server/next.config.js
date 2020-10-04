module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  generateEtags: process.env.GENERATE_ETAGS === 'true',
}
