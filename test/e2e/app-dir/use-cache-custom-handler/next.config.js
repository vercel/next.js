/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cacheHandlers: {
      default: require.resolve('./handler.js'),
    },
  },
}

module.exports = nextConfig
