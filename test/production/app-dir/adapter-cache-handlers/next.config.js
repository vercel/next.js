/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  cacheHandler: require.resolve('./incremental-cache-handler.js'),
  cacheHandlers: {
    remote: require.resolve('./use-cache-handler.js'),
  },
  cacheComponents: true,
}

module.exports = nextConfig
