/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheHandlers: {
    custom: require.resolve(
      'next/dist/server/lib/cache-handlers/default.external'
    ),
    'no-store': require.resolve('./no-store-handler.js'),
  },
  experimental: {
    useCache: true,
  },
  cacheLife: {
    frequent: {
      // >= DYNAMIC_STALE (30s) so the cache is still eligible for the static
      // shell. A shorter stale time would exclude it from static prerenders.
      stale: 30,
      revalidate: 100,
      expire: 300,
    },
    expireNow: {
      stale: 0,
      expire: 0,
      revalidate: 0,
    },
  },
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

module.exports = nextConfig
