const store = new Map()

module.exports = class CacheHandler {
  constructor() {
    console.log('custom cache handler loaded')
  }

  async get(key) {
    return store.get(key) ?? null
  }

  async set(key, data, ctx) {
    store.set(key, { value: data, lastModified: Date.now(), tags: ctx.tags })
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
