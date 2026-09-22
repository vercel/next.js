module.exports = {
  cacheComponents: true,
  cacheHandlers: {
    stale: require.resolve('./stale-cache-handler.js'),
  },
}
