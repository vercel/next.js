module.exports = {
  experimental: { nextUrlServerPrefix: '/my-server-prefix' },
  async rewrites() {
    return [
      {
        source: '/my-server-prefix/:path*',
        destination: '/:path*',
      },
    ]
  },
}
