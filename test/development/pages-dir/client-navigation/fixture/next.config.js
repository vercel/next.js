module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: {
    strictNextHead: process.env.TEST_STRICT_NEXT_HEAD !== 'false',
  },
}
