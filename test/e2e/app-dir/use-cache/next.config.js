/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    useCache: true,
    cacheLife: {
      frequent: {
        stale: 19,
        revalidate: 100,
        expire: 250,
      },
    },
    cacheHandlers: {
      custom: require.resolve('next/dist/server/lib/cache-handlers/default'),
    },
  },
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

module.exports = nextConfig
