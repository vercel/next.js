module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
}
