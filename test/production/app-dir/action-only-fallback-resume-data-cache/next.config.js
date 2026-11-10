/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: process.env.TEST_CACHE_HANDLER
    ? {
        default: require.resolve('./cache-handler.js'),
      }
    : undefined,
}

module.exports = nextConfig
