const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

module.exports = class CacheHandler extends FileSystemCache {
  async set(key, data, ctx) {
    const normalizedKey = key.replaceAll('\\', '/')
    // The route-tree prefetch can finish regenerating this entry before the
    // first segment prefetch. Keep serving the build-time fallback so the
    // retry-limit test cannot accidentally start with a concrete response.
    if (
      !ctx.fetchCache &&
      (normalizedKey === '/posts/retry-limit' ||
        normalizedKey.endsWith('/$/posts/retry-limit'))
    ) {
      return
    }
    return super.set(key, data, ctx)
  }
}
