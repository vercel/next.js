/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    incrementalCacheHandlerPath: require.resolve('./cache-handler.js'),
  },
}
