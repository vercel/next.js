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
    // The file-backed remote handler does not support concurrent writers.
    cpus: 1,
    durableUseCacheEntries:
      process.env.DURABLE_USE_CACHE_ENTRIES === '1' ? true : undefined,
  },
}

module.exports = nextConfig
