/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
  experimental: {
    useCacheTimeout: 5,
  },
}

module.exports = nextConfig
