/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
}

module.exports = nextConfig
