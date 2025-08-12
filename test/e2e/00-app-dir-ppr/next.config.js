module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    ppr: true,
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
        source: '/greedy-rewrite/test-page/:path*',
        destination: '/test-page/:path*',
      },
    ]
  },
}
