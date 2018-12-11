module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  useFileSystemPublicRoutes: false,
  contentSecurityPolicy: "default-src 'none'; script-src 'self'; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src 'self';img-src 'self';",
  exportPathMap () {
    return {
      '/exportpathmap-route': {page: '/exportpathmap-route'}
    }
  }
}
