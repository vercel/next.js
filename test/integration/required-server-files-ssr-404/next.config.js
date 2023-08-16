module.exports = {
  rewrites() {
    return [
      {
        source: '/some-catch-all/:path*',
        destination: '/',
      },
    ]
  },
}
