/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
  },
  async rewrites() {
    return [
      {
        source: '/rewrite-to-page-with-dynamic-head',
        destination: '/page-with-dynamic-head',
      },
    ]
  },
}

module.exports = nextConfig
