module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  useFileSystemPublicRoutes: false,
  exportPathMap () {
    return {
      '/exportpathmap-route': { page: '/exportpathmap-route' }
    }
  }
}
