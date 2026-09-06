const cache = new Map()
const isEven = require('is-even')

module.exports = class CacheHandler {
  constructor() {
    console.log('initialized custom cache-handler: ', isEven(3))
  }

  async get(key, ctx) {
    console.log('cache-handler get', key, ctx)

    if (ctx.softTags?.some((tag) => tag.includes('?'))) {
      throw new Error(`invalid soft tag found should only be pathname`)
    }
    return cache.get(key)
  }

  async set(key, data, ctx) {
    console.log('cache-handler set', key, ctx)
    cache.set(key, {
      value: data,
      lastModified: Date.now(),
    })
  }
}
