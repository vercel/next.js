/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: { clientSegmentCache: true },
  async rewrites() {
    return [
      {
        source: '/rewrite-to-page-with-dynamic-head',
        destination: '/page-with-dynamic-head',
      },
      {
        source: '/rewrite-to-page-with-runtime-prefetchable-head',
        destination: '/page-with-runtime-prefetchable-head',
      },
    ]
  },
}

module.exports = nextConfig
