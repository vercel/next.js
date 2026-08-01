/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./throwing-cache-handler.js'),
  },
}

module.exports = nextConfig
