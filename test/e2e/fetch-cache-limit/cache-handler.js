const cache = new Map()

module.exports = class CacheHandler {
  constructor(options) {
    this.cache = {}
    this.options = options
  }

  async get(key) {
    return cache.get(key)
  }

  async set(key, data) {
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })
  }
}
