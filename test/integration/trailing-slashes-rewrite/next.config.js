module.exports = {
  trailingSlash: true,

  async rewrites() {
    return [
      {
        source: '/:path*/',
        destination: '/:path*/',
      },
      {
        source: '/:path*/',
        destination: 'http://localhost:__EXTERNAL_PORT__/:path*',
      },
    ]
  },
}
