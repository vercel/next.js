module.exports = class CacheHandler {
  // Deliberately scoped to the instance: recreating the incremental cache for
  // every scheduling step would lose entries between chunks.
  cache = new Map()

  async get(key) {
    return this.cache.get(key)
  }

  async set(key, value, ctx) {
    if (ctx.fetchCache) {
      console.log('adaptive-ppr fetch cache fill', ctx.fetchUrl)
    }
    this.cache.set(key, { value, lastModified: Date.now() })
  }
}
