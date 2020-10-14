module.exports = {
  rewrites() {
    return [
      {
        source: '/item/:itemId',
        destination: '/product/[productId]',
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
