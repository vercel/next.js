module.exports = {
  useFileSystemPublicRoutes: false,
  async rewrites() {
    return [{ source: '/mapped', destination: '/secret' }]
  },
}
