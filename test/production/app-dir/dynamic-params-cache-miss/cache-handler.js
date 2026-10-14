// Model an empty external cache through the public cache-handler interface.
module.exports = class CacheHandler {
  async get(key) {
    console.log('cache lookup', key)
    return null
  }

  async set() {}
  async revalidateTag() {}
  resetRequestCache() {}
}
