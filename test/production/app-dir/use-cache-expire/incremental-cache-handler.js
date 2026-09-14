const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

/**
 * A FileSystemCache variant that lets a test simulate the passage of time by
 * shifting the `lastModified` timestamp of a cached entry into the past. The
 * offset is controlled per-request via the `x-test-cache-age-offset-ms` header
 * so tests can skip over `expire` windows (e.g. 5 minutes) without actually
 * waiting.
 */
module.exports = class IncrementalCacheHandler extends FileSystemCache {
  constructor(ctx) {
    super(ctx)
    this.requestHeaders = ctx._requestHeaders
  }

  async get(key, ctx) {
    const result = await super.get(key, ctx)

    const offsetHeader = this.requestHeaders?.['x-test-cache-age-offset-ms']
    const offsetMs = typeof offsetHeader === 'string' ? Number(offsetHeader) : 0

    if (result && offsetMs > 0 && !ctx.fetchCache) {
      return { ...result, lastModified: result.lastModified - offsetMs }
    }

    return result
  }
}
