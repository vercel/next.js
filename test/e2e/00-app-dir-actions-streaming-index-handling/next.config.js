module.exports = {
  rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/static/:path*',
      },
    ]
  },
}
