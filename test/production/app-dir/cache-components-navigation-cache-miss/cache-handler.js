const entries = new Map()

module.exports = class CacheHandler {
  async get(key) {
    return entries.get(key) ?? null
  }

  async set(key, value) {
    entries.set(key, { value, lastModified: Date.now() })
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
