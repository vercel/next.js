module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  redirects() {
    return [
      {
        source: '/redirect/me/to-about/:lang',
        destination: '/:lang/about',
        permanent: false,
      },
    ]
  },
}
