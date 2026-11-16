const defaultCacheHandler =
  require('next/dist/server/lib/cache-handlers/default.external').default

module.exports = {
  ...defaultCacheHandler,
  async get(cacheKey, softTags) {
    console.log('generateStaticParams cache tags:', JSON.stringify(softTags))
    return defaultCacheHandler.get(cacheKey, softTags)
  },
}
