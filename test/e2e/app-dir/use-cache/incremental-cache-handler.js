const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

module.exports = class IncrementalCacheHandler extends FileSystemCache {
  async set(key, data, ctx) {
    if (ctx.fetchCache) {
      console.log('cache-handler set fetch cache', ctx.fetchUrl)
    }

    return super.set(key, data, ctx)
  }
}
