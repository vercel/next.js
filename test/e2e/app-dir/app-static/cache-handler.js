const cache = new Map()

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options
    this.cache = {}
    console.log('initialized custom cache-handler')
  }

  async get(key) {
    console.log('cache-handler get', key)
    return cache.get(key)
  }

  async set(key, data) {
    console.log('cache-handler set', key)
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })
  }
}
