const helper = require('./use-cache-helper.js')

/** @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler} */
module.exports = {
  async get() {
    helper()
    return undefined
  },

  async set() {
    helper()
  },

  async refreshTags() {},

  async getExpiration() {
    return Infinity
  },

  async updateTags() {},
}
