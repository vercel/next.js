module.exports = {
  useFileSystemPublicRoutes: false,
  async rewrites() {
    return [
      { source: '/mapped', destination: '/secret' },
      { source: '/mapped-catalog/:path*', destination: '/catalog/:path*' },
    ]
  },
}
