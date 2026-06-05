module.exports = {
  rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/:path*',
      },
      {
        source: '/:path*(/?(?!.html))',
        destination: '/category/:path*',
      },
    ]
  },
}
