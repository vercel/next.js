const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

const REJECT_REVALIDATION = Symbol.for('next.test.reject-revalidation')

module.exports = class IncrementalCacheHandler extends FileSystemCache {
  async revalidateTag(tags, durations) {
    if (tags.includes('reject-after-headers')) {
      return new Promise((_, reject) => {
        globalThis[REJECT_REVALIDATION] = () => {
          delete globalThis[REJECT_REVALIDATION]
          reject(new Error('revalidation failed after headers'))
        }
      })
    }
    return super.revalidateTag(tags, durations)
  }
}
