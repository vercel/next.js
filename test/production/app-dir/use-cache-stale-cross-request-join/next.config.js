/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandlers: {
    default: require.resolve('./cache-handler.js'),
  },
}

module.exports = nextConfig
