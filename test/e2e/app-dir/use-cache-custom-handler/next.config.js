/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler-loader.mjs'),
    'route-aware': require.resolve('./route-aware-handler.js'),
  },
}

module.exports = nextConfig
