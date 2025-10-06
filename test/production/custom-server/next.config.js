/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
    cacheHandlers: {
      default: require.resolve('./cache-handler.js'),
    },
  },
}

module.exports = nextConfig
