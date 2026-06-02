/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    expireNow: {
      stale: 0,
      revalidate: 0,
      expire: 0,
    },
  },
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
