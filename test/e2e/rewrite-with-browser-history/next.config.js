module.exports = {
  rewrites() {
    return [
      {
        source: '/:pagePrefix/:path*',
        destination: '/dynamic-page/:pagePrefix/:path*',
      },
    ]
  },
}
