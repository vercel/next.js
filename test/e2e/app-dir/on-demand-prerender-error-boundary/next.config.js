/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  experimental: {
    useCache: true,
  },
  cacheHandlers: {
    default: require.resolve('./default-cache-handler.js'),
  },
}
