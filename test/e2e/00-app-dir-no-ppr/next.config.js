module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
  },
  rewrites: async () => {
    return [
      {
        source: '/rewritten-to-dashboard',
        destination: '/dashboard',
      },
      {
        source: '/rewritten-to-index',
        destination: '/?fromRewrite=1',
      },
      {
        source: '/to-product/:productId.html',
        destination: '/products/:productId',
      },
      {
        source: '/greedy-rewrite/test-page/:path*',
        destination: '/test-page/:path*',
      },
    ]
  },
}
