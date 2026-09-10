/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    variants: true,
    collapseAdapterRoutes: process.env.COLLAPSE_ADAPTER_ROUTES === '1',
  },
  adapterPath: require.resolve('./my-adapter.mjs'),
  // A rewrite in each phase, so the test can check that none of them matches
  // the pathname a rejected request is rewritten to.
  async rewrites() {
    return {
      beforeFiles: [{ source: '/before/:path*', destination: '/concrete' }],
      afterFiles: [{ source: '/after/:path*', destination: '/concrete' }],
      fallback: [{ source: '/:path*', destination: '/concrete' }],
    }
  },
}

module.exports = nextConfig
