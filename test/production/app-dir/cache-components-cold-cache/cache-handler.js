const entries = new Map()

module.exports = class CacheHandler {
  async get(key, context) {
    const entry = entries.get(key) ?? null
    console.log('[cache.get]', {
      key,
      isFallback: context.isFallback,
      hit: entry !== null,
    })
    return entry
  }

  async set(key, value) {
    entries.set(key, { value, lastModified: Date.now() })
  }

  async revalidateTag() {
    entries.clear()
  }

  resetRequestCache() {}
}
