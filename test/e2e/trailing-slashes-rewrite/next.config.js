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
        destination: `http://localhost:${process.env.EXTERNAL_PORT}/:path*`,
      },
    ]
  },
}
