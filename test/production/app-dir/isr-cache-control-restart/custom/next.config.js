module.exports = {
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
}
