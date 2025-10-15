/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
    cacheLife: {
      expireNow: {
        stale: 0,
        expire: 0,
        revalidate: 0,
      },
    },
  },
}

module.exports = nextConfig
