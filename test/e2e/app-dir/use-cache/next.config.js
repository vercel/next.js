/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
    cacheLife: {
      frequent: {
        stale: 19,
        revalidate: 100,
        expire: 300,
      },
    },
    cacheHandlers: {
      custom: require.resolve(
        'next/dist/server/lib/cache-handlers/default.external'
      ),
    },
  },
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

module.exports = nextConfig
