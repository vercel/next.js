/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    cacheHandlers: {
      default: require.resolve('./handler.js'),
      legacy: require.resolve('./legacy-handler.js'),
    },
  },
}

module.exports = nextConfig
