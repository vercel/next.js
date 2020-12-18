module.exports = {
  rewrites() {
    return [
      {
        source: '/:sector(s1|s2)/product/:productId',
        destination: '/product/:productId',
      },
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
