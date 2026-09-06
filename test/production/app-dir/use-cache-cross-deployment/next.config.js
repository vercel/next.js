/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
    remote: require.resolve('./handler-remote.js'),
  },
  generateBuildId: process.env.BUILD_ID
    ? async () => {
        return process.env.BUILD_ID
      }
    : undefined,
  experimental: {
    durableUseCacheEntries:
      process.env.DURABLE_USE_CACHE_ENTRIES === '1' ? true : undefined,
  },
}

module.exports = nextConfig
