const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

// Age route entries without changing the timestamps of their cached data.
module.exports = class IncrementalCacheHandler extends FileSystemCache {
  constructor(context) {
    super(context)
    this.requestHeaders = context._requestHeaders
  }

  async get(key, context) {
    const result = await super.get(key, context)
    const offsetHeader = this.requestHeaders?.['x-test-cache-age-offset-ms']
    const offsetMs = typeof offsetHeader === 'string' ? Number(offsetHeader) : 0

    if (result && offsetMs > 0 && context.kind !== 'FETCH') {
      return { ...result, lastModified: result.lastModified - offsetMs }
    }

    return result
  }
}
