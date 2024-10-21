/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    cacheLife: {
      frequent: {
        stale: 19,
        revalidate: 100,
      },
    },
    cacheHandlers: {
      custom: require.resolve('next/dist/server/lib/cache-handlers/default'),
    },
  },
}

module.exports = nextConfig
