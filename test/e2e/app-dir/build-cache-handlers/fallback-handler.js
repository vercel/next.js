const {
  createDefaultCacheHandler,
} = require('next/dist/server/lib/cache-handlers/default')
const handler = createDefaultCacheHandler(50 * 1024 * 1024)

module.exports = {
  ...handler,
  async get(key, softTags) {
    globalThis.__testCacheHandler = 'fallback'
    return handler.get(key, softTags)
  },
}
