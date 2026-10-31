const helper = require('./incremental-cache-helper.js')

module.exports = class IncrementalCacheHandler {
  constructor() {
    helper()
  }

  async get() {
    return null
  }

  async set() {}
}
