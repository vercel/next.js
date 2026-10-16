/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler-loader.mjs'),
  },
}

module.exports = nextConfig
