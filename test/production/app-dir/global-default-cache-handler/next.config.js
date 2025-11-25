/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  experimental: {
    useCache: true,
  },
  cacheLife: {
    expireNow: {
      stale: 0,
      expire: 0,
      revalidate: 0,
    },
  },
}

module.exports = nextConfig
