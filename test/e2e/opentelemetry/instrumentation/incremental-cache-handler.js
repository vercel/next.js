const {
  default: FileSystemCache,
} = require('next/dist/server/lib/incremental-cache/file-system-cache')

module.exports = class IncrementalCacheHandler extends FileSystemCache {
  async revalidateTag(tags, durations) {
    if (tags.includes('reject-after-headers')) {
      throw new Error('revalidation failed after headers')
    }
    return super.revalidateTag(tags, durations)
  }
}
