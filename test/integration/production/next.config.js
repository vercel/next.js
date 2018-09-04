module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  contentSecurityPolicy: "default-src 'self' https://google.com;"
}
